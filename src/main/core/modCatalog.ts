import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { BrowserWindow } from 'electron'
import { PATHS } from './paths'
import { log } from './logger'
import { settingsStore } from './store'
import { IPC } from '@shared/ipc'
import { MINECRAFT_MOD_SEEDS, fallbackModCatalog } from '@shared/modCatalog'
import type {
  MinecraftModLoader,
  ModCatalogEntry,
  ModDownloadInput,
  ModDownloadProgress,
  ModInstallRecord,
  ModInstallTarget,
  ModProjectType
} from '@shared/types'

interface ModrinthProject {
  slug: string
  title: string
  description: string
  project_type: ModProjectType
  downloads: number
  followers: number
  icon_url?: string
  license?: { id?: string; name?: string }
  client_side?: ModCatalogEntry['clientSide']
  server_side?: ModCatalogEntry['serverSide']
  loaders?: string[]
  game_versions?: string[]
}

interface ModrinthVersion {
  id: string
  name: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha'
  date_published: string
  loaders: string[]
  game_versions: string[]
  files: Array<{
    url: string
    filename: string
    primary?: boolean
    size?: number
  }>
}

interface ModInstallManifest {
  installs: ModInstallRecord[]
  updatedAt: string
}

const USER_AGENT = 'GameHub/0.1 (local mod catalog)'

export async function listModCatalog(): Promise<ModCatalogEntry[]> {
  const fallback = fallbackModCatalog()
  try {
    const enriched = await Promise.all(
      MINECRAFT_MOD_SEEDS.map(async (seed) => {
        const project = await fetchJson<ModrinthProject>(
          `https://api.modrinth.com/v2/project/${encodeURIComponent(seed.slug)}`
        )
        return {
          id: seed.id,
          title: project.title || seed.title,
          slug: project.slug || seed.slug,
          game: 'minecraft',
          gameTitle: 'Minecraft',
          projectType: project.project_type || seed.projectType,
          category: seed.category,
          rank: seed.rank,
          description: project.description || seed.description,
          source: 'modrinth',
          sourceUrl: `https://modrinth.com/${project.project_type || seed.projectType}/${seed.slug}`,
          iconUrl: project.icon_url,
          downloads: project.downloads,
          followers: project.followers,
          license: project.license?.id ?? project.license?.name,
          clientSide: project.client_side ?? 'unknown',
          serverSide: project.server_side ?? 'unknown',
          loaders: project.loaders ?? seed.preferredLoaders ?? [],
          gameVersions: project.game_versions ?? [],
          featured: seed.featured
        } satisfies ModCatalogEntry
      })
    )
    return enriched.sort((a, b) => a.rank - b.rank)
  } catch (err) {
    log.warn('mods', `catalog enrichment failed, using fallback: ${String(err)}`)
    return fallback
  }
}

export function listInstalledMods(): ModInstallRecord[] {
  return readManifest().installs
}

export async function startModDownload(input: ModDownloadInput): Promise<{ id: string } | { error: string }> {
  const entry = fallbackModCatalog().find((item) => item.id === input.entryId)
  if (!entry) return { error: 'Mod nao encontrado no catalogo.' }

  const id = randomUUID().slice(0, 8)
  void runModDownload(id, input, entry).catch((err) => {
    publish({
      id,
      entryId: input.entryId,
      title: entry.title,
      state: 'failed',
      received: 0,
      speed: 0,
      error: err instanceof Error ? err.message : String(err)
    })
  })
  return { id }
}

async function runModDownload(
  id: string,
  input: ModDownloadInput,
  entry: ModCatalogEntry
): Promise<void> {
  publish({
    id,
    entryId: entry.id,
    title: entry.title,
    state: 'resolving',
    received: 0,
    speed: 0
  })

  const settings = settingsStore.load()
  const loader = input.loader ?? settings.mods.minecraftLoader
  const gameVersion = input.gameVersion ?? settings.mods.minecraftVersion
  const installTarget = input.installTarget ?? settings.mods.installTarget
  const customRoot = input.customInstallRoot ?? settings.mods.customInstallRoot

  const version = await resolveVersion(entry.slug, entry.projectType, loader, gameVersion)
  const file = version.files.find((f) => f.primary) ?? version.files[0]
  if (!file?.url) throw new Error('A versao encontrada nao possui arquivo baixavel.')

  const selectedLoader = pickLoader(version.loaders, entry.projectType, loader)
  const selectedGameVersion = pickGameVersion(version.game_versions, gameVersion)
  const destDir = await resolveInstallDir(
    entry.projectType,
    installTarget,
    customRoot,
    selectedLoader,
    selectedGameVersion
  )
  await mkdir(destDir, { recursive: true })
  const filePath = join(destDir, sanitizeFilename(file.filename))

  let received = 0
  let total = file.size
  let lastEmit = 0
  let lastBytes = 0
  let lastTime = Date.now()
  let speed = 0

  try {
    const response = await fetch(file.url, { headers: { 'User-Agent': USER_AGENT } })
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    total = Number(response.headers.get('content-length')) || total

    const reader = response.body.getReader()
    const stream = createWriteStream(filePath)

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      stream.write(Buffer.from(value))
      received += value.length

      const now = Date.now()
      if (now - lastEmit > 450) {
        const elapsedSec = (now - lastTime) / 1000
        speed = elapsedSec > 0 ? (received - lastBytes) / elapsedSec : 0
        lastBytes = received
        lastTime = now
        lastEmit = now
        publish({
          id,
          entryId: entry.id,
          title: entry.title,
          state: 'downloading',
          received,
          total,
          speed
        })
      }
    }

    stream.end()
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve())
      stream.on('error', reject)
    })

    const size = await stat(filePath)
    const record = upsertInstall({
      id: `${entry.id}:${version.id}`,
      entryId: entry.id,
      title: entry.title,
      slug: entry.slug,
      game: 'minecraft',
      projectType: entry.projectType,
      versionName: version.name,
      versionNumber: version.version_number,
      loader: selectedLoader,
      gameVersion: selectedGameVersion,
      fileName: file.filename,
      filePath,
      sourceUrl: entry.sourceUrl,
      installedAt: new Date().toISOString(),
      installTarget
    })

    publish({
      id,
      entryId: entry.id,
      title: entry.title,
      state: 'finished',
      received: size.size,
      total: size.size,
      speed: 0,
      filePath,
      record
    })
  } catch (err) {
    await unlink(filePath).catch(() => {})
    throw err
  }
}

async function resolveVersion(
  slug: string,
  projectType: ModProjectType,
  loader: MinecraftModLoader,
  gameVersion: string
): Promise<ModrinthVersion> {
  const loaderCandidates = projectType === 'shader' ? ['iris', 'optifine'] : [loader]
  const attempts: Array<{ loaders?: string[]; gameVersions?: string[] }> = [
    {
      loaders: loaderCandidates,
      gameVersions: gameVersion === 'auto' ? undefined : [gameVersion]
    },
    { loaders: loaderCandidates },
    gameVersion === 'auto' ? {} : { gameVersions: [gameVersion] },
    {}
  ]

  for (const attempt of attempts) {
    const versions = await fetchVersions(slug, attempt.loaders, attempt.gameVersions)
    const picked = pickRelease(versions)
    if (picked) return picked
  }

  throw new Error('Nenhuma versao compativel encontrada na Modrinth.')
}

async function fetchVersions(
  slug: string,
  loaders?: string[],
  gameVersions?: string[]
): Promise<ModrinthVersion[]> {
  const params = new URLSearchParams()
  if (loaders?.length) params.set('loaders', JSON.stringify(loaders))
  if (gameVersions?.length) params.set('game_versions', JSON.stringify(gameVersions))
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return fetchJson<ModrinthVersion[]>(
    `https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version${suffix}`
  )
}

function pickRelease(versions: ModrinthVersion[]): ModrinthVersion | null {
  return (
    [...versions]
      .filter((v) => v.files.length > 0)
      .sort((a, b) => {
        const releaseDelta = releaseScore(b.version_type) - releaseScore(a.version_type)
        if (releaseDelta !== 0) return releaseDelta
        return Date.parse(b.date_published) - Date.parse(a.date_published)
      })[0] ?? null
  )
}

function releaseScore(type: ModrinthVersion['version_type']): number {
  if (type === 'release') return 3
  if (type === 'beta') return 2
  return 1
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Modrinth HTTP ${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

async function resolveInstallDir(
  projectType: ModProjectType,
  target: ModInstallTarget,
  customRoot: string,
  loader?: string,
  gameVersion?: string
): Promise<string> {
  const minecraftRoot = join(homedir(), 'AppData', 'Roaming', '.minecraft')
  const root =
    target === 'minecraft'
      ? minecraftRoot
      : target === 'custom' && customRoot.trim()
        ? customRoot.trim()
        : PATHS.mods

  if (target === 'minecraft') {
    if (projectType === 'shader') return join(root, 'shaderpacks')
    if (projectType === 'resourcepack') return join(root, 'resourcepacks')
    if (projectType === 'modpack') return join(PATHS.mods, 'minecraft', 'modpacks')
    return join(root, 'mods')
  }

  if (projectType === 'shader') return join(root, 'minecraft', 'shaderpacks', gameVersion ?? 'auto')
  if (projectType === 'resourcepack') return join(root, 'minecraft', 'resourcepacks', gameVersion ?? 'auto')
  if (projectType === 'modpack') return join(root, 'minecraft', 'modpacks')
  return join(root, 'minecraft', 'mods', loader ?? 'auto', gameVersion ?? 'auto')
}

function pickLoader(loaders: string[], projectType: ModProjectType, preferred: string): string | undefined {
  if (projectType === 'shader') return loaders.includes('iris') ? 'iris' : loaders[0]
  return loaders.includes(preferred) ? preferred : loaders[0]
}

function pickGameVersion(versions: string[], preferred: string): string | undefined {
  if (preferred !== 'auto' && versions.includes(preferred)) return preferred
  return versions.find((v) => /^\d+\.\d+(\.\d+)?$/.test(v)) ?? versions[0]
}

function readManifest(): ModInstallManifest {
  if (!existsSync(PATHS.modInstallsFile)) return { installs: [], updatedAt: new Date().toISOString() }
  try {
    return JSON.parse(readFileSync(PATHS.modInstallsFile, 'utf8')) as ModInstallManifest
  } catch {
    return { installs: [], updatedAt: new Date().toISOString() }
  }
}

function upsertInstall(record: ModInstallRecord): ModInstallRecord {
  const manifest = readManifest()
  const installs = manifest.installs.filter((item) => item.id !== record.id)
  installs.unshift(record)
  writeFileSync(
    PATHS.modInstallsFile,
    JSON.stringify({ installs, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  )
  return record
}

function publish(p: ModDownloadProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.mods.progress, p)
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 160) || 'mod-file.jar'
}

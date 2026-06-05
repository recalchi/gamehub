import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { libraryStore, settingsStore } from './store'
import { log } from './logger'
import type { Game } from '@shared/types'

interface EpicInstalledGame {
  appName: string
  displayName: string
  installLocation: string
  catalogNamespace?: string
  catalogItemId?: string
  launchUri: string
  sizeBytes: number
}

interface EpicImportResult {
  found: number
  added: number
  updated: number
  removedDuplicates: number
}

const EPIC_MANIFEST_DIRS = [
  'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests',
  'D:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests',
  'E:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'
]

const EPIC_LAUNCHER_INSTALLED_CANDIDATES = [
  'C:\\ProgramData\\Epic\\UnrealEngineLauncher\\LauncherInstalled.dat',
  'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\LauncherInstalled.dat'
]

export function detectEpicGames(): EpicInstalledGame[] {
  const byKey = new Map<string, EpicInstalledGame>()

  for (const dir of EPIC_MANIFEST_DIRS) {
    for (const game of detectFromManifestDir(dir)) {
      byKey.set(epicKey(game), game)
    }
  }

  for (const game of detectFromLauncherInstalled()) {
    byKey.set(epicKey(game), game)
  }

  for (const root of settingsStore.load().gameRoots) {
    for (const game of detectFromEgstoreRoots(root)) {
      byKey.set(epicKey(game), game)
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function importEpicGames(): Promise<EpicImportResult> {
  const settings = settingsStore.load()
  if (!settings.epic.enabled) {
    log.info('epic', 'Epic integration disabled; skipping import')
    return { found: 0, added: 0, updated: 0, removedDuplicates: 0 }
  }

  const games = detectEpicGames()
  const data = libraryStore.load()
  let added = 0
  let updated = 0
  let removedDuplicates = 0

  for (const eg of games) {
    const id = epicGameId(eg)
    const wasThere = libraryStore.load().games.find((g) => g.id === id)
    const duplicateState = collectDuplicateState(eg, id)
    for (const duplicate of duplicateState.duplicates) {
      if (libraryStore.removeGame(duplicate.id)) removedDuplicates++
    }

    const game: Game = {
      id,
      title: eg.displayName,
      path: eg.launchUri,
      platform: 'pc',
      emulator: 'native',
      sizeBytes: eg.sizeBytes,
      confidence: 1,
      status: 'ready',
      addedAt: wasThere?.addedAt ?? duplicateState.addedAt ?? new Date().toISOString(),
      lastPlayedAt: latestIso(wasThere?.lastPlayedAt, duplicateState.lastPlayedAt),
      playTime: Math.max(wasThere?.playTime ?? 0, duplicateState.playTime),
      favorite: wasThere?.favorite ?? duplicateState.favorite,
      cover: wasThere?.cover ?? duplicateState.cover,
      banner: wasThere?.banner ?? duplicateState.banner,
      description: wasThere?.description,
      genre: wasThere?.genre,
      developer: wasThere?.developer,
      year: wasThere?.year,
      flags: ['epic', 'adicionado manualmente'],
      relatedFiles: [
        eg.installLocation,
        ...[eg.catalogNamespace, eg.catalogItemId].filter((v): v is string => Boolean(v))
      ]
    }
    libraryStore.addGame(game)
    if (wasThere) updated++
    else added++
  }

  log.info(
    'epic',
    `imported Epic games: found ${games.length}, +${added} added, ${updated} updated, ${removedDuplicates} duplicate(s) removed`
  )
  // Re-save emulators from the initial read if duplicate removal left the
  // library through multiple small writes. This preserves current emulator data.
  const latest = libraryStore.load()
  libraryStore.save(latest.games, data.emulators)
  return { found: games.length, added, updated, removedDuplicates }
}

function detectFromManifestDir(dir: string): EpicInstalledGame[] {
  if (!existsSync(dir)) return []
  const games: EpicInstalledGame[] = []
  for (const file of safeReadDir(dir)) {
    if (!file.toLowerCase().endsWith('.item')) continue
    const manifest = readJsonRecord(join(dir, file))
    if (!manifest) continue
    const appName = asString(manifest.AppName ?? manifest.AppID ?? manifest.ArtifactId)
    const installLocation = asString(manifest.InstallLocation)
    if (!appName || !installLocation || !existsSync(installLocation)) continue
    games.push({
      appName,
      displayName: cleanTitle(asString(manifest.DisplayName) || basename(installLocation) || appName),
      installLocation,
      catalogNamespace: asString(manifest.CatalogNamespace),
      catalogItemId: asString(manifest.CatalogItemId),
      launchUri: epicLaunchUri(appName),
      sizeBytes: asNumber(manifest.InstallSize) ?? 0
    })
  }
  return games
}

function detectFromLauncherInstalled(): EpicInstalledGame[] {
  let root: Record<string, unknown> | null = null
  for (const candidate of EPIC_LAUNCHER_INSTALLED_CANDIDATES) {
    root = readJsonRecord(candidate)
    if (root) break
  }
  const list = Array.isArray(root?.InstallationList) ? root.InstallationList : []
  const games: EpicInstalledGame[] = []
  for (const entry of list) {
    if (!isRecord(entry)) continue
    const appName = asString(entry.AppName ?? entry.AppID ?? entry.ArtifactId)
    const installLocation = asString(entry.InstallLocation)
    if (!appName || !installLocation || !existsSync(installLocation)) continue
    games.push({
      appName,
      displayName: cleanTitle(asString(entry.DisplayName) || basename(installLocation) || appName),
      installLocation,
      catalogNamespace: asString(entry.CatalogNamespace),
      catalogItemId: asString(entry.CatalogItemId),
      launchUri: epicLaunchUri(appName),
      sizeBytes: 0
    })
  }
  return games
}

function detectFromEgstoreRoots(root: string): EpicInstalledGame[] {
  if (!existsSync(root)) return []
  const stores = findEgstoreDirs(root, 4)
  const games: EpicInstalledGame[] = []
  for (const store of stores) {
    for (const file of safeReadDir(store)) {
      if (!file.toLowerCase().endsWith('.mancpn')) continue
      const manifest = readJsonRecord(join(store, file))
      if (!manifest) continue
      const appName = asString(manifest.AppName)
      const installLocation = dirname(store)
      if (!appName || !existsSync(installLocation)) continue
      games.push({
        appName,
        displayName: cleanTitle(basename(installLocation) || appName),
        installLocation,
        catalogNamespace: asString(manifest.CatalogNamespace),
        catalogItemId: asString(manifest.CatalogItemId),
        launchUri: epicLaunchUri(appName),
        sizeBytes: 0
      })
    }
  }
  return games
}

function findEgstoreDirs(root: string, maxDepth: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  function walk(dir: string, depth: number): void {
    const resolved = resolve(dir).toLowerCase()
    if (seen.has(resolved)) return
    seen.add(resolved)
    if (depth < 0) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = join(dir, entry.name)
      if (entry.name.toLowerCase() === '.egstore') {
        out.push(full)
        continue
      }
      if (shouldSkipDir(entry.name)) continue
      walk(full, depth - 1)
    }
  }
  walk(root, maxDepth)
  return out
}

function collectDuplicateState(game: EpicInstalledGame, epicId: string): {
  duplicates: Game[]
  addedAt?: string
  lastPlayedAt?: string
  playTime: number
  favorite: boolean
  cover?: string
  banner?: string
} {
  const installLocation = resolve(game.installLocation).toLowerCase()
  const normalizedDisplay = normalize(game.displayName)
  const normalizedApp = normalize(game.appName)
  const duplicates = libraryStore.load().games.filter((candidate) => {
    if (candidate.id === epicId) return false
    if (candidate.platform !== 'pc') return false
    if (candidate.flags?.includes('epic') || candidate.flags?.includes('steam')) return false
    const candidatePath = resolveLocalPath(candidate.path)
    if (!candidatePath || !candidatePath.startsWith(installLocation)) return false
    const title = normalize(candidate.title)
    return (
      title.includes(normalizedDisplay) ||
      normalizedDisplay.includes(title) ||
      title.includes(normalizedApp) ||
      normalizedApp.includes(title) ||
      title.includes('shipping') ||
      title.includes('client win64')
    )
  })

  return {
    duplicates,
    addedAt: earliestIso(duplicates.map((g) => g.addedAt)),
    lastPlayedAt: latestIso(...duplicates.map((g) => g.lastPlayedAt)),
    playTime: duplicates.reduce((max, g) => Math.max(max, g.playTime ?? 0), 0),
    favorite: duplicates.some((g) => g.favorite),
    cover: duplicates.find((g) => g.cover)?.cover,
    banner: duplicates.find((g) => g.banner)?.banner
  }
}

function resolveLocalPath(path: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return null
  try {
    return resolve(path).toLowerCase()
  } catch {
    return null
  }
}

function readJsonRecord(path: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return isRecord(parsed) ? parsed : null
  } catch (err) {
    log.debug('epic', `failed to read ${path}: ${String(err)}`)
    return null
  }
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function shouldSkipDir(name: string): boolean {
  return ['node_modules', '$recycle.bin', 'system volume information'].includes(name.toLowerCase())
}

function epicKey(game: EpicInstalledGame): string {
  return normalize(game.appName || game.installLocation)
}

function epicGameId(game: EpicInstalledGame): string {
  const key = normalize(game.appName) || createHash('sha1').update(game.installLocation).digest('hex')
  return `epic_${key.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`
}

function epicLaunchUri(appName: string): string {
  return `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=launch&silent=true`
}

function cleanTitle(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function latestIso(...values: Array<string | undefined>): string | undefined {
  return values
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0]
}

function earliestIso(values: Array<string | undefined>): string | undefined {
  return values
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0]
}

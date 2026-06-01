import { existsSync, lstatSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, basename, extname, join } from 'node:path'
import { libraryStore, settingsStore } from './store'
import { log } from './logger'
import { PLATFORMS } from '@shared/platforms'
import { EMULATORS } from '@shared/emulators'
import type { EmulatorId, Game, GameStatus, PlatformId } from '@shared/types'

export interface ManualGameInput {
  title: string
  path: string
  platform: PlatformId
  description?: string
  developer?: string
  genre?: string
  year?: number
  cover?: string
}

/**
 * Add a hand-crafted entry to the library.
 *
 * Covers the spec's "PC / Outros" cases — Minecraft (via official launcher),
 * Steam games, indie .exe titles — anything the auto-scanner wouldn't pick up
 * because it sits outside the scanned roots.
 *
 * The id is derived from the file path so adding the same exe twice is a
 * no-op (it'll just update fields, not duplicate).
 */
export function addManualGame(input: ManualGameInput): Game | { error: string } {
  if (!input.title.trim()) return { error: 'Título é obrigatório.' }
  if (!input.path) return { error: 'Caminho do jogo é obrigatório.' }
  if (!existsSync(input.path)) {
    return { error: `Arquivo não encontrado: ${input.path}` }
  }
  const resolvedPath =
    input.platform === 'pc' ? resolvePcLaunchPath(input.path, input.title) : input.path

  const id = createHash('sha1').update(resolve(resolvedPath).toLowerCase()).digest('hex').slice(0, 16)
  const isNative = input.platform === 'pc'

  // Pick the best emulator for this platform. Honor any per-platform override
  // the user has learned (e.g. "use DuckStation for PS1"), then fall back to
  // the platform's preferred list. If nothing matches a detected emulator we
  // still attach the preferred ID so the GameDetail can show a 1-click install
  // button — status will reflect what's actually playable.
  const { emulator, status } = pickEmulatorAndStatus(input.platform, isNative)

  const game: Game = {
    id,
    title: input.title.trim(),
    path: resolvedPath,
    platform: input.platform,
    emulator,
    sizeBytes: estimateGameSizeBytes(resolvedPath, input.platform),
    confidence: 1,
    status,
    addedAt: new Date().toISOString(),
    playTime: 0,
    favorite: false,
    cover: input.cover,
    description: input.description,
    developer: input.developer,
    genre: input.genre,
    year: input.year,
    flags: ['adicionado manualmente'],
    relatedFiles: []
  }

  libraryStore.addGame(game)
  log.info('manual', `added manual game: ${game.title} (${game.platform}) at ${game.path}`)
  return game
}

function estimateGameSizeBytes(path: string, platform: PlatformId): number {
  try {
    const st = statSync(path)
    if (st.isDirectory()) return directorySizeBytes(path)
    if (platform === 'pc') {
      const root = pcInstallRootDir(path)
      const rootSize = directorySizeBytes(root)
      return rootSize > 0 ? rootSize : st.size
    }
    return st.size
  } catch {
    return 0
  }
}

function pcInstallRootDir(path: string): string {
  const parts = path.split(/[\\/]+/)
  const pcIndex = parts.findIndex((part) => part.toLowerCase() === 'pc')
  if (pcIndex >= 0 && parts.length > pcIndex + 1) return parts.slice(0, pcIndex + 2).join('\\')
  const epicIndex = parts.findIndex((part) => part.toLowerCase() === 'epicgames')
  if (epicIndex >= 0 && parts.length > epicIndex + 1) {
    return parts.slice(0, epicIndex + 2).join('\\')
  }
  return parts.slice(0, Math.max(parts.length - 1, 1)).join('\\')
}

function directorySizeBytes(root: string): number {
  let total = 0
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(current, entry)
      let st
      try {
        st = lstatSync(full)
      } catch {
        continue
      }
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) {
        stack.push(full)
        continue
      }
      total += st.size
    }
  }
  return total
}

const PC_LAUNCH_EXTENSIONS = new Set(['.exe', '.bat', '.cmd', '.lnk', '.url', '.jar'])
const PC_INTERNAL_PATTERN =
  /(crash|webhelper|uninstall|easyanticheat|eac|updater|prereq|redist|vcredist|dxsetup|service|setup|launcher)/i

/**
 * Allow manual-add of a PC *folder* by auto-picking the most likely launcher
 * file inside it. Keeps the UX simple for extracted repacks and portable games.
 */
function resolvePcLaunchPath(rawPath: string, title: string): string {
  let st
  try {
    st = statSync(rawPath)
  } catch {
    return rawPath
  }
  if (!st.isDirectory()) return rawPath

  const queue: Array<{ dir: string; depth: number }> = [{ dir: rawPath, depth: 0 }]
  const candidates: Array<{ path: string; score: number; size: number }> = []
  const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '')

  while (queue.length > 0) {
    const current = queue.shift()!
    let entries: string[]
    try {
      entries = readdirSync(current.dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(current.dir, entry)
      let entryStat
      try {
        entryStat = statSync(full)
      } catch {
        continue
      }
      if (entryStat.isDirectory()) {
        if (current.depth < 2 && !PC_INTERNAL_PATTERN.test(entry)) {
          queue.push({ dir: full, depth: current.depth + 1 })
        }
        continue
      }

      const ext = extname(entry).toLowerCase()
      if (!PC_LAUNCH_EXTENSIONS.has(ext)) continue
      const lower = entry.toLowerCase()
      if (PC_INTERNAL_PATTERN.test(lower)) continue

      const cleanEntry = lower.replace(/[^a-z0-9]+/g, '')
      let score = 0
      if (cleanTitle && cleanEntry.includes(cleanTitle)) score += 50
      if (ext === '.exe') score += 30
      if (current.depth === 0) score += 10
      if (lower.includes('start') || lower.includes('play') || lower.includes('launch')) score += 6
      if (lower.includes('64')) score += 2
      candidates.push({ path: full, score, size: entryStat.size })
    }
  }

  if (candidates.length === 0) return rawPath
  candidates.sort((a, b) => b.score - a.score || b.size - a.size)
  return candidates[0].path
}

/**
 * Decide which emulator to attach to a newly-added game, and what status to
 * give it. The emulator is set to the platform's preferred ID even when not
 * currently installed — that way the UI's "Install emulator" button has
 * something to act on.
 */
function pickEmulatorAndStatus(
  platform: PlatformId,
  isNative: boolean
): { emulator?: EmulatorId; status: GameStatus } {
  if (isNative) return { emulator: 'native', status: 'ready' }
  const platformDef = PLATFORMS[platform]
  const detected = libraryStore.load().emulators
  const preferred = settingsStore.load().platformEmulators[platform]
  const ordered = preferred
    ? [preferred, ...(platformDef?.emulators ?? []).filter((e) => e !== preferred)]
    : platformDef?.emulators ?? []

  for (const id of ordered) {
    const found = detected.find((e) => e.id === id)
    if (!found) continue
    const def = EMULATORS[id]
    return {
      emulator: id,
      status: def?.needsBios ? 'missing-bios' : 'ready'
    }
  }
  // Nothing detected for this platform — keep the preferred ID so the UI can
  // offer to install it, but flag the game as needing the emulator first.
  return { emulator: ordered[0], status: 'missing-emulator' }
}

export function removeGame(id: string): { ok: true } | { error: string } {
  const ok = libraryStore.removeGame(id)
  if (!ok) return { error: 'Jogo não encontrado.' }
  log.info('manual', `removed game ${id}`)
  return { ok: true }
}

/**
 * Import every locally installed Steam game. Idempotent — re-running just
 * refreshes titles/sizes without duplicating entries (the id is derived from
 * the appid). Returns the count actually added/updated.
 */
export async function importSteamGames(): Promise<{ added: number; updated: number }> {
  const { detectSteamGames } = await import('./steam')
  const games = detectSteamGames()
  const existing = libraryStore.load().games
  let added = 0
  let updated = 0
  for (const sg of games) {
    const id = `steam_${sg.appId}`
    const wasThere = existing.find((g) => g.id === id)
    const steamPlayTime = (sg.playtimeMinutes ?? 0) * 60
    const playTime = Math.max(wasThere?.playTime ?? 0, steamPlayTime)
    const steamLastPlayedAt = steamLastPlayedIso(sg.lastPlayedUnix)
    const lastPlayedAt = latestIso(wasThere?.lastPlayedAt, steamLastPlayedAt)
    const game: Game = {
      id,
      title: sg.name,
      // We store the steam:// URI as the path; launcher detects this prefix
      // and shells out via shell.openExternal instead of spawning an exe.
      path: `steam://rungameid/${sg.appId}`,
      platform: 'pc',
      emulator: 'native',
      sizeBytes: sg.sizeBytes,
      confidence: 1,
      status: 'ready',
      addedAt: wasThere?.addedAt ?? new Date().toISOString(),
      lastPlayedAt,
      playTime,
      favorite: wasThere?.favorite ?? false,
      cover: wasThere?.cover ?? steamCoverUrl(sg.appId),
      banner: wasThere?.banner ?? steamBannerUrl(sg.appId),
      description: wasThere?.description,
      flags: ['steam', 'steam-playtime', 'adicionado manualmente'],
      relatedFiles: [sg.installDir]
    }
    libraryStore.addGame(game)
    if (wasThere) updated++
    else added++
  }
  log.info('manual', `imported Steam games: +${added} added, ${updated} updated`)
  return { added, updated }
}

function steamLastPlayedIso(unixSeconds: number | undefined): string | undefined {
  if (!unixSeconds || unixSeconds <= 0) return undefined
  return new Date(unixSeconds * 1000).toISOString()
}

function latestIso(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

function steamCoverUrl(appId: string): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`
}

function steamBannerUrl(appId: string): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`
}

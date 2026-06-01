import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './logger'

/**
 * Local Steam library reader.
 *
 * Reads ONLY local files Steam itself writes to disk — no API calls, no
 * personal tokens, no Steam credentials. Everything we need is in:
 *
 *   <SteamRoot>/config/libraryfolders.vdf   — list of library paths
 *   <library>/steamapps/appmanifest_<id>.acf — one per installed game
 *   <library>/steamapps/common/<name>/      — actual install dir
 *
 * We launch via `steam://rungameid/<appid>` so Steam handles the actual game
 * launch (correct flags, family controls, anti-cheat, etc.) instead of us
 * running the .exe directly.
 */

export interface SteamGame {
  appId: string
  name: string
  installDir: string
  sizeBytes: number
  /** Total playtime from Steam localconfig.vdf, in minutes. */
  playtimeMinutes?: number
  /** Unix timestamp from Steam localconfig.vdf, in seconds. */
  lastPlayedUnix?: number
}

export interface DetectSteamGamesOptions {
  /**
   * Sum full install folder sizes. Expensive on HDDs with large libraries.
   * Disable when we only need metadata/playtime sync.
   */
  includeSizes?: boolean
}

const STEAM_INSTALL_PATHS = [
  'C:\\Program Files (x86)\\Steam',
  'C:\\Program Files\\Steam',
  'D:\\Steam',
  'E:\\Steam'
]

const STEAM_LIBRARY_PATHS = [
  'D:\\SteamLibrary',
  'D:\\Jogos\\SteamLibrary',
  'D:\\Games\\SteamLibrary',
  'E:\\SteamLibrary',
  'E:\\Jogos\\SteamLibrary',
  'E:\\Games\\SteamLibrary'
]

function findSteamRoot(): string | null {
  for (const p of STEAM_INSTALL_PATHS) {
    if (existsSync(join(p, 'steam.exe'))) return p
  }
  return null
}

/**
 * Parse the minimal subset of VDF (Valve Data Format) we need. The format
 * is a nested key-value tree; for libraryfolders.vdf we only care about the
 * "path" entries inside each numbered library block.
 */
function parseLibraryPaths(vdfText: string): string[] {
  // Lines look like:    "path"     "C:\\SteamLibrary"
  const out: string[] = []
  for (const line of vdfText.split(/\r?\n/)) {
    const m = line.match(/^\s*"path"\s+"([^"]+)"\s*$/i)
    if (m) {
      // VDF escapes backslashes: convert \\ → \
      out.push(m[1].replace(/\\\\/g, '\\'))
    }
  }
  return out
}

/**
 * Parse an appmanifest_*.acf file. Only need appid, name, installdir.
 */
function parseManifest(text: string): { appid?: string; name?: string; installdir?: string } {
  const out: { appid?: string; name?: string; installdir?: string } = {}
  const re = /"(\w+)"\s+"([^"]*)"/g
  let m
  while ((m = re.exec(text)) !== null) {
    const key = m[1].toLowerCase()
    if (key === 'appid' || key === 'name' || key === 'installdir') {
      out[key] = m[2]
    }
  }
  return out
}

export function detectSteamGames(options: DetectSteamGamesOptions = {}): SteamGame[] {
  const includeSizes = options.includeSizes ?? true
  const root = findSteamRoot()
  const libraries: string[] = []
  const usage = detectSteamUsage(root)

  if (root) {
    const libsVdf = join(root, 'config', 'libraryfolders.vdf')
    if (existsSync(libsVdf)) {
      libraries.push(...parseLibraryPaths(readFileSync(libsVdf, 'utf8')))
    } else {
      log.warn('steam', `libraryfolders.vdf not found at ${libsVdf}`)
    }
    // The Steam root itself always counts as a library too.
    if (!libraries.includes(root)) libraries.unshift(root)
  } else {
    log.info('steam', 'Steam not found in standard locations; checking known library folders')
  }

  for (const fallback of STEAM_LIBRARY_PATHS) {
    if (existsSync(join(fallback, 'steamapps')) && !libraries.includes(fallback)) {
      libraries.push(fallback)
    }
  }
  if (libraries.length === 0) return []

  const games: SteamGame[] = []
  for (const lib of libraries) {
    const steamapps = join(lib, 'steamapps')
    if (!existsSync(steamapps)) continue
    let entries: string[]
    try {
      entries = readdirSync(steamapps)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!/^appmanifest_\d+\.acf$/i.test(entry)) continue
      const manifestPath = join(steamapps, entry)
      let text: string
      try {
        text = readFileSync(manifestPath, 'utf8')
      } catch {
        continue
      }
      const m = parseManifest(text)
      if (!m.appid || !m.name || !m.installdir) continue
      // Skip Steam's own utility "tools" (Proton, SteamWorks Common Redists, etc.)
      if (/^proton\b/i.test(m.name) || /redist/i.test(m.name) || /^steam linux runtime/i.test(m.name)) {
        continue
      }
      const installDir = join(steamapps, 'common', m.installdir)
      let size = 0
      if (includeSizes) {
        try {
          size = statSync(installDir).isDirectory() ? folderSize(installDir, 0) : 0
        } catch {
          size = 0
        }
      }
      const appUsage = usage.get(m.appid)
      games.push({
        appId: m.appid,
        name: m.name,
        installDir,
        sizeBytes: size,
        playtimeMinutes: appUsage?.playtimeMinutes,
        lastPlayedUnix: appUsage?.lastPlayedUnix
      })
    }
  }
  log.info('steam', `detected ${games.length} Steam game(s) across ${libraries.length} library path(s)`)
  return games
}

function detectSteamUsage(root: string | null): Map<string, { playtimeMinutes?: number; lastPlayedUnix?: number }> {
  const out = new Map<string, { playtimeMinutes?: number; lastPlayedUnix?: number }>()
  const roots = new Set<string>()
  if (root) roots.add(join(root, 'userdata'))
  for (const p of STEAM_INSTALL_PATHS) roots.add(join(p, 'userdata'))

  for (const userdataRoot of roots) {
    if (!existsSync(userdataRoot)) continue
    let users: string[]
    try {
      users = readdirSync(userdataRoot)
    } catch {
      continue
    }
    for (const user of users) {
      const file = join(userdataRoot, user, 'config', 'localconfig.vdf')
      if (!existsSync(file)) continue
      try {
        mergeUsage(out, parseLocalConfigUsage(readFileSync(file, 'utf8')))
      } catch (err) {
        log.warn('steam', `failed to parse ${file}: ${String(err)}`)
      }
    }
  }

  return out
}

function mergeUsage(
  target: Map<string, { playtimeMinutes?: number; lastPlayedUnix?: number }>,
  source: Map<string, { playtimeMinutes?: number; lastPlayedUnix?: number }>
): void {
  for (const [appId, usage] of source) {
    const current = target.get(appId) ?? {}
    target.set(appId, {
      playtimeMinutes: Math.max(current.playtimeMinutes ?? 0, usage.playtimeMinutes ?? 0),
      lastPlayedUnix: Math.max(current.lastPlayedUnix ?? 0, usage.lastPlayedUnix ?? 0)
    })
  }
}

function parseLocalConfigUsage(text: string): Map<string, { playtimeMinutes?: number; lastPlayedUnix?: number }> {
  const usage = new Map<string, { playtimeMinutes?: number; lastPlayedUnix?: number }>()
  const stack: string[] = []
  let pendingKey: string | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (line === '{') {
      if (pendingKey) stack.push(pendingKey)
      pendingKey = null
      continue
    }
    if (line === '}') {
      stack.pop()
      pendingKey = null
      continue
    }

    const pair = line.match(/^"([^"]+)"\s+"([^"]*)"$/)
    if (pair) {
      const appId = currentAppId(stack)
      if (appId && pair[1] === 'Playtime') {
        const minutes = Number(pair[2])
        if (Number.isFinite(minutes)) {
          const current = usage.get(appId) ?? {}
          usage.set(appId, { ...current, playtimeMinutes: minutes })
        }
      }
      if (appId && pair[1] === 'LastPlayed') {
        const unix = Number(pair[2])
        if (Number.isFinite(unix) && unix > 0) {
          const current = usage.get(appId) ?? {}
          usage.set(appId, { ...current, lastPlayedUnix: unix })
        }
      }
      pendingKey = null
      continue
    }

    const keyOnly = line.match(/^"([^"]+)"$/)
    pendingKey = keyOnly ? keyOnly[1] : null
  }

  return usage
}

function currentAppId(stack: string[]): string | null {
  const idx = stack.lastIndexOf('apps')
  if (idx < 0) return null
  const candidate = stack[idx + 1]
  return candidate && /^\d+$/.test(candidate) ? candidate : null
}

/**
 * Cheap recursive size sum, capped to 3 levels and a max-files budget so
 * a 200GB game's full enumeration doesn't tank the scan deadline.
 */
function folderSize(dir: string, depth: number): number {
  if (depth > 2) return 0
  let total = 0
  let count = 0
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return 0
  }
  for (const e of entries) {
    if (count++ > 200) break
    const full = join(dir, e)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) total += folderSize(full, depth + 1)
    else total += st.size
  }
  return total
}

/**
 * Return the launch URI for a Steam game. Pass to shell.openExternal — Steam
 * picks it up and launches the game with all the user's configured options.
 */
export function steamLaunchUri(appId: string): string {
  return `steam://rungameid/${appId}`
}

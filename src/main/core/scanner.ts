import { existsSync, lstatSync, readdirSync, statSync } from 'node:fs'
import { join, basename, extname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { detectPlatform } from './detector'
import { lookupSerial, looksLikeDiscSerial } from '@shared/discSerials'
import { detectEmulators } from './emulators'
import { detectSteamGames, type SteamGame } from './steam'
import { discoverExternalBiosFiles, reconcileBiosStatus, shareBiosAcrossEmulators } from './bios'
import { homedir } from 'node:os'
import { libraryStore, settingsStore } from './store'
import { log } from './logger'
import { IPC } from '@shared/ipc'
import type {
  DetectedEmulator,
  Game,
  GameStatus,
  PlatformId,
  ScanProgress,
  ScanResult
} from '@shared/types'
import { PLATFORMS } from '@shared/platforms'
import { EMULATORS } from '@shared/emulators'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'system volume information',
  '$recycle.bin',
  // Emulator-internal dirs we never want to enumerate as games
  'bios',
  'cheats',
  'config',
  'covers',
  'memcards',
  'cards',
  'savestates',
  'sstates',
  'shaders',
  'plugins',
  'patches',
  'qt6',
  'qtplugins',
  'd3d12',
  'translations',
  'log',
  'shaderlog',
  'snap',
  'screenshots',
  'captures',
  'cache',
  'gpucache',
  'docs',
  'resources',
  'icons',
  'sounds',
  'complementos',
  'guiconfigs',
  'emuladores',
  'ps3_game',
  'usrdir',
  'tropdir',
  'licdir',
  'licence',
  'ppu_progs',
  'spu_progs'
])

// Skip any directory whose lowercase name starts with one of these prefixes.
// Catches Sony's `dev_hdd0`, `dev_flash`, `dev_flash2`, `dev_bdvd`,
// `dev_usb000`, etc. without listing every variant.
const SKIP_PREFIXES = ['dev_', 'rpcs3_', 'pcsx2_']

const INTERNAL_PC_EXE_PATTERNS = [
  /crash/i,
  /webhelper/i,
  /uninstall/i,
  /easyanticheat/i,
  /eac/i,
  /updater/i,
  /bootstrap/i,
  /prereq/i,
  /redist/i,
  /vcredist/i,
  /dxsetup/i,
  /clientux/i,
  /render/i,
  /service/i,
  /setup/i,
  /launcher/i,
  /onlinefix/i,
  /artbook/i,
  /soundtrack/i,
  /benchmark/i,
  /language selector/i,
  /texconv/i,
  /ffmpeg/i,
  /handler/i,
  /uploader/i,
  /^leagueclient/i,
  /^riot client$/i,
  /^riotclient/i
]

const KNOWN_EXTENSIONS = new Set<string>()
for (const p of Object.values(PLATFORMS)) for (const e of p.extensions) KNOWN_EXTENSIONS.add(e)
KNOWN_EXTENSIONS.add('zip')
KNOWN_EXTENSIONS.add('7z')
KNOWN_EXTENSIONS.add('rar')

let scanning = false

export function isScanning(): boolean {
  return scanning
}

interface ScanOptions {
  gameRoots: string[]
  emulatorRoots: string[]
  /** override existing library (true) vs merge play time/favorite (false). */
  fresh?: boolean
}

/**
 * Walk the configured roots, classify every candidate file, persist results,
 * and stream progress to the renderer via IPC.
 */
export async function scanLibrary(opts: ScanOptions): Promise<ScanResult> {
  if (scanning) {
    log.warn('scanner', 'scan requested while another scan is in progress — ignoring')
    return { games: [], emulators: [], durationMs: 0, errors: ['scan already in progress'] }
  }
  scanning = true
  const startedAt = Date.now()
  const errors: string[] = []
  const progress: ScanProgress = {
    phase: 'enumerating',
    scanned: 0,
    found: 0,
    startedAt: new Date(startedAt).toISOString()
  }

  publish(progress)

  // 1. Find emulators first so we can attribute them to games as we go
  const { emulators, installPaths } = await detectEmulators(opts.emulatorRoots, errors)
  log.info('scanner', `detected ${emulators.length} emulator(s) across ${installPaths.length} install path(s)`)

  // Skip every install path observed — including duplicates like rpcs3_old —
  // so the game walker never crawls into an emulator's bundled data tree.
  const emulatorPaths = new Set(
    installPaths.map((p) => p.toLowerCase().replace(/\\+$/, ''))
  )

  // Hard deadline. If the walker runs into a pathological tree (network share,
  // symlink loop, an emulator we didn't recognise) we still want to return
  // partial results rather than block the splash forever.
  const deadline = Date.now() + 90_000
  let deadlineExceeded = false

  // 2. Walk game roots
  const candidates: string[] = []
  for (const root of opts.gameRoots) {
    try {
      walk(root, candidates, emulatorPaths, deadline, (path) => {
        progress.current = path
        progress.scanned += 1
        if (progress.scanned % 25 === 0) publish(progress)
      })
    } catch (err) {
      const msg = `failed to scan ${root}: ${String(err)}`
      errors.push(msg)
      log.error('scanner', msg)
    }
    if (Date.now() > deadline) {
      const msg = `scan deadline exceeded after ${candidates.length} candidates — returning partial results`
      errors.push(msg)
      log.warn('scanner', msg)
      deadlineExceeded = true
      break
    }
  }
  log.info('scanner', `enumeration complete: ${candidates.length} candidates`)

  // 3. Classify candidates
  progress.phase = 'classifying'
  publish(progress)

  const previous = opts.fresh ? new Map<string, Game>() : indexPrevious()
  const raw: Game[] = []
  for (const path of candidates) {
    const game = classify(path, emulators, previous)
    if (game) {
      raw.push(game)
      progress.found = raw.length
      if (raw.length % 10 === 0) publish(progress)
    }
  }

  // 3b. Deduplicate. The walker often surfaces the same game twice — e.g.
  // `God of War.iso` directly under `D:\Jogos\PS2\` plus the same file inside
  // `D:\Jogos\PS2\God of War (USA)\God of War (USA).iso`. We collapse those
  // to one entry per (platform, normalized-title), keeping the candidate with
  // the highest confidence + largest file (proxy for "most complete copy").
  const games = dedupeGames(prunePcLaunchers(raw))
  if (games.length !== raw.length) {
    log.info('scanner', `deduplicated ${raw.length - games.length} duplicate(s)`)
  }

  // 3c. Auto-share BIOS files between compatible emulators (PS1 BIOS is
  // universal across ePSXe/psxfin/DuckStation, etc). Done before status
  // reconcile so games tied to the recipient emulator immediately flip to
  // "ready" once they inherit a BIOS.
  //
  // We also do a shallow walk of game roots + Documents + Downloads looking
  // for BIOS the user dumped to a random location. Any hit becomes a sharing
  // source, which catches the "BIOS in my Downloads folder" case.
  const home = homedir()
  const biosSearchRoots = Array.from(
    new Set([
      ...opts.gameRoots,
      ...opts.emulatorRoots,
      join(home, 'Downloads'),
      join(home, 'Documents')
    ])
  )
  const externalBios = discoverExternalBiosFiles(biosSearchRoots)
  if (externalBios.length > 0) {
    log.info('scanner', `discovered ${externalBios.length} external BIOS candidate(s)`)
  }
  const share = shareBiosAcrossEmulators(emulators, externalBios)
  if (share.shared > 0) {
    log.info('scanner', `shared ${share.shared} BIOS file(s) between emulators`, share.details)
  }

  // 3d. Promote missing-bios → ready when the BIOS is actually present on disk.
  // We can't do this in `computeStatus` because that runs before we've seen
  // the full picture of detected emulators.
  reconcileBiosStatus(games, emulators)

  // 4. Persist — merging manually-added games (catalog seeds, drag-and-drop
  // adds, URL downloads). Those live outside gameRoots so the walker never
  // sees them, and we'd lose them every scan if we just saved the scan result.
  // The "fresh" flag bypasses preservation since it explicitly means "rebuild
  // from scratch".
  let merged = games
  const prev = libraryStore.load().games
  if (deadlineExceeded) {
    const scannedIds = new Set(games.map((g) => g.id))
    const carried = prev.filter((g) => !scannedIds.has(g.id))
    merged = [...games, ...carried]
    if (carried.length > 0) {
      log.info('scanner', `preserved ${carried.length} existing game(s) due to partial scan`)
    }
  } else if (!opts.fresh) {
    const manualPreserved = prev.filter((g) => g.flags?.includes('adicionado manualmente'))
    const scannedIds = new Set(games.map((g) => g.id))
    merged = [...games, ...manualPreserved.filter((g) => !scannedIds.has(g.id))]
    if (manualPreserved.length > 0) {
      log.info(
        'scanner',
        `preserved ${manualPreserved.length} manually-added game(s) across scan`
      )
    }
  }

  try {
    const matched = enrichPcPlaytimeFromSteam(merged)
    if (matched > 0) {
      log.info('scanner', `steam playtime synced into ${matched} game(s)`)
    }
  } catch (err) {
    log.warn('scanner', `steam playtime sync skipped: ${String(err)}`)
  }

  libraryStore.save(merged, emulators)
  progress.phase = 'done'
  progress.current = undefined
  publish(progress)
  scanning = false

  const result: ScanResult = {
    games: merged,
    emulators,
    durationMs: Date.now() - startedAt,
    errors
  }
  log.info('scanner', `scan complete: ${merged.length} games in ${result.durationMs}ms`)
  return result
}

function walk(
  root: string,
  out: string[],
  emulatorPaths: Set<string>,
  deadline: number,
  onVisit: (path: string) => void
): void {
  if (Date.now() > deadline) return
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return
  }
  const dirs: Array<{ entry: string; full: string }> = []
  const files: Array<{ entry: string; full: string }> = []

  for (const entry of entries) {
    if (Date.now() > deadline) return
    const full = join(root, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    onVisit(full)
    if (st.isDirectory()) dirs.push({ entry, full })
    else files.push({ entry, full })
  }

  // Files first: this makes top-level launch executables (e.g. GoW.exe)
  // show up even when deep asset trees would otherwise consume the deadline.
  for (const { entry, full } of files) {
    if (Date.now() > deadline) return
    const ext = extname(entry).slice(1).toLowerCase()
    if (!ext) continue
    if (!KNOWN_EXTENSIONS.has(ext)) continue
    // Skip multi-track BINs — the parent .cue represents the game
    if (ext === 'bin' && hasSiblingCue(full)) continue
    // Skip archives when a folder of the same stem exists alongside —
    // means the user already extracted it (and the .zip is just kept around).
    // Without this we get duplicate library entries for Beat Saber etc.
    if ((ext === 'zip' || ext === '7z' || ext === 'rar') && hasSiblingExtractedFolder(full)) continue
    // Skip PS4 DLC/update/patch pkgs — they aren't standalone games.
    if (ext === 'pkg' && isAuxiliaryPackage(full, entry)) continue
    if (isIgnoredInternalAsset(full, ext)) continue
    if (isIgnoredPcCandidate(full, entry, ext)) continue
    out.push(full)
  }

  for (const { entry, full } of dirs) {
    if (Date.now() > deadline) return
    const lower = entry.toLowerCase()
    if (SKIP_DIRS.has(lower)) continue
    if (SKIP_PREFIXES.some((p) => lower.startsWith(p))) continue
    if (lower === 'wad' && full.toLowerCase().includes('\\pc\\')) continue
    // Skip subtrees that are emulator installations — their bundled samples
    // and DLLs are not games.
    const fullLower = full.toLowerCase().replace(/\\+$/, '')
    if (emulatorPaths.has(fullLower)) continue
    // PS3 game folder is itself a candidate — but only do this expensive
    // probe when the parent or name suggests we might actually be near one.
    try {
      const children = readdirSync(full).map((c) => c.toLowerCase())
      if (children.includes('ps3_game')) {
        out.push(full)
        continue
      }
    } catch {
      /* unreadable, skip */
    }
    walk(full, out, emulatorPaths, deadline, onVisit)
  }
}

function isIgnoredPcCandidate(path: string, filename: string, ext: string): boolean {
  if (!['exe', 'bat', 'cmd', 'lnk', 'url', 'jar'].includes(ext)) return false
  const lowerName = filename.toLowerCase()
  if (INTERNAL_PC_EXE_PATTERNS.some((pattern) => pattern.test(lowerName))) return true
  const lowerPath = path.toLowerCase()
  return (
    lowerPath.includes('\\engine\\binaries\\') ||
    lowerPath.includes('\\launcher\\') ||
    lowerPath.includes('\\installer\\') ||
    lowerPath.includes('\\redist\\') ||
    lowerPath.includes('\\support\\') ||
    lowerPath.includes('\\_commonredist\\') ||
    lowerPath.includes('\\easyanticheat\\') ||
    lowerPath.includes('\\artbook') ||
    lowerPath.includes('\\soundtrack')
  )
}

function isIgnoredInternalAsset(path: string, ext: string): boolean {
  if (!['bin', 'gz', 'wad'].includes(ext)) return false
  const lowerName = basename(path).toLowerCase()
  if (
    lowerName === 'snapshot_blob.bin' ||
    lowerName === 'v8_context_snapshot.bin' ||
    lowerName === 'catalog.bin' ||
    lowerName === 'regulation.bin'
  ) {
    return true
  }
  const lower = path.toLowerCase()
  if (ext === 'wad' && (lower.includes('\\exec\\wad\\') || lower.includes('\\pc_le\\'))) {
    return true
  }
  return (
    lower.includes('\\engine\\') ||
    lower.includes('\\binaries\\') ||
    lower.includes('\\content\\renderer\\') ||
    lower.includes('\\certificates\\') ||
    lower.includes('\\easyanticheat\\') ||
    lower.includes('\\riotclientelectron\\') ||
    lower.includes('\\cef3\\')
  )
}

function hasSiblingExtractedFolder(archivePath: string): boolean {
  const dir = archivePath.substring(0, archivePath.lastIndexOf('\\'))
  const stem = basename(archivePath, extname(archivePath)).toLowerCase()
  try {
    return readdirSync(dir).some((f) => {
      if (f.toLowerCase() === basename(archivePath).toLowerCase()) return false
      try {
        const st = statSync(join(dir, f))
        return st.isDirectory() && f.toLowerCase() === stem
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

function isPs4Auxiliary(filename: string): boolean {
  const lower = filename.toLowerCase()
  // Match common auxiliary tags. We're permissive on patch/update/dlc/theme/
  // language naming because PS4 .pkg naming is wildly inconsistent across
  // dumpers.
  return /\b(dlc|update|patch|theme|app\b.*\bpatch|fix|trainer)\b/.test(lower)
}

function isAuxiliaryPackage(path: string, filename: string): boolean {
  const lowerPath = path.toLowerCase()
  return isPs4Auxiliary(filename) || lowerPath.includes('\\dlc\\')
}

function hasSiblingCue(binPath: string): boolean {
  const dir = binPath.substring(0, binPath.lastIndexOf('\\'))
  const stem = basename(binPath, '.bin').toLowerCase().replace(/\s*\(track\s*\d+\)\s*$/i, '')
  try {
    return readdirSync(dir).some(
      (f) =>
        f.toLowerCase().endsWith('.cue') &&
        f.toLowerCase().includes(stem.split(' ')[0])
    )
  } catch {
    return false
  }
}

function classify(
  path: string,
  emulators: DetectedEmulator[],
  previous: Map<string, Game>
): Game | null {
  const det = detectPlatform(path)
  const platform = det.platform
  if (platform === 'unknown' && det.confidence < 0.3) {
    return null
  }

  let st
  try {
    st = statSync(path)
  } catch {
    return null
  }

  const title = bestTitleFor(path)
  const id = createHash('sha1').update(resolve(path).toLowerCase()).digest('hex').slice(0, 16)
  const prev = previous.get(id)

  const matchedEmulator = platform === 'pc' ? undefined : pickEmulator(platform, emulators)
  const status = platform === 'pc' ? 'ready' : computeStatus(det, matchedEmulator)

  const game: Game = {
    id,
    title: prev?.title ?? title,
    path,
    platform,
    emulator: platform === 'pc' ? 'native' : matchedEmulator?.id,
    sizeBytes: st.isDirectory() ? 0 : st.size,
    confidence: det.confidence,
    status,
    addedAt: prev?.addedAt ?? new Date().toISOString(),
    lastPlayedAt: prev?.lastPlayedAt,
    playTime: prev?.playTime ?? 0,
    favorite: prev?.favorite ?? false,
    cover: prev?.cover,
    banner: prev?.banner,
    description: prev?.description,
    genre: prev?.genre,
    developer: prev?.developer,
    year: prev?.year,
    flags: det.flags,
    relatedFiles: []
  }
  return game
}

function pickEmulator(
  platform: PlatformId,
  emulators: DetectedEmulator[]
): DetectedEmulator | undefined {
  // Honour the per-platform override learned from prior successful fallbacks.
  // The launcher writes this when an alternate emulator survives past the
  // failure threshold — so e.g. once psxfin works, we stop scanning new PS1
  // games into a known-broken ePSXe slot.
  const preferred = settingsStore.load().platformEmulators[platform]
  if (preferred) {
    const found = emulators.find((e) => e.id === preferred)
    if (found) return found
  }
  const order = PLATFORMS[platform].emulators
  for (const id of order) {
    const found = emulators.find((e) => e.id === id)
    if (found) return found
  }
  return undefined
}

function computeStatus(det: { confidence: number; flags: string[] }, emu?: DetectedEmulator): GameStatus {
  if (det.flags.some((f) => f.includes('suspeito') || f.includes('compactado'))) return 'corrupted'
  if (!emu) return 'missing-emulator'
  const def = EMULATORS[emu.id]
  if (def?.needsBios) return 'missing-bios'
  return 'ready'
}

function indexPrevious(): Map<string, Game> {
  const idx = new Map<string, Game>()
  for (const g of libraryStore.load().games) idx.set(g.id, g)
  return idx
}

/**
 * PC folders often contain many helper executables (crash handlers, language
 * selectors, redists, artbooks). Keep only the best launcher per game root.
 */
function prunePcLaunchers(games: Game[]): Game[] {
  const keep: Game[] = []
  const bestByRoot = new Map<string, { game: Game; score: number }>()
  const sizeByRoot = new Map<string, number>()
  for (const game of games) {
    if (game.platform !== 'pc') {
      keep.push(game)
      continue
    }
    const ext = extname(game.path).toLowerCase()
    if (!['.exe', '.bat', '.cmd', '.lnk', '.url', '.jar'].includes(ext)) continue
    const rootDir = pcCollectionRootDir(game.path)
    const root = rootDir.toLowerCase()
    const score = scorePcLauncherCandidate(game)
    const current = bestByRoot.get(root)
    if (!current || score > current.score) {
      bestByRoot.set(root, { game, score })
    }
  }
  for (const [root, { game }] of bestByRoot.entries()) {
    let installSize = sizeByRoot.get(root)
    if (installSize === undefined) {
      installSize = directorySizeBytes(pcCollectionRootDir(game.path))
      sizeByRoot.set(root, installSize)
    }
    keep.push({
      ...game,
      emulator: 'native',
      status: 'ready',
      sizeBytes: installSize > 0 ? installSize : game.sizeBytes
    })
  }
  return keep
}

function pcCollectionRoot(path: string): string {
  return pcCollectionRootDir(path).toLowerCase()
}

function pcCollectionRootDir(path: string): string {
  const parts = path.split(/[\\/]+/)
  const pcIndex = parts.findIndex((part) => part.toLowerCase() === 'pc')
  if (pcIndex >= 0 && parts.length > pcIndex + 1) {
    return parts.slice(0, pcIndex + 2).join('\\')
  }
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

function scorePcLauncherCandidate(game: Game): number {
  const lowerPath = game.path.toLowerCase()
  const filename = basename(lowerPath)
  const base = basename(lowerPath, extname(lowerPath))
  const ext = extname(lowerPath)
  const root = pcCollectionRoot(game.path).split('\\').pop() ?? ''
  const cleanBase = base.replace(/[^a-z0-9]+/g, '')
  const cleanRoot = root.toLowerCase().replace(/[^a-z0-9]+/g, '')
  let score = 0
  if (ext === '.exe') score += 240
  if (lowerPath.includes('\\game\\')) score += 110
  if (cleanBase && cleanRoot && (cleanBase.includes(cleanRoot) || cleanRoot.includes(cleanBase))) {
    score += 180
  }
  if (/\bstart\b|\bplay\b|\blaunch\b/.test(base)) score += 35
  if (/\bprotected\b|easyanticheat|artbook|soundtrack|benchmark|language selector/.test(base)) {
    score -= 260
  }
  if (INTERNAL_PC_EXE_PATTERNS.some((pattern) => pattern.test(filename))) score -= 220
  if (
    lowerPath.includes('\\_commonredist\\') ||
    lowerPath.includes('\\redist\\') ||
    lowerPath.includes('\\support\\') ||
    lowerPath.includes('\\tools\\') ||
    lowerPath.includes('\\engine\\')
  ) {
    score -= 220
  }
  score += Math.log2(Math.max(game.sizeBytes, 1))
  return score
}

/**
 * Collapse duplicates. We pick the "best" representative per (platform, title)
 * key, where best = highest detection confidence, breaking ties by file size.
 * Multi-track .cue games are always preferred over loose .bin tracks.
 */
function dedupeGames(games: Game[]): Game[] {
  const byKey = new Map<string, Game>()
  for (const g of games) {
    const key = `${g.platform}::${normalizeTitle(g.title)}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, g)
      continue
    }
    if (scoreCandidate(g) > scoreCandidate(existing)) {
      byKey.set(key, g)
    }
  }
  return Array.from(byKey.values())
}

function normalizeTitle(title: string): string {
  // Drop edition/version/region noise that creates false-positive duplicates:
  // "Beat Saber v1.72 PSVR" and "Beat Saber v1.72 and DLC PSVR" should
  // collapse to the same key.
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bv\d+(\s+\d+)*\b/g, ' ')
    .replace(/\b(psvr|psn|cusa\d+|slus\d+|slpm\d+|ps4|ps3)\b/g, ' ')
    .replace(/\b(and|with|incl|including|plus)\s+dlc\b/g, ' ')
    .replace(/\bdlc\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreCandidate(g: Game): number {
  return g.confidence * 1000 + Math.log2(Math.max(g.sizeBytes, 1))
}

function enrichPcPlaytimeFromSteam(games: Game[]): number {
  const steam = detectSteamGames({ includeSizes: false }).filter(
    (g) => (g.playtimeMinutes ?? 0) > 0 || (g.lastPlayedUnix ?? 0) > 0
  )
  if (steam.length === 0) return 0

  const byAppId = new Map<string, SteamGame>()
  const byInstallDir = new Map<string, SteamGame>()
  const byTitle = new Map<string, SteamGame[]>()
  for (const sg of steam) {
    byAppId.set(sg.appId, sg)
    const dirKey = normalizePathKey(sg.installDir)
    if (dirKey) byInstallDir.set(dirKey, sg)
    const key = normalizeTitle(sg.name)
    const list = byTitle.get(key) ?? []
    list.push(sg)
    byTitle.set(key, list)
  }

  let touched = 0
  for (const game of games) {
    if (game.platform !== 'pc') continue
    const fromUri = game.path.match(/^steam:\/\/rungameid\/(\d+)/i)?.[1]
    const byUri = fromUri ? byAppId.get(fromUri) : undefined
    const byPath = matchSteamByInstallDir(game.path, byInstallDir)
    const byName = pickSteamByTitle(game, byTitle)
    const best = byUri ?? byPath ?? byName
    if (!best) continue

    const steamSeconds = Math.max(0, Math.round((best.playtimeMinutes ?? 0) * 60))
    const steamLastPlayed = best.lastPlayedUnix && best.lastPlayedUnix > 0
      ? new Date(best.lastPlayedUnix * 1000).toISOString()
      : undefined
    const nextPlay = Math.max(game.playTime ?? 0, steamSeconds)
    const nextLast = latestIso(game.lastPlayedAt, steamLastPlayed)
    if (nextPlay === (game.playTime ?? 0) && nextLast === game.lastPlayedAt) continue

    game.playTime = nextPlay
    game.lastPlayedAt = nextLast
    const flags = new Set(game.flags ?? [])
    flags.add('steam-playtime')
    game.flags = Array.from(flags)
    touched += 1
  }
  return touched
}

function matchSteamByInstallDir(path: string, byInstallDir: Map<string, SteamGame>): SteamGame | undefined {
  const normalized = normalizePathKey(path)
  if (!normalized) return undefined
  let best: SteamGame | undefined
  let bestLen = -1
  for (const [dir, sg] of byInstallDir.entries()) {
    if (normalized.startsWith(dir) && dir.length > bestLen) {
      best = sg
      bestLen = dir.length
    }
  }
  return best
}

function pickSteamByTitle(game: Game, byTitle: Map<string, SteamGame[]>): SteamGame | undefined {
  const key = normalizeTitle(game.title)
  const candidates = byTitle.get(key)
  if (!candidates || candidates.length === 0) return undefined
  if (candidates.length === 1) return candidates[0]
  return candidates.reduce((best, cur) => {
    const bestPlayed = best.lastPlayedUnix ?? 0
    const curPlayed = cur.lastPlayedUnix ?? 0
    return curPlayed > bestPlayed ? cur : best
  })
}

function normalizePathKey(path: string | undefined): string {
  if (!path) return ''
  if (path.includes('://')) return path.toLowerCase()
  return resolve(path).toLowerCase().replace(/[\\/]+/g, '\\')
}

function latestIso(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

/**
 * Pick the best title for a game file.
 *
 * Strategy:
 *   1. Strip extension and clean the bare filename.
 *   2. If the stripped name looks like a No-Intro disc serial (SLUS-21361,
 *      SCUS-97328 etc.), look it up in our local serials DB.
 *   3. If the DB doesn't know it but the parent folder isn't itself a serial
 *      or platform name, prefer the parent folder name — it's almost always
 *      the actual game name when files are organised in per-game folders.
 *   4. Otherwise return the cleaned filename.
 *
 * This fixes the common case where files come as "SLUS-21361 (1.00).iso"
 * inside "God of War II/" — without lookup we'd show "SLUS-21361" forever.
 */
function bestTitleFor(filePath: string): string {
  const isDirectory = existsSync(filePath) && statSync(filePath).isDirectory()
  const file = isDirectory ? basename(filePath) : basename(filePath, extname(filePath))
  const cleaned = prettifyTitle(file)

  // Step 2 — try to peel a serial out of the filename. The cleaned name might
  // be "SLUS-21361" directly, or be empty (parens were the only content).
  const serialMatch = file.match(/(SCUS|SLUS|SLES|SCES|SLPS|SLPM|SCPS|PBPX|SCED)-\d+/i)
  if (serialMatch) {
    const fromDb = lookupSerial(serialMatch[0])
    if (fromDb) return fromDb
  }

  // Step 3 — fall back to parent folder when the cleaned name is just a
  // serial or empty. Multi-level: try grandparent if parent is also a serial.
  if (!cleaned || looksLikeDiscSerial(cleaned) || looksGeneratedTitle(cleaned)) {
    const parts = filePath.split(/[\\/]/)
    // Walk up at most 2 dirs looking for a sensible folder name
    for (let levelsUp = 1; levelsUp <= 2 && parts.length > levelsUp; levelsUp++) {
      const folder = parts[parts.length - 1 - levelsUp]
      if (!folder) continue
      const folderClean = prettifyTitle(folder)
      if (!folderClean) continue
      if (looksLikeDiscSerial(folderClean)) continue
      // Skip platform-name folders that aren't game titles
      if (/^(ps[123]|psp|psx|xbox|wii|gamecube|nes|snes|n64|gb[ac]?|nds|3ds)$/i.test(folderClean)) {
        continue
      }
      return folderClean
    }
  }

  return cleaned || file
}

function prettifyTitle(raw: string): string {
  // NB: the caller already strips the extension via basename(path, extname(path)),
  // so we must not run a generic ".whatever" trim here — it would chew off
  // dotted suffixes inside the name (e.g. "SLUS-21361 (1.00)" → "SLUS-21361 (1").
  return raw
    .replace(/[_]+/g, ' ')
    .replace(/\s*\([^)]+\)/g, '')
    .replace(/\s*\[[^\]]+\]/g, '')
    // Strip leading No-Intro index ("0479 - New Super Mario Bros." → game name)
    .replace(/^\d{2,5}\s*[-.\s]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksGeneratedTitle(title: string): boolean {
  const compact = title.replace(/[^a-z0-9]/gi, '')
  return compact.length >= 32 && !/\s/.test(title)
}

function publish(progress: ScanProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.library.progress, progress)
  }
}

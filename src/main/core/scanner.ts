import { readdirSync, statSync } from 'node:fs'
import { join, basename, extname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { detectPlatform } from './detector'
import { detectEmulators } from './emulators'
import { reconcileBiosStatus } from './bios'
import { libraryStore } from './store'
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
  'ppu_progs',
  'spu_progs'
])

// Skip any directory whose lowercase name starts with one of these prefixes.
// Catches Sony's `dev_hdd0`, `dev_flash`, `dev_flash2`, `dev_bdvd`,
// `dev_usb000`, etc. without listing every variant.
const SKIP_PREFIXES = ['dev_', 'rpcs3_', 'pcsx2_']

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
  const deadline = Date.now() + 25_000

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
  const games = dedupeGames(raw)
  if (games.length !== raw.length) {
    log.info('scanner', `deduplicated ${raw.length - games.length} duplicate(s)`)
  }

  // 3c. Promote missing-bios → ready when the BIOS is actually present on disk.
  // We can't do this in `computeStatus` because that runs before we've seen
  // the full picture of detected emulators.
  reconcileBiosStatus(games, emulators)

  // 4. Persist
  libraryStore.save(games, emulators)
  progress.phase = 'done'
  progress.current = undefined
  publish(progress)
  scanning = false

  const result: ScanResult = {
    games,
    emulators,
    durationMs: Date.now() - startedAt,
    errors
  }
  log.info('scanner', `scan complete: ${games.length} games in ${result.durationMs}ms`)
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

    if (st.isDirectory()) {
      const lower = entry.toLowerCase()
      if (SKIP_DIRS.has(lower)) continue
      if (SKIP_PREFIXES.some((p) => lower.startsWith(p))) continue
      // Skip subtrees that are emulator installations — their bundled samples
      // and DLLs are not games.
      const fullLower = full.toLowerCase().replace(/\\+$/, '')
      if (emulatorPaths.has(fullLower)) continue
      // PS3 game folder is itself a candidate — but only do this expensive
      // probe when the parent or name suggests we might actually be near one.
      if (lower.includes('ps3') || lower.includes('jogos') || lower.includes('games')) {
        try {
          const children = readdirSync(full).map((c) => c.toLowerCase())
          if (children.includes('ps3_game')) {
            out.push(full)
            continue
          }
        } catch {
          /* unreadable, skip */
        }
      }
      walk(full, out, emulatorPaths, deadline, onVisit)
      continue
    }

    const ext = extname(entry).slice(1).toLowerCase()
    if (!ext) continue
    if (!KNOWN_EXTENSIONS.has(ext)) continue
    // Skip multi-track BINs — the parent .cue represents the game
    if (ext === 'bin' && hasSiblingCue(full)) continue
    out.push(full)
  }
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

  const title = prettifyTitle(basename(path, extname(path)))
  const id = createHash('sha1').update(resolve(path).toLowerCase()).digest('hex').slice(0, 16)
  const prev = previous.get(id)

  const matchedEmulator = pickEmulator(platform, emulators)
  const status = computeStatus(det, matchedEmulator)

  const game: Game = {
    id,
    title: prev?.title ?? title,
    path,
    platform,
    emulator: matchedEmulator?.id,
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
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function scoreCandidate(g: Game): number {
  return g.confidence * 1000 + Math.log2(Math.max(g.sizeBytes, 1))
}

function prettifyTitle(raw: string): string {
  // NB: the caller already strips the extension via basename(path, extname(path)),
  // so we must not run a generic ".whatever" trim here — it would chew off
  // dotted suffixes inside the name (e.g. "SLUS-21361 (1.00)" → "SLUS-21361 (1").
  return raw
    .replace(/[_]+/g, ' ')
    .replace(/\s*\([^)]+\)/g, '')
    .replace(/\s*\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function publish(progress: ScanProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.library.progress, progress)
  }
}

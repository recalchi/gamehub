import { writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { PATHS } from './paths'
import { libraryStore } from './store'
import { log } from './logger'
import { IPC } from '@shared/ipc'
import type { Game, PlatformId } from '@shared/types'

// Cover art service.
//
// We fetch box art (and optional title/screenshot) from the public libretro
// thumbnails repository — https://thumbnails.libretro.com/. It has no API
// key requirement, is fast, and has very wide coverage for the platforms
// GameHub targets. Each platform has three top-level folders:
//
//   /<System>/Named_Boxarts/<Title>.png
//   /<System>/Named_Titles/<Title>.png
//   /<System>/Named_Snaps/<Title>.png
//
// Filename rules (libretro's quirk): the chars &, *, slash, colon, backtick,
// <, >, ?, backslash, pipe, and double-quote all become "_". Anything else
// in the No-Intro filename is kept verbatim.
//
// We try a small list of title variants because users rarely have the exact
// No-Intro filename. If none hit, we just leave cover empty and retry next
// scan — there's no negative cache yet.

const LIBRETRO_BASE = 'https://thumbnails.libretro.com'

const LIBRETRO_SYSTEMS: Partial<Record<PlatformId, string>> = {
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  n64: 'Nintendo - Nintendo 64',
  gamecube: 'Nintendo - GameCube',
  wii: 'Nintendo - Wii',
  gb: 'Nintendo - Game Boy',
  gbc: 'Nintendo - Game Boy Color',
  gba: 'Nintendo - Game Boy Advance',
  nds: 'Nintendo - Nintendo DS',
  n3ds: 'Nintendo - Nintendo 3DS',
  ps1: 'Sony - PlayStation',
  ps2: 'Sony - PlayStation 2',
  ps3: 'Sony - PlayStation 3',
  psp: 'Sony - PlayStation Portable',
  xbox: 'Microsoft - Xbox'
}

/** Libretro escapes these characters in filenames */
function libretroSafe(title: string): string {
  return title.replace(/[&*/:`<>?\\|"]/g, '_')
}

/**
 * Generate a small set of candidate titles to try. Real No-Intro filenames
 * include region tags like " (USA)" or " (Europe)" — we try the bare title
 * first, then a couple of common region suffixes.
 */
function titleVariants(title: string): string[] {
  const base = title.trim()
  return [
    base,
    `${base} (USA)`,
    `${base} (Europe)`,
    `${base} (Japan)`,
    `${base} (World)`,
    `${base} (USA, Europe)`
  ]
}

interface CoverResult {
  cover?: string
  banner?: string
  screenshot?: string
}

async function tryFetch(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url, { method: 'GET' })
    if (!r.ok) return null
    return await r.arrayBuffer()
  } catch (err) {
    log.debug('covers', `fetch failed ${url}: ${String(err)}`)
    return null
  }
}

async function fetchOne(
  system: string,
  folder: 'Named_Boxarts' | 'Named_Titles' | 'Named_Snaps',
  title: string,
  destPath: string
): Promise<boolean> {
  for (const variant of titleVariants(title)) {
    const url = `${LIBRETRO_BASE}/${encodeURIComponent(system)}/${folder}/${encodeURIComponent(
      libretroSafe(variant)
    )}.png`
    const data = await tryFetch(url)
    if (data) {
      await writeFile(destPath, Buffer.from(data))
      log.info('covers', `${folder} hit for "${title}" via "${variant}"`)
      return true
    }
  }
  return false
}

/**
 * Resolve cover + title-screen + snapshot for a single game.
 * Returns file:// paths so the renderer can render directly.
 */
async function fetchCoversFor(game: Game): Promise<CoverResult> {
  const system = LIBRETRO_SYSTEMS[game.platform]
  if (!system) return {}

  const coverPath = join(PATHS.covers, `${game.id}.png`)
  const bannerPath = join(PATHS.banners, `${game.id}.png`)

  const out: CoverResult = {}

  if (existsSync(coverPath)) {
    out.cover = `file:///${coverPath.replace(/\\/g, '/')}`
  } else if (await fetchOne(system, 'Named_Boxarts', game.title, coverPath)) {
    out.cover = `file:///${coverPath.replace(/\\/g, '/')}`
  }

  if (existsSync(bannerPath)) {
    out.banner = `file:///${bannerPath.replace(/\\/g, '/')}`
  } else if (await fetchOne(system, 'Named_Titles', game.title, bannerPath)) {
    out.banner = `file:///${bannerPath.replace(/\\/g, '/')}`
  }

  return out
}

let enriching = false
const ENRICH_CONCURRENCY = 6

/**
 * Walk all games in the library and fetch their cover art in the background.
 * Sends incremental updates to the renderer so cards "fill in" as art lands.
 *
 * Concurrency is capped so we don't pummel libretro's CDN — 6 parallel fetches
 * is more than enough to keep the wire saturated and still play nice.
 */
export async function enrichLibrary(): Promise<{ updated: number; skipped: number }> {
  if (enriching) {
    log.warn('covers', 'enrichment already running')
    return { updated: 0, skipped: 0 }
  }
  enriching = true
  let updated = 0
  let skipped = 0
  try {
    const data = libraryStore.load()
    const todo = data.games.filter((g) => !g.cover)
    skipped = data.games.length - todo.length

    publishProgress('enriching', 0, data.games.length - skipped)

    // Simple worker pool — pull from a shared queue until empty
    let idx = 0
    let done = 0
    async function worker(): Promise<void> {
      while (idx < todo.length) {
        const i = idx++
        const game = todo[i]
        const r = await fetchCoversFor(game)
        if (r.cover || r.banner) {
          libraryStore.patchGame(game.id, { cover: r.cover, banner: r.banner })
          updated++
          publishOne(game.id, r)
        } else {
          skipped++
        }
        done++
        publishProgress('enriching', done, todo.length)
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(ENRICH_CONCURRENCY, todo.length) }, () => worker())
    )
    publishProgress('done', todo.length, todo.length)
    log.info('covers', `enrichment complete: ${updated} updated, ${skipped} skipped`)
    return { updated, skipped }
  } finally {
    enriching = false
  }
}

function publishProgress(
  phase: 'enriching' | 'done',
  scanned: number,
  found: number
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.library.progress, { phase, scanned, found })
  }
}

function publishOne(gameId: string, patch: CoverResult): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.library.coverUpdated, { gameId, ...patch })
  }
}

/** Force-refresh a single game's covers (e.g. user clicked "fetch covers"). */
export async function fetchSingle(gameId: string): Promise<CoverResult | null> {
  const data = libraryStore.load()
  const game = data.games.find((g) => g.id === gameId)
  if (!game) return null
  const r = await fetchCoversFor(game)
  if (r.cover || r.banner) {
    libraryStore.patchGame(gameId, { cover: r.cover, banner: r.banner })
    publishOne(gameId, r)
  }
  return r
}

/**
 * Replace the cover for a game with a user-picked local image.
 *
 * We copy the source file into our managed cache so deleting the original
 * doesn't break the cover, and so the image survives moves of the original
 * game file. The file is renamed to `<gameId>.<ext>` to keep cache cleanup
 * trivial.
 */
export async function setManualCover(
  gameId: string,
  sourcePath: string
): Promise<{ cover: string } | { error: string }> {
  const data = libraryStore.load()
  const game = data.games.find((g) => g.id === gameId)
  if (!game) return { error: 'Jogo não encontrado.' }
  if (!existsSync(sourcePath)) return { error: 'Arquivo de imagem não encontrado.' }

  // Preserve extension (jpg/png/webp all work in <img>)
  const ext = sourcePath.toLowerCase().match(/\.(png|jpg|jpeg|webp|gif)$/)?.[1] ?? 'png'
  const destPath = join(PATHS.covers, `${gameId}.${ext}`)
  try {
    const buf = await import('node:fs/promises').then((m) => m.readFile(sourcePath))
    await writeFile(destPath, buf)
    const url = `file:///${destPath.replace(/\\/g, '/')}`
    libraryStore.patchGame(gameId, { cover: url })
    publishOne(gameId, { cover: url })
    log.info('covers', `manual cover set for ${gameId}: ${sourcePath} → ${destPath}`)
    return { cover: url }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('covers', `manual cover failed: ${msg}`)
    return { error: msg }
  }
}

/** How many .png files do we have cached locally? */
export async function coverCacheStats(): Promise<{ covers: number; banners: number }> {
  const [c, b] = await Promise.all([
    readdir(PATHS.covers).catch(() => []),
    readdir(PATHS.banners).catch(() => [])
  ])
  return {
    covers: c.filter((f) => f.endsWith('.png')).length,
    banners: b.filter((f) => f.endsWith('.png')).length
  }
}

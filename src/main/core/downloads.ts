import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { PATHS } from './paths'
import { addManualGame } from './manualGames'
import { libraryStore } from './store'
import { coverUrl } from './covers'
import { detectArchiveFormat, extractArchive } from './archiveTools'
import { log } from './logger'
import { IPC } from '@shared/ipc'
import { PLATFORMS } from '@shared/platforms'
import type { Game, PlatformId } from '@shared/types'

export interface StartDownloadInput {
  url: string
  /** intended title — also drives filename when URL has no extension */
  title: string
  platform: PlatformId
  /** destination directory; defaults to userData/downloads/<platform>/ */
  destinationDir?: string
}

export interface DownloadProgress {
  id: string
  url: string
  title: string
  state: 'starting' | 'downloading' | 'finished' | 'failed' | 'cancelled'
  /** bytes received so far */
  received: number
  /** total bytes if Content-Length was provided */
  total?: number
  /** instantaneous bytes/sec */
  speed: number
  /** if state=failed: the message */
  error?: string
  /** if state=finished: the absolute path */
  filePath?: string
  /** if state=finished: the game id we registered */
  gameId?: string
}

/**
 * Naive but practical download manager.
 *
 * Streams URL → file with progress events. Files land in
 * `userData/downloads/<platform>/<filename>` by default. Once finished we
 * register the file as a manual game so it appears in the library
 * immediately.
 *
 * No resume / no concurrency limit / no checksum verify — those are
 * follow-up work. Good enough for grabbing a homebrew zip or demo ISO.
 */

const active = new Map<string, { ctrl: AbortController; cancelled: boolean }>()

export async function startDownload(input: StartDownloadInput): Promise<{ id: string } | { error: string }> {
  if (!/^https?:\/\//i.test(input.url)) {
    return { error: 'URL inválida (precisa começar com http:// ou https://).' }
  }

  const id = randomUUID().slice(0, 8)
  const ctrl = new AbortController()
  active.set(id, { ctrl, cancelled: false })

  // Run the download in the background — return id immediately
  void runDownload(id, input, ctrl).finally(() => {
    setTimeout(() => active.delete(id), 30_000)
  })

  return { id }
}

export function cancelDownload(id: string): { ok: boolean } {
  const entry = active.get(id)
  if (!entry) return { ok: false }
  entry.cancelled = true
  entry.ctrl.abort()
  return { ok: true }
}

async function runDownload(
  id: string,
  input: StartDownloadInput,
  ctrl: AbortController
): Promise<void> {
  const destDir = input.destinationDir ?? join(PATHS.userData, 'downloads', input.platform)
  await mkdir(destDir, { recursive: true })

  // Derive filename: URL path basename, falling back to title
  const fromUrl = (() => {
    try {
      const u = new URL(input.url)
      const last = decodeURIComponent(u.pathname.split('/').pop() ?? '')
      return last.length > 0 ? last : null
    } catch {
      return null
    }
  })()
  const filename = fromUrl ?? `${sanitize(input.title)}.bin`
  const filePath = join(destDir, filename)

  publish({
    id,
    url: input.url,
    title: input.title,
    state: 'starting',
    received: 0,
    speed: 0
  })

  try {
    const r = await fetch(input.url, { signal: ctrl.signal })
    if (!r.ok || !r.body) {
      throw new Error(`HTTP ${r.status} ${r.statusText}`)
    }
    const total = Number(r.headers.get('content-length')) || undefined
    log.info('downloads', `${id}: starting ${input.url} → ${filePath} (total=${total ?? '?'})`)

    const reader = r.body.getReader()
    const stream = createWriteStream(filePath)
    let received = 0
    let lastEmit = 0
    let lastBytes = 0
    let lastTime = Date.now()
    let speed = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (active.get(id)?.cancelled) {
        stream.close()
        await unlink(filePath).catch(() => {})
        publish({
          id,
          url: input.url,
          title: input.title,
          state: 'cancelled',
          received,
          total,
          speed: 0
        })
        return
      }
      stream.write(Buffer.from(value))
      received += value.length

      // Throttled progress updates: every 500ms
      const now = Date.now()
      if (now - lastEmit > 500) {
        const elapsedSec = (now - lastTime) / 1000
        speed = elapsedSec > 0 ? (received - lastBytes) / elapsedSec : 0
        lastBytes = received
        lastTime = now
        lastEmit = now
        publish({
          id,
          url: input.url,
          title: input.title,
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

    const finalStat = await stat(filePath)
    log.info('downloads', `${id}: done ${received} bytes`)

    // If the download is actually an archive (zip/7z), extract it and
    // register the ROM/executable inside. Most homebrew distributes the game
    // in an archive alongside a manual/cover. We detect by magic bytes —
    // some hosts serve files without a proper extension in the URL.
    let registerPath = filePath
    let bundledCover: string | null = null
    const format = await detectArchiveFormat(filePath)
    if (format === 'zip' || format === '7z') {
      const extracted = await extractAndFindRom(filePath, input.platform)
      if (extracted.rom) {
        log.info('downloads', `${id}: extracted ROM (${format}) → ${extracted.rom}`)
        registerPath = extracted.rom
        bundledCover = extracted.cover
        // Clean up the original archive so we don't pollute Library with a
        // duplicate "corrupted" entry from a later scan.
        await unlink(filePath).catch(() => {})
      } else {
        log.warn(
          'downloads',
          `${id}: ${format} extraction yielded no recognized ROM for ${input.platform}`
        )
      }
    }

    // Register as a library entry
    const r2 = addManualGame({
      title: input.title,
      path: registerPath,
      platform: input.platform
    })
    const gameId = 'error' in r2 ? undefined : r2.id

    // If we found a cover image inside the archive, copy it into the managed
    // covers dir and attach to the game so the card stops showing the
    // placeholder.
    if (gameId && bundledCover) {
      const ext = extname(bundledCover).toLowerCase().replace('.', '') || 'png'
      const dest = join(PATHS.covers, `${gameId}.${ext}`)
      try {
        await copyFile(bundledCover, dest)
        const url = coverUrl(`${gameId}.${ext}`)
        libraryStore.patchGame(gameId, { cover: url })
        log.info('downloads', `${id}: bundled cover → ${dest}`)
      } catch (err) {
        log.warn('downloads', `${id}: failed to copy bundled cover: ${String(err)}`)
      }
    }

    publish({
      id,
      url: input.url,
      title: input.title,
      state: 'finished',
      received: finalStat.size,
      total: finalStat.size,
      speed: 0,
      filePath: registerPath,
      gameId
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('downloads', `${id}: ${msg}`)
    await unlink(filePath).catch(() => {})
    publish({
      id,
      url: input.url,
      title: input.title,
      state: 'failed',
      received: 0,
      speed: 0,
      error: msg
    })
  }
}

function publish(p: DownloadProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.downloads.progress, p)
  }
}

/** Image extensions we'll harvest as game cover candidates. */
const COVER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
/** Filename hints (case-insensitive) that strongly suggest a cover/box art. */
const COVER_HINTS = ['cover', 'box', 'front', 'label', 'art', 'banner', 'screen']

/**
 * Extract a downloaded archive and find both the playable game file and a
 * cover image candidate. ROM is the largest file with a platform-matching
 * extension. Cover is the largest image matching cover-hint patterns
 * (`label_nes.png` etc) or any image file as fallback.
 */
async function extractAndFindRom(
  archivePath: string,
  platform: PlatformId
): Promise<{ rom: string | null; cover: string | null }> {
  const def = PLATFORMS[platform]
  if (!def) return { rom: null, cover: null }
  const validExts = new Set(def.extensions.map((e) => `.${e.toLowerCase()}`))

  // Extract next to the archive into a subdir named after the file stem
  const destDir =
    archivePath.substring(0, archivePath.lastIndexOf('.')) || archivePath + '-extracted'

  const ok = await extractArchive(archivePath, destDir)
  if (!ok) {
    log.warn('downloads', `archive extraction failed for ${archivePath}`)
    return { rom: null, cover: null }
  }

  let bestRom: string | null = null
  let bestRomSize = 0
  let bestCoverHit: string | null = null
  let bestCoverHitSize = 0
  let bestCoverAny: string | null = null
  let bestCoverAnySize = 0

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4) return
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      let st
      try {
        st = await stat(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        await walk(full, depth + 1)
        continue
      }
      const ext = extname(entry).toLowerCase()
      // ROM candidate: largest file with platform-matching extension
      if (validExts.has(ext) && st.size > bestRomSize) {
        bestRomSize = st.size
        bestRom = full
      }
      // Cover candidate: prefer files with cover-hint names, else any image
      if (COVER_EXTENSIONS.has(ext)) {
        const lower = entry.toLowerCase()
        const hinted = COVER_HINTS.some((h) => lower.includes(h))
        if (hinted && st.size > bestCoverHitSize) {
          bestCoverHitSize = st.size
          bestCoverHit = full
        }
        if (st.size > bestCoverAnySize) {
          bestCoverAnySize = st.size
          bestCoverAny = full
        }
      }
    }
  }
  if (existsSync(destDir)) await walk(destDir, 0)
  return {
    rom: bestRom,
    cover: bestCoverHit ?? bestCoverAny
  }
}


function sanitize(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || 'download'
}

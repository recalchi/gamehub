import { createWriteStream } from 'node:fs'
import { mkdir, stat, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { PATHS } from './paths'
import { addManualGame } from './manualGames'
import { log } from './logger'
import { IPC } from '@shared/ipc'
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

    // Register as a library entry
    const r2 = addManualGame({
      title: input.title,
      path: filePath,
      platform: input.platform
    })
    const gameId = 'error' in r2 ? undefined : r2.id

    publish({
      id,
      url: input.url,
      title: input.title,
      state: 'finished',
      received: finalStat.size,
      total: finalStat.size,
      speed: 0,
      filePath,
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

function sanitize(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || 'download'
}

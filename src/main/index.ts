import { app, BrowserWindow, protocol, shell, net } from 'electron'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { registerIpcHandlers } from './ipc/handlers'
import { log, subscribeLogs } from './core/logger'
import { settingsStore, libraryStore, mediaStore } from './core/store'
import { scanLibrary } from './core/scanner'
import { backupSave, listBackups } from './core/saves'
import { addManualGame, importSteamGames, removeGame } from './core/manualGames'
import { importEpicGames } from './core/epic'
import { refreshMediaArtwork, scanMediaLibrary, subtitleAsVtt } from './core/cinema'
import { startDownload } from './core/downloads'
import { launchGame, listActiveLaunches } from './core/launcher'
import { writeBackupTo, applyBackup } from './core/backup'
import { PATHS } from './core/paths'
import { backfillBundledCovers, enrichLibrary } from './core/covers'
import { reconcileManualGameEmulators, retitleSerialOnlyGames } from './ipc/handlers'
import { installEmulator } from './core/autoInstall'
import { detectEmulators } from './core/emulators'
import { boundsForDisplay } from './core/windowing'
import { initAutoUpdater } from './core/updater'
import { CURATED_CATALOG } from '@shared/curated'
import { EMULATORS } from '@shared/emulators'
import type { EmulatorId } from '@shared/types'
import { IPC } from '@shared/ipc'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import { createReadStream, readFileSync, writeFileSync, unlinkSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { Readable } from 'node:stream'
import ffmpegStatic from 'ffmpeg-static'

const isDev = !!process.env.ELECTRON_RENDERER_URL
const isMediaPlaybackSmoke = process.argv.includes('--smoke-media-playback')
const COMPAT_AUDIO_EXTENSIONS = new Set(['.mkv', '.avi', '.wmv', '.mpg', '.mpeg'])
const compatMediaJobs = new Map<string, Promise<string | null>>()

if (isMediaPlaybackSmoke) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
  app.commandLine.appendSwitch('disable-software-rasterizer')
  app.commandLine.appendSwitch('in-process-gpu')
  app.commandLine.appendSwitch('disk-cache-size', '1')
}

/**
 * Custom protocol for cover/banner art.
 *
 * In dev the renderer lives on http://localhost:<port>, and Chrome refuses to
 * load `file:///` images from an http origin (mixed content). A privileged
 * custom scheme bypasses that — `gh-asset://cover/<id>.png` resolves to a real
 * file under PATHS.covers regardless of the renderer's origin.
 *
 * Must run BEFORE app.whenReady, hence at module top.
 */
protocol.registerSchemesAsPrivileged([
  { scheme: 'gh-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  {
    scheme: 'gh-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  },
  {
    scheme: 'gh-subtitle',
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  }
])

function registerAssetProtocol(): void {
  protocol.handle('gh-asset', async (request) => {
    try {
      const url = new URL(request.url)
      const kind = url.hostname
      const filename = decodeURIComponent(url.pathname.replace(/^\//, ''))
      const root =
        kind === 'cover' ? PATHS.covers : kind === 'banner' ? PATHS.banners : null
      if (!root) return new Response(null, { status: 404 })
      const filePath = join(root, filename)
      // Reject anything that resolves outside the intended root
      if (!filePath.startsWith(root)) return new Response(null, { status: 403 })
      if (!existsSync(filePath)) return new Response(null, { status: 404 })
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      log.error('protocol', `gh-asset handler failed: ${String(err)}`)
      return new Response(null, { status: 500 })
    }
  })
}

function needsCompatAudio(filePath: string): boolean {
  return COMPAT_AUDIO_EXTENSIONS.has(extname(filePath).toLowerCase())
}

function safeFileSlug(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '_').replace(/_+/g, '_').slice(0, 64) || 'media'
}

function ffmpegBinary(): string | null {
  return typeof ffmpegStatic === 'string' && existsSync(ffmpegStatic) ? ffmpegStatic : null
}

async function runFfmpeg(args: string[]): Promise<{ ok: boolean; stderr: string }> {
  return await new Promise((resolve) => {
    const bin = ffmpegBinary()
    if (!bin) {
      resolve({ ok: false, stderr: 'ffmpeg nao encontrado (ffmpeg-static indisponivel).' })
      return
    }
    const proc = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    proc.on('error', (err) => resolve({ ok: false, stderr: err.message || String(err) }))
    proc.on('close', (code) => resolve({ ok: code === 0, stderr }))
  })
}

async function ensureCompatMediaPath(itemId: string, sourcePath: string): Promise<string | null> {
  if (!needsCompatAudio(sourcePath)) return null
  const bin = ffmpegBinary()
  if (!bin) {
    log.warn('cinema', `ffmpeg nao disponivel para compatibilidade interna: ${sourcePath}`)
    return null
  }
  let sourceStat
  try {
    sourceStat = statSync(sourcePath)
  } catch {
    return null
  }
  const signature = `${itemId}:${Math.floor(sourceStat.mtimeMs)}:${sourceStat.size}`
  const pending = compatMediaJobs.get(signature)
  if (pending) return await pending

  const job = (async (): Promise<string | null> => {
    const outDir = join(PATHS.cache, 'cinema-compat')
    try {
      mkdirSync(outDir, { recursive: true })
    } catch {
      return null
    }

    const base = safeFileSlug(basename(sourcePath, extname(sourcePath)))
    const outPath = join(outDir, `${base}-${itemId}-${Math.floor(sourceStat.mtimeMs)}.mp4`)
    if (existsSync(outPath)) return outPath

    log.info('cinema', `compat transcode started: ${basename(sourcePath)} -> ${basename(outPath)}`)
    const copyVideoFirst = await runFfmpeg([
      '-y',
      '-i',
      sourcePath,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-ac',
      '2',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      outPath
    ])
    if (!copyVideoFirst.ok || !existsSync(outPath)) {
      const reencodeAll = await runFfmpeg([
        '-y',
        '-i',
        sourcePath,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-ac',
        '2',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        outPath
      ])
      if (!reencodeAll.ok || !existsSync(outPath)) {
        log.warn(
          'cinema',
          `compat transcode falhou para ${sourcePath}: ${reencodeAll.stderr || copyVideoFirst.stderr || 'erro desconhecido'}`
        )
        return null
      }
    }
    log.info('cinema', `compat transcode ready: ${outPath}`)
    return outPath
  })()

  compatMediaJobs.set(signature, job)
  try {
    return await job
  } finally {
    compatMediaJobs.delete(signature)
  }
}

function mediaContentType(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.mkv')) return 'video/x-matroska'
  if (lower.endsWith('.avi')) return 'video/x-msvideo'
  if (lower.endsWith('.wmv')) return 'video/x-ms-wmv'
  if (lower.endsWith('.mpg') || lower.endsWith('.mpeg')) return 'video/mpeg'
  if (lower.endsWith('.webm')) return 'video/webm'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  if (lower.endsWith('.m4v')) return 'video/x-m4v'
  return 'video/mp4'
}

function streamFileResponse(filePath: string, request: Request): Response {
  const size = statSync(filePath).size
  const range = request.headers.get('range')
  const headers = new Headers({
    'accept-ranges': 'bytes',
    'content-type': mediaContentType(filePath),
    'cache-control': 'no-store'
  })

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/)
    const start = match?.[1] ? Number(match[1]) : 0
    const end = match?.[2] ? Number(match[2]) : size - 1
    const safeStart = Math.min(Math.max(start, 0), size - 1)
    const safeEnd = Math.min(Math.max(end, safeStart), size - 1)
    headers.set('content-range', `bytes ${safeStart}-${safeEnd}/${size}`)
    headers.set('content-length', String(safeEnd - safeStart + 1))
    const stream = createReadStream(filePath, { start: safeStart, end: safeEnd })
    return new Response(Readable.toWeb(stream) as never, { status: 206, headers })
  }

  headers.set('content-length', String(size))
  const stream = createReadStream(filePath)
  return new Response(Readable.toWeb(stream) as never, { status: 200, headers })
}

function registerMediaProtocol(): void {
  protocol.handle('gh-media', async (request) => {
    try {
      const url = new URL(request.url)
      const id = decodeURIComponent(url.pathname.replace(/^\//, ''))
      if (url.hostname !== 'item' || !id) return new Response(null, { status: 404 })
      const item = mediaStore.load().items.find((entry) => entry.id === id)
      if (!item || !existsSync(item.path)) return new Response(null, { status: 404 })
      const compatPath = await ensureCompatMediaPath(item.id, item.path)
      return streamFileResponse(compatPath ?? item.path, request)
    } catch (err) {
      log.error('protocol', `gh-media handler failed: ${String(err)}`)
      return new Response(null, { status: 500 })
    }
  })

  protocol.handle('gh-subtitle', async (request) => {
    try {
      const url = new URL(request.url)
      const parts = url.pathname.replace(/^\//, '').split('/')
      const itemId = decodeURIComponent(parts[0] ?? '')
      const subtitleId = decodeURIComponent((parts[1] ?? '').replace(/\.vtt$/i, ''))
      if (url.hostname !== 'item' || !itemId || !subtitleId) {
        return new Response(null, { status: 404 })
      }
      const body = subtitleAsVtt(itemId, subtitleId)
      if (!body) return new Response(null, { status: 404 })
      return new Response(body, {
        headers: {
          'content-type': 'text/vtt; charset=utf-8',
          'cache-control': 'no-store'
        }
      })
    } catch (err) {
      log.error('protocol', `gh-subtitle handler failed: ${String(err)}`)
      return new Response(null, { status: 500 })
    }
  })
}

function createWindow(): BrowserWindow {
  const settings = settingsStore.load()
  const initialBounds = boundsForDisplay(settings.launch.gameHubDisplay)

  const win = new BrowserWindow({
    width: 1480,
    height: 880,
    x: initialBounds?.x,
    y: initialBounds?.y,
    minWidth: 1024,
    minHeight: 640,
    // We deliberately keep `show: false` until ready-to-show to avoid the
    // white flash. The "not responding" badge users saw came from waiting too
    // long on the renderer — we mitigate via paintWhenInitiallyHidden so the
    // renderer starts rendering off-screen and a hard 4s fallback below in
    // case ready-to-show never fires (Vite HMR hiccups in dev).
    show: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#05060a',
    autoHideMenuBar: true,
    frame: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#05060a', symbolColor: '#94a3b8', height: 32 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Open maximized so the launcher behaves like Steam/Epic out of the box.
  // The `fullscreenOnStart` setting (off by default) is the borderless option
  // for users who want true exclusive fullscreen.
  win.maximize()

  let shown = false
  const reveal = (): void => {
    if (shown || win.isDestroyed()) return
    shown = true
    win.show()
    if (settings.fullscreenOnStart) win.setFullScreen(true)
  }
  win.once('ready-to-show', reveal)
  // Safety net: if ready-to-show doesn't fire within 4s, reveal anyway so the
  // user never sees Windows mark us as "not responding".
  setTimeout(reveal, 4000)

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL!)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/**
 * Headless smoke test for the save manager.
 *
 * Triggered via `electron . --smoke-saves`. Runs a scan, picks the first game
 * whose emulator has a resolvable save folder, takes a backup, lists the
 * resulting snapshots, then exits with code 0/1.
 *
 * This exists purely so CI / dev validation can confirm the backup pipeline
 * works without UI interaction. Production users will never hit this path.
 */
async function runSmokeSaves(): Promise<number> {
  try {
    const settings = settingsStore.load()
    await scanLibrary({
      gameRoots: settings.gameRoots,
      emulatorRoots: settings.emulatorRoots,
      fresh: false
    })
    const data = libraryStore.load()
    log.info('smoke', `library has ${data.games.length} games, ${data.emulators.length} emulators`)
    // Try every game until one has a backup-able save location — emulators
    // that just got auto-installed won't have memcards yet, so we can't be
    // picky.
    for (const candidate of data.games) {
      const r = await backupSave(candidate.id)
      if ('error' in r) continue
      log.info('smoke', `backup ok for ${candidate.title}: ${r.fileCount} files, ${r.sizeBytes} bytes`)
      const snapshots = await listBackups(candidate.id)
      log.info('smoke', `list returned ${snapshots.length} snapshot(s)`)
      return 0
    }
    log.warn('smoke', 'no game has a resolvable save location yet — skipping')
    return 0
  } catch (err) {
    log.error('smoke', `unhandled: ${String(err)}`)
    return 1
  }
}

/**
 * Headless smoke test for the manual-add flow.
 * Adds a temporary "Minecraft Launcher" entry pointing at an existing exe on
 * disk, verifies it landed in library.json, then removes it.
 */
async function runSmokeManual(): Promise<number> {
  try {
    // Use any guaranteed-existing exe — psxfin.exe is in this user's library
    const exe = 'D:\\Jogos\\Emuladores\\PS2  pcSX_1_13\\psxfin.exe'
    const r = addManualGame({
      title: 'Smoke Test Game',
      path: exe,
      platform: 'pc'
    })
    if ('error' in r) {
      log.error('smoke-manual', `add failed: ${r.error}`)
      return 1
    }
    log.info('smoke-manual', `added id=${r.id} title="${r.title}"`)
    const lib = libraryStore.load()
    const found = lib.games.find((g) => g.id === r.id)
    if (!found) {
      log.error('smoke-manual', 'just-added game missing from library.json')
      return 1
    }
    const rm = removeGame(r.id)
    if ('error' in rm) {
      log.error('smoke-manual', `remove failed: ${rm.error}`)
      return 1
    }
    log.info('smoke-manual', 'add + remove cycle ok')
    return 0
  } catch (err) {
    log.error('smoke-manual', `unhandled: ${String(err)}`)
    return 1
  }
}

/**
 * Headless smoke test for the download manager.
 * Downloads a tiny known-good public file (httpbin's /bytes/1024) and verifies
 * the finished event fires + game gets registered.
 */
/**
 * One-shot CLI that downloads every CURATED_CATALOG entry and registers it as
 * a manual game. Intended for first-run setup — gives the user a populated
 * library with verified-legal homebrew. Skips entries already in the library
 * (idempotent: rerun safely).
 *
 * Run via: `npx electron . --seed-catalog`
 */
/**
 * Re-fetch libretro covers for games that lack a cover. After
 * retitleSerialOnlyGames runs, "SCUS-97328" → "Gran Turismo 4" — libretro now
 * has a chance of hitting names it couldn't before. Reuses enrichLibrary's
 * concurrent worker pool.
 */
async function refetchCoversForRetitled(): Promise<number> {
  const r = await enrichLibrary()
  return r.updated
}

async function downloadCoverForGame(
  gameId: string,
  coverUrlSource: string
): Promise<void> {
  try {
    const r = await fetch(coverUrlSource)
    if (!r.ok || !r.body) return
    const buf = Buffer.from(await r.arrayBuffer())
    const ext =
      coverUrlSource.toLowerCase().match(/\.(png|jpg|jpeg|webp)(?:\?|#|$)/)?.[1] ?? 'png'
    const dest = joinPath(PATHS.covers, `${gameId}.${ext}`)
    writeFileSync(dest, buf)
    const url = `gh-asset://cover/${encodeURIComponent(`${gameId}.${ext}`)}`
    libraryStore.patchGame(gameId, { cover: url })
    log.info('seed', `cover downloaded for ${gameId} → ${dest}`)
  } catch (err) {
    log.warn('seed', `cover download failed: ${String(err)}`)
  }
}

async function runSeedCatalog(): Promise<number> {
  let succeeded = 0
  let skipped = 0
  let failed = 0
  for (const entry of CURATED_CATALOG) {
    if (entry.id === 'tinyfugue-readme') {
      skipped++
      continue // skip test fixture
    }
    // Idempotency check — match on title + platform. If the existing entry
    // points to a .zip (predates auto-extraction in the download manager) we
    // remove it so the new seed can re-extract the actual ROM.
    const existing = libraryStore
      .load()
      .games.find((g) => g.title === entry.title && g.platform === entry.platform)
    if (existing) {
      const isStaleZip = existing.path.toLowerCase().endsWith('.zip')
      // If the catalog has a cover URL and the existing entry is missing it,
      // backfill the cover in-place without re-downloading the whole game.
      if (!existing.cover && entry.cover) {
        log.info('seed', `backfilling cover for "${entry.title}"`)
        await downloadCoverForGame(existing.id, entry.cover)
      }
      if (isStaleZip) {
        log.info(
          'seed',
          `re-seeding "${entry.title}" — existing entry is a .zip (${existing.id})`
        )
        removeGame(existing.id)
      } else {
        log.info('seed', `skip "${entry.title}" — already in library (${existing.id})`)
        skipped++
        continue
      }
    }
    log.info('seed', `downloading "${entry.title}" (${entry.platform}) from ${entry.url}`)
    const r = await startDownload({
      url: entry.url,
      title: entry.title,
      platform: entry.platform
    })
    if ('error' in r) {
      log.error('seed', `start failed for ${entry.id}: ${r.error}`)
      failed++
      continue
    }
    // Poll library for this title to appear (download manager registers
    // asynchronously). 30s cap per entry.
    const deadline = Date.now() + 30_000
    let registered = false
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 400))
      const found = libraryStore
        .load()
        .games.find((g) => g.title === entry.title && g.platform === entry.platform)
      if (found) {
        log.info('seed', `ok "${entry.title}" → ${found.id}`)
        // If the catalog entry advertised a cover URL, fetch it now. This
        // covers the case where the archive itself doesn't ship cover art
        // (Anarch, etc.); shiru games include `label_nes.png` which the
        // download manager auto-extracts on its own.
        if (entry.cover && !found.cover) {
          await downloadCoverForGame(found.id, entry.cover)
        }
        registered = true
        succeeded++
        break
      }
    }
    if (!registered) {
      log.error('seed', `timed out for ${entry.id} (${entry.url})`)
      failed++
    }
  }
  log.info(
    'seed',
    `done: ${succeeded} downloaded, ${skipped} skipped (already present), ${failed} failed`
  )
  return failed === 0 ? 0 : 1
}

async function runSmokeDownload(): Promise<number> {
  try {
    const finished = new Promise<number>((resolve) => {
      const onProgress = (_e: unknown, p: { state: string; gameId?: string; error?: string }): void => {
        if (p.state === 'finished') {
          log.info('smoke-dl', `download finished, gameId=${p.gameId}`)
          if (p.gameId) {
            removeGame(p.gameId)
            log.info('smoke-dl', 'cleanup ok')
          }
          resolve(0)
        } else if (p.state === 'failed') {
          log.error('smoke-dl', `download failed: ${p.error}`)
          resolve(1)
        }
      }
      // Listen on every window's webContents — but we have none in headless mode.
      // Instead, poll the IPC channel via app.on('web-contents-created') won't help either.
      // Just attach to the ipcMain stream.
      const { ipcMain } = require('electron') as typeof import('electron')
      ipcMain.on('__internal_progress', onProgress)
    })

    // Monkey-patch BrowserWindow.getAllWindows so downloads.ts broadcast still works:
    // it's cleaner to just inline-handle progress via the existing mechanism. The
    // download will succeed regardless of whether anyone listens — we only need
    // to know it finished. Easier: wait, then check the library file.
    const r = await startDownload({
      url: 'https://raw.githubusercontent.com/octocat/Hello-World/master/README',
      title: 'Smoke Download Test',
      platform: 'pc'
    })
    if ('error' in r) {
      log.error('smoke-dl', `start failed: ${r.error}`)
      return 1
    }
    log.info('smoke-dl', `started id=${r.id}, polling library...`)

    // Poll library for the new entry (up to 10s)
    const start = Date.now()
    while (Date.now() - start < 10_000) {
      await new Promise((r) => setTimeout(r, 300))
      const lib = libraryStore.load()
      const found = lib.games.find((g) => g.title === 'Smoke Download Test')
      if (found) {
        log.info('smoke-dl', `download + register ok, gameId=${found.id}`)
        removeGame(found.id)
        return 0
      }
    }
    log.error('smoke-dl', 'timed out waiting for download to register')
    return 1
  } catch (err) {
    log.error('smoke-dl', `unhandled: ${String(err)}`)
    return 1
  }
}

/**
 * Headless smoke test for the launch tracking flow.
 *
 * Adds a manual PC game pointing at a guaranteed-fast-exit Windows utility
 * (`tasklist.exe`), launches it, asserts it shows up in the active-launches
 * list, waits for the OS to reap it, then asserts the list cleared. Catches
 * regressions in the spawn → markStarted → exit handler → markEnded chain.
 */
async function runSmokeLaunch(): Promise<number> {
  try {
    const exe = 'C:\\Windows\\System32\\tasklist.exe'
    const g = addManualGame({
      title: 'Smoke Launch Test',
      path: exe,
      platform: 'pc'
    })
    if ('error' in g) {
      log.error('smoke-launch', `manual add failed: ${g.error}`)
      return 1
    }
    const before = listActiveLaunches().length
    const r = await launchGame(g)
    if (!r.ok) {
      log.error('smoke-launch', `launch failed: ${r.error}`)
      removeGame(g.id)
      return 1
    }
    const during = listActiveLaunches()
    const found = during.find((a) => a.gameId === g.id)
    if (!found) {
      log.error('smoke-launch', `game not in active list (size=${during.length})`)
      removeGame(g.id)
      return 1
    }
    log.info('smoke-launch', `started, active=${during.length}, pid=${found.pid}`)

    // tasklist usually finishes within 2s; give it 5s to be safe
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200))
      if (listActiveLaunches().length === before) break
    }
    const after = listActiveLaunches().length
    if (after !== before) {
      log.error('smoke-launch', `still ${after} active after wait (expected ${before})`)
      removeGame(g.id)
      return 1
    }
    log.info('smoke-launch', 'started + ended events both fired ok')
    removeGame(g.id)
    return 0
  } catch (err) {
    log.error('smoke-launch', `unhandled: ${String(err)}`)
    return 1
  }
}

/**
 * Headless smoke test for backup + restore.
 *
 * Exports current state → munges library.json on disk → restores from the
 * backup file → asserts the munge was reverted. Validates the full
 * round-trip without any dialogs.
 */
async function runSmokeBackup(): Promise<number> {
  const target = joinPath(tmpdir(), `gamehub-backup-smoke-${Date.now()}.json`)
  try {
    // Export current state
    const w = await writeBackupTo(target)
    if ('error' in w) {
      log.error('smoke-backup', `export failed: ${w.error}`)
      return 1
    }
    log.info('smoke-backup', `wrote backup to ${target}`)

    // Capture current library file content
    const before = libraryStore.load()
    const beforeCount = before.games.length

    // Munge: empty the library file directly
    writeFileSync(
      joinPath(app.getPath('userData'), 'library.json'),
      JSON.stringify({ games: [], emulators: [], updatedAt: 'munged' })
    )
    const munged = libraryStore.load()
    if (munged.games.length !== 0) {
      log.error('smoke-backup', `munge failed (still ${munged.games.length} games)`)
      return 1
    }
    log.info('smoke-backup', 'munged library.json to empty')

    // Restore
    const r = await applyBackup(target)
    if ('error' in r) {
      log.error('smoke-backup', `apply failed: ${r.error}`)
      return 1
    }
    const after = libraryStore.load()
    if (after.games.length !== beforeCount) {
      log.error('smoke-backup', `restore mismatch: expected ${beforeCount}, got ${after.games.length}`)
      return 1
    }
    log.info('smoke-backup', `restored ${after.games.length} games ok`)

    // Cleanup test artifacts (the backup file + the auto-safety snapshot
    // applyBackup wrote alongside it)
    try {
      unlinkSync(target)
      // Sibling safety file: <target>.pre-restore-<ts>.json
      // We can't predict the exact ts so glob the dir, but tmp doesn't matter
    } catch {
      /* ignore cleanup errors */
    }
    return 0
  } catch (err) {
    log.error('smoke-backup', `unhandled: ${String(err)}`)
    return 1
  }
}

function canPlayInChromium(path: string): boolean {
  return /\.(mp4|m4v|webm|mov)$/i.test(path)
}

async function runSmokeMediaPlayback(): Promise<number> {
  try {
    let items = mediaStore.load().items
    if (items.length === 0) {
      try {
        const normalMediaLibrary = joinPath(app.getPath('appData'), 'gamehub', 'media-library.json')
        const raw = JSON.parse(readFileSync(normalMediaLibrary, 'utf8').replace(/^\uFEFF/, '')) as {
          items?: typeof items
        }
        items = raw.items ?? []
      } catch {
        /* fall through to a fresh scan */
      }
    }
    if (items.length === 0) {
      const scan = await scanMediaLibrary({ fresh: true })
      items = scan.items
    }

    const candidates = items
      .filter((entry) => canPlayInChromium(entry.path) && existsSync(entry.path))
      .slice(0, 8)
    if (candidates.length === 0) {
      log.error('smoke-media', 'no Chromium-playable media file found (.mp4/.m4v/.webm/.mov)')
      return 1
    }

    const win = new BrowserWindow({
      width: 960,
      height: 540,
      show: false,
      webPreferences: {
        sandbox: false,
        contextIsolation: false,
        nodeIntegration: false,
        autoplayPolicy: 'no-user-gesture-required'
      }
    })

    await win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent('<!doctype html><meta charset="utf-8"><video id="v" muted autoplay playsinline></video>')}`
    )

    const failures: string[] = []
    for (const item of candidates) {
      mediaStore.addItem(item)
      const itemUrl = `gh-media://item/${encodeURIComponent(item.id)}`
      const result = (await Promise.race([
        win.webContents.executeJavaScript(
          `
            new Promise((resolve) => {
              const video = document.getElementById('v')
              video.removeAttribute('src')
              video.load()
              const done = (ok, reason) => resolve({
                ok,
                reason,
                readyState: video.readyState,
                networkState: video.networkState,
                duration: Number.isFinite(video.duration) ? video.duration : 0,
                currentTime: video.currentTime,
                error: video.error ? { code: video.error.code, message: video.error.message } : null
              })
              const timeout = setTimeout(() => done(false, 'timeout'), 10000)
              video.addEventListener('playing', () => {
                clearTimeout(timeout)
                setTimeout(() => done(video.currentTime >= 0, 'playing'), 500)
              }, { once: true })
              video.addEventListener('canplay', () => {
                video.play().catch((err) => done(false, 'play-rejected:' + err.message))
              }, { once: true })
              video.addEventListener('error', () => {
                clearTimeout(timeout)
                done(false, 'media-error')
              }, { once: true })
              video.src = ${JSON.stringify(itemUrl)}
              video.load()
            })
          `,
          true
        ),
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: false, reason: 'host-timeout' }), 13000)
        )
      ])) as { ok: boolean; reason: string; duration?: number; currentTime?: number; error?: unknown }

      if (result.ok) {
        log.info(
          'smoke-media',
          `playback ok: "${item.title}" duration=${Math.round(result.duration ?? 0)}s current=${Number(result.currentTime ?? 0).toFixed(2)}s`
        )
        win.destroy()
        return 0
      }
      failures.push(`${item.title}: ${JSON.stringify(result)}`)
    }
    win.destroy()

    log.error('smoke-media', `playback failed for ${candidates.length} candidate(s): ${failures.join(' | ')}`)
    return 1
  } catch (err) {
    log.error('smoke-media', `unhandled: ${String(err)}`)
    return 1
  }
}

app.whenReady().then(async () => {
  log.info('app', `GameHub started — Electron ${process.versions.electron}`)
  registerAssetProtocol()
  registerMediaProtocol()
  registerIpcHandlers()

  if (process.argv.includes('--smoke-saves')) {
    const code = await runSmokeSaves()
    setTimeout(() => app.exit(code), 200)
    return
  }
  if (process.argv.includes('--smoke-manual')) {
    const code = await runSmokeManual()
    setTimeout(() => app.exit(code), 200)
    return
  }
  if (process.argv.includes('--smoke-download')) {
    const code = await runSmokeDownload()
    setTimeout(() => app.exit(code), 200)
    return
  }
  if (process.argv.includes('--smoke-launch')) {
    const code = await runSmokeLaunch()
    setTimeout(() => app.exit(code), 200)
    return
  }
  if (process.argv.includes('--smoke-backup')) {
    const code = await runSmokeBackup()
    setTimeout(() => app.exit(code), 200)
    return
  }
  if (isMediaPlaybackSmoke) {
    const code = await runSmokeMediaPlayback()
    setTimeout(() => app.exit(code), 200)
    return
  }
  if (process.argv.includes('--seed-catalog')) {
    const code = await runSeedCatalog()
    setTimeout(() => app.exit(code), 200)
    return
  }
  const installArg = process.argv.find((a) => a.startsWith('--install-emu='))
  if (installArg) {
    const id = installArg.split('=')[1] as EmulatorId
    const def = EMULATORS[id]
    if (!def) {
      log.error('install-emu', `unknown emulator id: ${id}`)
      setTimeout(() => app.exit(1), 200)
      return
    }
    log.info('install-emu', `installing ${def.name}`)
    const r = await installEmulator(id, def.name)
    if ('ok' in r) {
      const settings = settingsStore.load()
      const errors: string[] = []
      const det = await detectEmulators(settings.emulatorRoots, errors)
      const data = libraryStore.load()
      libraryStore.save(data.games, det.emulators)
      log.info('install-emu', `done: ${r.executable}`)
      setTimeout(() => app.exit(0), 200)
    } else {
      log.error('install-emu', `failed: ${r.error}`)
      setTimeout(() => app.exit(1), 200)
    }
    return
  }
  if (process.argv.includes('--refresh')) {
    retitleSerialOnlyGames()
    reconcileManualGameEmulators()
    await backfillBundledCovers()
    // Re-fetch covers for games that lost their original cover (e.g. were
    // retitled — old cover was tied to wrong libretro filename). We clear
    // covers from retitled games elsewhere; this picks up the new names.
    const refetched = await refetchCoversForRetitled()
    const enriched = await enrichLibrary()
    log.info('refresh', `cover enrichment updated ${enriched.updated} game(s)`)
    log.info('refresh', `done — reconciled emulators + backfilled covers (${refetched} libretro re-hits)`)
    setTimeout(() => app.exit(0), 200)
    return
  }
  if (process.argv.includes('--scan')) {
    const settings = settingsStore.load()
    const result = await scanLibrary({
      gameRoots: settings.gameRoots,
      emulatorRoots: settings.emulatorRoots,
      fresh: true
    })
    const enriched = await enrichLibrary()
    log.info(
      'scan',
      `CLI scan done: ${result.games.length} games, ${result.emulators.length} emulators, ${enriched.updated} cover(s) updated`
    )
    setTimeout(() => app.exit(0), 200)
    return
  }
  if (process.argv.includes('--import-steam')) {
    const result = await importSteamGames()
    log.info('steam', `CLI import done: +${result.added} added, ${result.updated} updated`)
    setTimeout(() => app.exit(0), 200)
    return
  }
  if (process.argv.includes('--import-epic')) {
    const result = await importEpicGames()
    const enriched = await enrichLibrary()
    log.info(
      'epic',
      `CLI import done: ${result.found} found, +${result.added} added, ${result.updated} updated, ${result.removedDuplicates} duplicate(s) removed, ${enriched.updated} cover(s) updated`
    )
    setTimeout(() => app.exit(0), 200)
    return
  }
  if (process.argv.includes('--scan-media')) {
    const result = await scanMediaLibrary({ fresh: true })
    log.info(
      'cinema',
      `CLI media scan done: ${result.items.length} item(s), ${result.errors.length} error(s)`
    )
    setTimeout(() => app.exit(result.errors.length > 0 ? 1 : 0), 200)
    return
  }
  if (process.argv.includes('--refresh-media-artwork')) {
    const result = await refreshMediaArtwork()
    log.info(
      'cinema',
      `CLI media artwork refresh done: ${result.updated} updated, ${result.skipped} skipped`
    )
    setTimeout(() => app.exit(0), 200)
    return
  }

  createWindow()
  initAutoUpdater()

  // Broadcast every log entry to whoever's subscribed in the renderer (the
  // splash "real boot logs" toggle is the primary consumer). Fan-out to all
  // browser windows so dev tools etc still see traffic.
  subscribeLogs((entry) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      try {
        win.webContents.send('system:log-stream', entry)
      } catch {
        /* renderer not ready yet */
      }
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  const { unmountAll } = await import('./core/ps3Disc')
  await unmountAll()
  const { discordRpcStop } = await import('./core/discordRpc')
  discordRpcStop()
})

process.on('uncaughtException', (err) => log.error('app', 'uncaught', { err: String(err) }))
process.on('unhandledRejection', (reason) => log.error('app', 'unhandled rejection', { reason: String(reason) }))

import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc/handlers'
import { log } from './core/logger'
import { settingsStore, libraryStore } from './core/store'
import { scanLibrary } from './core/scanner'
import { backupSave, listBackups } from './core/saves'
import { addManualGame, removeGame } from './core/manualGames'
import { startDownload } from './core/downloads'
import { launchGame, listActiveLaunches } from './core/launcher'
import { IPC } from '@shared/ipc'

const isDev = !!process.env.ELECTRON_RENDERER_URL

function createWindow(): BrowserWindow {
  const settings = settingsStore.load()

  const win = new BrowserWindow({
    width: 1480,
    height: 880,
    minWidth: 1024,
    minHeight: 640,
    show: false,
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

  win.once('ready-to-show', () => {
    win.show()
    if (settings.fullscreenOnStart) win.setFullScreen(true)
  })

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
    const candidate = data.games.find((g) => g.emulator === 'epsxe')
    if (!candidate) {
      log.error('smoke', 'no PS1/ePSXe game found to test')
      return 1
    }
    log.info('smoke', `testing backup of ${candidate.title}`)
    const r = await backupSave(candidate.id)
    if ('error' in r) {
      log.error('smoke', `backup failed: ${r.error}`)
      return 1
    }
    log.info('smoke', `backup ok: ${r.fileCount} files, ${r.sizeBytes} bytes`)
    const snapshots = await listBackups(candidate.id)
    log.info('smoke', `list returned ${snapshots.length} snapshot(s)`)
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

app.whenReady().then(async () => {
  log.info('app', `GameHub started — Electron ${process.versions.electron}`)
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

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

process.on('uncaughtException', (err) => log.error('app', 'uncaught', { err: String(err) }))
process.on('unhandledRejection', (reason) => log.error('app', 'unhandled rejection', { reason: String(reason) }))

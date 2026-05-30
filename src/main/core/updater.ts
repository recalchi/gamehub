import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { log } from './logger'
import { IPC } from '@shared/ipc'
import type { UpdateInfo } from '@shared/types'

const RELEASE_HOST_ALLOWLIST = new Set([
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com'
])
const RELEASE_TAG_URL_PREFIX = 'https://github.com/recalchi/gamehub/releases/tag/v'

let initialized = false
let checking = false

let state: UpdateInfo = {
  current: app.getVersion(),
  newer: false,
  phase: 'idle',
  channel: 'stable'
}

function emitState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try {
      win.webContents.send(IPC.system.updateStatus, state)
    } catch {
      /* renderer not ready */
    }
  }
}

function patchState(patch: Partial<UpdateInfo>): void {
  state = {
    ...state,
    ...patch,
    current: app.getVersion()
  }
  emitState()
}

function isReleaseUrlAllowed(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return true
  try {
    const host = new URL(url).hostname.toLowerCase()
    return RELEASE_HOST_ALLOWLIST.has(host)
  } catch {
    return false
  }
}

function validateUpdateSource(info: {
  files?: Array<{ url?: string }>
  releaseName?: string
}): string | null {
  const fileUrls = (info.files ?? []).map((f) => f.url).filter(Boolean) as string[]
  for (const fileUrl of fileUrls) {
    if (!isReleaseUrlAllowed(fileUrl)) {
      return `origem de update bloqueada: ${fileUrl}`
    }
  }
  return null
}

export function getUpdateState(): UpdateInfo {
  return state
}

export async function checkForUpdatesNow(): Promise<UpdateInfo> {
  if (!initialized || !app.isPackaged) {
    patchState({
      phase: 'disabled',
      checkedAt: new Date().toISOString(),
      error: app.isPackaged ? 'updater ainda não inicializado' : 'updater desabilitado em modo desenvolvimento',
      canInstall: false
    })
    return state
  }
  if (checking) return state
  checking = true
  patchState({
    phase: 'checking',
    checkedAt: new Date().toISOString(),
    error: undefined,
    percent: undefined,
    downloadedBytes: undefined,
    totalBytes: undefined
  })
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('updater', `check failed: ${msg}`)
    patchState({ phase: 'error', error: msg, canInstall: false })
  } finally {
    checking = false
  }
  return state
}

export function installDownloadedUpdate(): { ok: true } | { error: string } {
  if (state.phase !== 'downloaded') {
    return { error: 'Nenhuma atualização baixada para instalar.' }
  }
  try {
    patchState({ phase: 'installing', error: undefined })
    // immediate install if possible; fallback will still apply on next launch
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('updater', `install failed: ${msg}`)
    patchState({ phase: 'error', error: msg, canInstall: false })
    return { error: msg }
  }
}

export function initAutoUpdater(): void {
  if (initialized) return
  initialized = true

  if (!app.isPackaged) {
    patchState({
      phase: 'disabled',
      checkedAt: new Date().toISOString(),
      error: 'updater desabilitado em modo desenvolvimento',
      canInstall: false
    })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.disableWebInstaller = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    patchState({
      phase: 'checking',
      checkedAt: new Date().toISOString(),
      error: undefined,
      canInstall: false
    })
    log.info('updater', 'checking for updates')
  })

  autoUpdater.on('update-available', (info: any) => {
    const sourceError = validateUpdateSource(info)
    if (sourceError) {
      patchState({
        phase: 'error',
        newer: false,
        error: sourceError,
        canInstall: false
      })
      log.error('updater', sourceError)
      return
    }
    patchState({
      phase: 'available',
      newer: true,
      latest: info?.version,
      releaseUrl: info?.version ? `${RELEASE_TAG_URL_PREFIX}${info.version}` : undefined,
      notes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : undefined,
      error: undefined,
      canInstall: false,
      checkedAt: new Date().toISOString()
    })
    log.info('updater', `update available: ${info?.version ?? 'unknown'}`)
  })

  autoUpdater.on('download-progress', (progress: any) => {
    patchState({
      phase: 'downloading',
      newer: true,
      percent: Number(progress?.percent ?? 0),
      downloadedBytes: Number(progress?.transferred ?? 0),
      totalBytes: Number(progress?.total ?? 0),
      error: undefined,
      canInstall: false,
      checkedAt: new Date().toISOString()
    })
  })

  autoUpdater.on('update-downloaded', (info: any) => {
    patchState({
      phase: 'downloaded',
      newer: true,
      latest: info?.version,
      notes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : undefined,
      error: undefined,
      canInstall: true,
      percent: 100,
      checkedAt: new Date().toISOString()
    })
    log.info('updater', `update downloaded: ${info?.version ?? 'unknown'}`)
  })

  autoUpdater.on('update-not-available', (info: any) => {
    patchState({
      phase: 'not-available',
      newer: false,
      latest: info?.version ?? app.getVersion(),
      error: undefined,
      canInstall: false,
      checkedAt: new Date().toISOString()
    })
    log.info('updater', 'no update available')
  })

  autoUpdater.on('error', (err: Error) => {
    const msg = err?.message || String(err)
    log.error('updater', msg)
    patchState({
      phase: 'error',
      error: msg,
      canInstall: false
    })
    checking = false
  })

  // Non-blocking startup check.
  setTimeout(() => {
    void checkForUpdatesNow()
  }, 3500)
}

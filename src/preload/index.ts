import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  ActiveLaunch,
  AppInfo,
  AppSettings,
  BiosCheck,
  DetectedEmulator,
  DownloadProgress,
  EmulatorId,
  Game,
  HealthReport,
  LaunchFailedEvent,
  LaunchResult,
  LogEntry,
  PlatformId,
  SaveSnapshot,
  ScanProgress,
  ScanResult,
  UpdateInfo
} from '@shared/types'

/**
 * Typed bridge exposed to the renderer as `window.api`.
 *
 * Keep this surface narrow — every method here is essentially a public API
 * contract for the renderer. Add new IPC channels to `@shared/ipc` first.
 */
export interface GameHubApi {
  library: {
    list: () => Promise<{ games: Game[]; emulators: DetectedEmulator[]; updatedAt: string }>
    scan: (opts?: { fresh?: boolean }) => Promise<ScanResult>
    get: (id: string) => Promise<Game | null>
    update: (id: string, patch: Partial<Game>) => Promise<Game | null>
    toggleFavorite: (id: string) => Promise<Game | null>
    enrich: () => Promise<{ updated: number; skipped: number }>
    refetchCover: (id: string) => Promise<{ cover?: string; banner?: string } | null>
    setManualCover: (id: string, sourcePath: string) => Promise<{ cover: string } | { error: string }>
    addManual: (input: {
      title: string
      path: string
      platform: string
      description?: string
      developer?: string
      genre?: string
      year?: number
      cover?: string
    }) => Promise<Game | { error: string }>
    remove: (id: string) => Promise<{ ok: true } | { error: string }>
    healthCheck: () => Promise<HealthReport>
    cleanOrphans: () => Promise<{ removed: number; bytes: number }>
    onProgress: (cb: (progress: ScanProgress) => void) => () => void
    onCoverUpdated: (
      cb: (payload: { gameId: string; cover?: string; banner?: string }) => void
    ) => () => void
  }
  emulator: {
    list: () => Promise<DetectedEmulator[]>
    detect: () => Promise<{ emulators: DetectedEmulator[]; errors: string[] }>
    setOverride: (id: EmulatorId, exePath: string) => Promise<AppSettings>
    test: (exePath: string) => Promise<boolean>
    checkBios: (emulatorId: EmulatorId) => Promise<BiosCheck>
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (patch: Partial<AppSettings>) => Promise<AppSettings>
  }
  launch: {
    game: (id: string) => Promise<LaunchResult>
    folder: (path: string) => Promise<{ ok: boolean }>
    active: () => Promise<ActiveLaunch[]>
    onFailed: (cb: (event: LaunchFailedEvent) => void) => () => void
    onStarted: (cb: (event: ActiveLaunch) => void) => () => void
    onEnded: (cb: (event: { gameId: string; gameTitle: string }) => void) => () => void
  }
  saves: {
    location: (gameId: string) => Promise<{ available: boolean; path?: string; label?: string }>
    list: (gameId: string) => Promise<SaveSnapshot[]>
    backup: (gameId: string) => Promise<SaveSnapshot | { error: string }>
    restore: (gameId: string, snapshotId: string) => Promise<{ ok: true } | { error: string }>
    delete: (gameId: string, snapshotId: string) => Promise<{ ok: true } | { error: string }>
  }
  downloads: {
    start: (input: {
      url: string
      title: string
      platform: PlatformId
      destinationDir?: string
    }) => Promise<{ id: string } | { error: string }>
    cancel: (id: string) => Promise<{ ok: boolean }>
    onProgress: (cb: (p: DownloadProgress) => void) => () => void
  }
  system: {
    pickFolder: () => Promise<string | null>
    pickFile: (filters?: Electron.FileFilter[]) => Promise<string | null>
    openExternal: (url: string) => Promise<void>
    toggleFullscreen: () => Promise<boolean>
    setFullscreen: (on: boolean) => Promise<boolean>
    isFullscreen: () => Promise<boolean>
    statPath: (path: string) => Promise<{ exists: boolean; isDirectory: boolean; size: number }>
    logs: (limit?: number) => Promise<LogEntry[]>
    log: (level: 'info' | 'warn' | 'error', scope: string, message: string, data?: unknown) => Promise<void>
    about: () => Promise<AppInfo>
    checkUpdate: (url?: string) => Promise<UpdateInfo>
    exportBackup: () => Promise<{ ok: true; path: string } | { error: string }>
    previewBackup: () => Promise<
      | {
          ok: true
          exportedAt: string
          appVersion?: string
          gameCount: number
          emulatorCount: number
          path: string
        }
      | { error: string }
    >
    applyBackup: (path: string) => Promise<{ ok: true } | { error: string }>
  }
}

const api: GameHubApi = {
  library: {
    list: () => ipcRenderer.invoke(IPC.library.list),
    scan: (opts) => ipcRenderer.invoke(IPC.library.scan, opts),
    get: (id) => ipcRenderer.invoke(IPC.library.get, id),
    update: (id, patch) => ipcRenderer.invoke(IPC.library.update, id, patch),
    toggleFavorite: (id) => ipcRenderer.invoke(IPC.library.toggleFavorite, id),
    enrich: () => ipcRenderer.invoke(IPC.library.enrich),
    refetchCover: (id) => ipcRenderer.invoke(IPC.library.refetchCover, id),
    setManualCover: (id, sourcePath) =>
      ipcRenderer.invoke(IPC.library.setManualCover, id, sourcePath),
    addManual: (input) => ipcRenderer.invoke(IPC.library.addManual, input),
    remove: (id) => ipcRenderer.invoke(IPC.library.remove, id),
    healthCheck: () => ipcRenderer.invoke(IPC.library.healthCheck),
    cleanOrphans: () => ipcRenderer.invoke(IPC.library.cleanOrphans),
    onProgress: (cb) => {
      const listener = (_e: unknown, progress: ScanProgress): void => cb(progress)
      ipcRenderer.on(IPC.library.progress, listener)
      return () => ipcRenderer.removeListener(IPC.library.progress, listener)
    },
    onCoverUpdated: (cb) => {
      const listener = (
        _e: unknown,
        payload: { gameId: string; cover?: string; banner?: string }
      ): void => cb(payload)
      ipcRenderer.on(IPC.library.coverUpdated, listener)
      return () => ipcRenderer.removeListener(IPC.library.coverUpdated, listener)
    }
  },
  emulator: {
    list: () => ipcRenderer.invoke(IPC.emulator.list),
    detect: () => ipcRenderer.invoke(IPC.emulator.detect),
    setOverride: (id, exePath) => ipcRenderer.invoke(IPC.emulator.setOverride, id, exePath),
    test: (exePath) => ipcRenderer.invoke(IPC.emulator.test, exePath),
    checkBios: (emulatorId) => ipcRenderer.invoke(IPC.emulator.checkBios, emulatorId)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    update: (patch) => ipcRenderer.invoke(IPC.settings.update, patch)
  },
  launch: {
    game: (id) => ipcRenderer.invoke(IPC.launch.game, id),
    folder: (path) => ipcRenderer.invoke(IPC.launch.folder, path),
    active: () => ipcRenderer.invoke(IPC.launch.active),
    onFailed: (cb) => {
      const listener = (_e: unknown, event: LaunchFailedEvent): void => cb(event)
      ipcRenderer.on(IPC.launch.failed, listener)
      return () => ipcRenderer.removeListener(IPC.launch.failed, listener)
    },
    onStarted: (cb) => {
      const listener = (_e: unknown, event: ActiveLaunch): void => cb(event)
      ipcRenderer.on(IPC.launch.started, listener)
      return () => ipcRenderer.removeListener(IPC.launch.started, listener)
    },
    onEnded: (cb) => {
      const listener = (_e: unknown, event: { gameId: string; gameTitle: string }): void =>
        cb(event)
      ipcRenderer.on(IPC.launch.ended, listener)
      return () => ipcRenderer.removeListener(IPC.launch.ended, listener)
    }
  },
  saves: {
    location: (gameId) => ipcRenderer.invoke(IPC.saves.location, gameId),
    list: (gameId) => ipcRenderer.invoke(IPC.saves.list, gameId),
    backup: (gameId) => ipcRenderer.invoke(IPC.saves.backup, gameId),
    restore: (gameId, snapshotId) => ipcRenderer.invoke(IPC.saves.restore, gameId, snapshotId),
    delete: (gameId, snapshotId) => ipcRenderer.invoke(IPC.saves.delete, gameId, snapshotId)
  },
  downloads: {
    start: (input) => ipcRenderer.invoke(IPC.downloads.start, input),
    cancel: (id) => ipcRenderer.invoke(IPC.downloads.cancel, id),
    onProgress: (cb) => {
      const listener = (_e: unknown, p: DownloadProgress): void => cb(p)
      ipcRenderer.on(IPC.downloads.progress, listener)
      return () => ipcRenderer.removeListener(IPC.downloads.progress, listener)
    }
  },
  system: {
    pickFolder: () => ipcRenderer.invoke(IPC.system.pickFolder),
    pickFile: (filters) => ipcRenderer.invoke(IPC.system.pickFile, filters),
    openExternal: (url) => ipcRenderer.invoke(IPC.system.openExternal, url),
    toggleFullscreen: () => ipcRenderer.invoke(IPC.system.toggleFullscreen),
    setFullscreen: (on) => ipcRenderer.invoke(IPC.system.setFullscreen, on),
    isFullscreen: () => ipcRenderer.invoke(IPC.system.isFullscreen),
    statPath: (path) => ipcRenderer.invoke(IPC.system.statPath, path),
    logs: (limit) => ipcRenderer.invoke(IPC.system.logs, limit),
    log: (level, scope, message, data) => ipcRenderer.invoke(IPC.system.log, level, scope, message, data),
    about: () => ipcRenderer.invoke(IPC.system.about),
    checkUpdate: (url) => ipcRenderer.invoke(IPC.system.checkUpdate, url),
    exportBackup: () => ipcRenderer.invoke(IPC.system.exportBackup),
    previewBackup: () => ipcRenderer.invoke(IPC.system.previewBackup),
    applyBackup: (path) => ipcRenderer.invoke(IPC.system.applyBackup, path)
  }
}

contextBridge.exposeInMainWorld('api', api)

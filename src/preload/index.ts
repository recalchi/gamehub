import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  ActiveLaunch,
  AutoSubtitleInput,
  AutoSubtitleResult,
  GameAchievementDetail,
  GameAchievementSummary,
  AppInfo,
  AppSettings,
  AutoInstallProgress,
  BiosCheck,
  CrashReport,
  CrashStats,
  ControllerDiagnostics,
  DetectedEmulator,
  DisplayInfo,
  DisplayTarget,
  DiscordRpcStatus,
  DownloadProgress,
  EmulatorId,
  Game,
  HealthReport,
  LaunchFailedEvent,
  LaunchFallbackEvent,
  LaunchResult,
  LaunchTerminateResult,
  LogEntry,
  MediaCatalogEntry,
  MediaDownloadProgress,
  MediaItem,
  MediaScanResult,
  MediaWatchInput,
  MediaWatchRecord,
  MediaWatchedFile,
  ModCatalogEntry,
  ModDownloadInput,
  ModDownloadProgress,
  ModInstallRecord,
  PerformanceReport,
  PerformanceSample,
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
    enrichGames: (gameIds: string[]) => Promise<{ updated: number }>
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
    extractArchive: (
      gameId: string
    ) => Promise<{ ok: true; extractedPath: string; sizeBytes: number } | { error: string }>
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
    installBios: (
      emulatorId: EmulatorId,
      sourcePath: string
    ) => Promise<{ ok: true; destination: string } | { error: string }>
    installPs3Firmware: () => Promise<{ ok: true; pup: string } | { error: string }>
    suggestInstall: (
      platform: PlatformId
    ) => Promise<{ emulatorId: EmulatorId; emulatorName: string } | null>
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (patch: Partial<AppSettings>) => Promise<AppSettings>
  }
  launch: {
    game: (id: string) => Promise<LaunchResult>
    terminate: (id: string) => Promise<LaunchTerminateResult>
    folder: (path: string) => Promise<{ ok: boolean }>
    active: () => Promise<ActiveLaunch[]>
    onFailed: (cb: (event: LaunchFailedEvent) => void) => () => void
    onFallback: (cb: (event: LaunchFallbackEvent) => void) => () => void
    onStarted: (cb: (event: ActiveLaunch) => void) => () => void
    onEnded: (cb: (event: { gameId: string; gameTitle: string }) => void) => () => void
  }
  performance: {
    latest: (gameId: string) => Promise<PerformanceSample | null>
    attach: (gameId: string) => Promise<PerformanceSample | null>
    report: (gameId: string) => Promise<PerformanceReport | null>
    onSample: (cb: (sample: PerformanceSample) => void) => () => void
    onReport: (cb: (report: PerformanceReport) => void) => () => void
  }
  discord: {
    status: () => Promise<DiscordRpcStatus>
    validate: () => Promise<DiscordRpcStatus>
  }
  achievements: {
    summaries: () => Promise<GameAchievementSummary[]>
    game: (gameId: string) => Promise<GameAchievementDetail | null>
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
  mods: {
    catalog: () => Promise<ModCatalogEntry[]>
    installed: () => Promise<ModInstallRecord[]>
    download: (input: ModDownloadInput) => Promise<{ id: string } | { error: string }>
    onProgress: (cb: (p: ModDownloadProgress) => void) => () => void
  }
  controllers: {
    diagnostics: () => Promise<ControllerDiagnostics>
  }
  media: {
    list: () => Promise<{ items: MediaItem[]; updatedAt: string }>
    scan: (opts?: { fresh?: boolean }) => Promise<MediaScanResult>
    enrich: (ids?: string[]) => Promise<{ updated: number; skipped: number }>
    open: (id: string) => Promise<{ ok: true } | { error: string }>
    catalog: () => Promise<MediaCatalogEntry[]>
    download: (entryId: string) => Promise<{ id: string } | { error: string }>
    cancelDownload: (id: string) => Promise<{ ok: boolean }>
    generateSubtitles: (input: AutoSubtitleInput) => Promise<AutoSubtitleResult>
    watched: () => Promise<MediaWatchedFile>
    recordWatch: (input: MediaWatchInput) => Promise<MediaWatchRecord | { error: string }>
    toggleFavorite: (id: string) => Promise<MediaItem | { error: string }>
    setWatched: (id: string, completed: boolean) => Promise<MediaWatchRecord | { error: string }>
    clearWatch: (id: string) => Promise<{ ok: true } | { error: string }>
    exportWatched: () => Promise<{ ok: true; path: string } | { error: string }>
    refreshArtwork: (ids?: string[]) => Promise<{ updated: number; skipped: number }>
    onProgress: (cb: (p: MediaDownloadProgress) => void) => () => void
  }
  system: {
    pickFolder: () => Promise<string | null>
    pickFile: (filters?: Electron.FileFilter[]) => Promise<string | null>
    openExternal: (url: string) => Promise<void>
    toggleFullscreen: () => Promise<boolean>
    setFullscreen: (on: boolean) => Promise<boolean>
    isFullscreen: () => Promise<boolean>
    displays: () => Promise<DisplayInfo[]>
    moveToDisplay: (target: DisplayTarget) => Promise<boolean>
    statPath: (path: string) => Promise<{ exists: boolean; isDirectory: boolean; size: number }>
    logs: (limit?: number) => Promise<LogEntry[]>
    log: (level: 'info' | 'warn' | 'error', scope: string, message: string, data?: unknown) => Promise<void>
    onLogStream: (cb: (entry: LogEntry) => void) => () => void
    about: () => Promise<AppInfo>
    checkUpdate: () => Promise<UpdateInfo>
    updateState: () => Promise<UpdateInfo>
    installUpdate: () => Promise<{ ok: true } | { error: string }>
    onUpdateStatus: (cb: (info: UpdateInfo) => void) => () => void
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
    autoInstallEmulator: (
      id: EmulatorId,
      displayName: string
    ) => Promise<{ ok: true; executable: string } | { error: string }>
    onAutoInstallProgress: (cb: (p: AutoInstallProgress) => void) => () => void
    importSteam: () => Promise<{ added: number; updated: number }>
    importEpic: () => Promise<{
      found: number
      added: number
      updated: number
      removedDuplicates: number
    }>
    testSteamGridDb: () => Promise<{ ok: true; sample?: string } | { error: string }>
    importRiot: () => Promise<{ added: number; updated: number }>
    applyShadPs4Profile: (
      profile: 'ue4' | 'default'
    ) => Promise<{ ok: true; backup: string } | { error: string }>
    listCrashes: (gameId: string) => Promise<CrashReport[]>
    crashStats: (gameId: string) => Promise<CrashStats>
    readCrashLog: (logPath: string) => Promise<{ content: string } | { error: string }>
    onCrashRecorded: (cb: (r: CrashReport) => void) => () => void
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
    enrichGames: (gameIds) => ipcRenderer.invoke(IPC.library.enrichGames, gameIds),
    refetchCover: (id) => ipcRenderer.invoke(IPC.library.refetchCover, id),
    setManualCover: (id, sourcePath) =>
      ipcRenderer.invoke(IPC.library.setManualCover, id, sourcePath),
    addManual: (input) => ipcRenderer.invoke(IPC.library.addManual, input),
    remove: (id) => ipcRenderer.invoke(IPC.library.remove, id),
    healthCheck: () => ipcRenderer.invoke(IPC.library.healthCheck),
    cleanOrphans: () => ipcRenderer.invoke(IPC.library.cleanOrphans),
    extractArchive: (gameId) => ipcRenderer.invoke(IPC.library.extractArchive, gameId),
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
    checkBios: (emulatorId) => ipcRenderer.invoke(IPC.emulator.checkBios, emulatorId),
    installBios: (emulatorId, sourcePath) =>
      ipcRenderer.invoke(IPC.emulator.installBios, emulatorId, sourcePath),
    installPs3Firmware: () => ipcRenderer.invoke(IPC.emulator.installPs3Firmware),
    suggestInstall: (platform) => ipcRenderer.invoke(IPC.emulator.suggestInstall, platform)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    update: (patch) => ipcRenderer.invoke(IPC.settings.update, patch)
  },
  launch: {
    game: (id) => ipcRenderer.invoke(IPC.launch.game, id),
    terminate: (id) => ipcRenderer.invoke(IPC.launch.terminate, id),
    folder: (path) => ipcRenderer.invoke(IPC.launch.folder, path),
    active: () => ipcRenderer.invoke(IPC.launch.active),
    onFailed: (cb) => {
      const listener = (_e: unknown, event: LaunchFailedEvent): void => cb(event)
      ipcRenderer.on(IPC.launch.failed, listener)
      return () => ipcRenderer.removeListener(IPC.launch.failed, listener)
    },
    onFallback: (cb) => {
      const listener = (_e: unknown, event: LaunchFallbackEvent): void => cb(event)
      ipcRenderer.on(IPC.launch.fallback, listener)
      return () => ipcRenderer.removeListener(IPC.launch.fallback, listener)
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
  performance: {
    latest: (gameId) => ipcRenderer.invoke(IPC.performance.latest, gameId),
    attach: (gameId) => ipcRenderer.invoke(IPC.performance.attach, gameId),
    report: (gameId) => ipcRenderer.invoke(IPC.performance.report, gameId),
    onSample: (cb) => {
      const listener = (_e: unknown, sample: PerformanceSample): void => cb(sample)
      ipcRenderer.on(IPC.performance.sample, listener)
      return () => ipcRenderer.removeListener(IPC.performance.sample, listener)
    },
    onReport: (cb) => {
      const listener = (_e: unknown, report: PerformanceReport): void => cb(report)
      ipcRenderer.on(IPC.performance.reportReady, listener)
      return () => ipcRenderer.removeListener(IPC.performance.reportReady, listener)
    }
  },
  discord: {
    status: () => ipcRenderer.invoke(IPC.discord.status),
    validate: () => ipcRenderer.invoke(IPC.discord.validate)
  },
  achievements: {
    summaries: () => ipcRenderer.invoke(IPC.achievements.summaries),
    game: (gameId) => ipcRenderer.invoke(IPC.achievements.game, gameId)
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
  mods: {
    catalog: () => ipcRenderer.invoke(IPC.mods.catalog),
    installed: () => ipcRenderer.invoke(IPC.mods.installed),
    download: (input) => ipcRenderer.invoke(IPC.mods.download, input),
    onProgress: (cb) => {
      const listener = (_e: unknown, p: ModDownloadProgress): void => cb(p)
      ipcRenderer.on(IPC.mods.progress, listener)
      return () => ipcRenderer.removeListener(IPC.mods.progress, listener)
    }
  },
  controllers: {
    diagnostics: () => ipcRenderer.invoke(IPC.controllers.diagnostics)
  },
  media: {
    list: () => ipcRenderer.invoke(IPC.media.list),
    scan: (opts) => ipcRenderer.invoke(IPC.media.scan, opts),
    enrich: (ids) => ipcRenderer.invoke(IPC.media.enrich, ids),
    open: (id) => ipcRenderer.invoke(IPC.media.open, id),
    catalog: () => ipcRenderer.invoke(IPC.media.catalog),
    download: (entryId) => ipcRenderer.invoke(IPC.media.download, entryId),
    cancelDownload: (id) => ipcRenderer.invoke(IPC.media.cancelDownload, id),
    generateSubtitles: (input) => ipcRenderer.invoke(IPC.media.generateSubtitles, input),
    watched: () => ipcRenderer.invoke(IPC.media.watched),
    recordWatch: (input) => ipcRenderer.invoke(IPC.media.recordWatch, input),
    toggleFavorite: (id) => ipcRenderer.invoke(IPC.media.toggleFavorite, id),
    setWatched: (id, completed) => ipcRenderer.invoke(IPC.media.setWatched, id, completed),
    clearWatch: (id) => ipcRenderer.invoke(IPC.media.clearWatch, id),
    exportWatched: () => ipcRenderer.invoke(IPC.media.exportWatched),
    refreshArtwork: (ids) => ipcRenderer.invoke(IPC.media.refreshArtwork, ids),
    onProgress: (cb) => {
      const listener = (_e: unknown, p: MediaDownloadProgress): void => cb(p)
      ipcRenderer.on(IPC.media.progress, listener)
      return () => ipcRenderer.removeListener(IPC.media.progress, listener)
    }
  },
  system: {
    pickFolder: () => ipcRenderer.invoke(IPC.system.pickFolder),
    pickFile: (filters) => ipcRenderer.invoke(IPC.system.pickFile, filters),
    openExternal: (url) => ipcRenderer.invoke(IPC.system.openExternal, url),
    toggleFullscreen: () => ipcRenderer.invoke(IPC.system.toggleFullscreen),
    setFullscreen: (on) => ipcRenderer.invoke(IPC.system.setFullscreen, on),
    isFullscreen: () => ipcRenderer.invoke(IPC.system.isFullscreen),
    displays: () => ipcRenderer.invoke(IPC.system.displays),
    moveToDisplay: (target) => ipcRenderer.invoke(IPC.system.moveToDisplay, target),
    statPath: (path) => ipcRenderer.invoke(IPC.system.statPath, path),
    logs: (limit) => ipcRenderer.invoke(IPC.system.logs, limit),
    log: (level, scope, message, data) => ipcRenderer.invoke(IPC.system.log, level, scope, message, data),
    onLogStream: (cb) => {
      const listener = (_e: unknown, entry: LogEntry): void => cb(entry)
      ipcRenderer.on(IPC.system.logStream, listener)
      return () => ipcRenderer.removeListener(IPC.system.logStream, listener)
    },
    about: () => ipcRenderer.invoke(IPC.system.about),
    checkUpdate: () => ipcRenderer.invoke(IPC.system.checkUpdate),
    updateState: () => ipcRenderer.invoke(IPC.system.updateState),
    installUpdate: () => ipcRenderer.invoke(IPC.system.installUpdate),
    onUpdateStatus: (cb) => {
      const listener = (_e: unknown, info: UpdateInfo): void => cb(info)
      ipcRenderer.on(IPC.system.updateStatus, listener)
      return () => ipcRenderer.removeListener(IPC.system.updateStatus, listener)
    },
    exportBackup: () => ipcRenderer.invoke(IPC.system.exportBackup),
    previewBackup: () => ipcRenderer.invoke(IPC.system.previewBackup),
    applyBackup: (path) => ipcRenderer.invoke(IPC.system.applyBackup, path),
    autoInstallEmulator: (id, displayName) =>
      ipcRenderer.invoke(IPC.system.autoInstallEmulator, id, displayName),
    onAutoInstallProgress: (cb) => {
      const listener = (_e: unknown, p: AutoInstallProgress): void => cb(p)
      ipcRenderer.on(IPC.system.autoInstallProgress, listener)
      return () => ipcRenderer.removeListener(IPC.system.autoInstallProgress, listener)
    },
    importSteam: () => ipcRenderer.invoke(IPC.system.importSteam),
    importEpic: () => ipcRenderer.invoke(IPC.system.importEpic),
    testSteamGridDb: () => ipcRenderer.invoke(IPC.system.testSteamGridDb),
    importRiot: () => ipcRenderer.invoke(IPC.system.importRiot),
    applyShadPs4Profile: (profile) => ipcRenderer.invoke(IPC.system.applyShadPs4Profile, profile),
    listCrashes: (gameId) => ipcRenderer.invoke(IPC.system.listCrashes, gameId),
    crashStats: (gameId) => ipcRenderer.invoke(IPC.system.crashStats, gameId),
    readCrashLog: (logPath) => ipcRenderer.invoke(IPC.system.readCrashLog, logPath),
    onCrashRecorded: (cb) => {
      const listener = (_e: unknown, r: CrashReport): void => cb(r)
      ipcRenderer.on(IPC.system.crashRecorded, listener)
      return () => ipcRenderer.removeListener(IPC.system.crashRecorded, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

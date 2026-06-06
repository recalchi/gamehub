/** Centralised IPC channel names so main and renderer never drift. */
export const IPC = {
  library: {
    scan: 'library:scan',
    list: 'library:list',
    get: 'library:get',
    update: 'library:update',
    toggleFavorite: 'library:toggle-favorite',
    progress: 'library:progress',
    enrich: 'library:enrich',
    enrichGames: 'library:enrich-games',
    refetchCover: 'library:refetch-cover',
    setManualCover: 'library:set-manual-cover',
    coverUpdated: 'library:cover-updated',
    addManual: 'library:add-manual',
    remove: 'library:remove',
    archiveRemove: 'library:archive-remove',
    healthCheck: 'library:health-check',
    cleanOrphans: 'library:clean-orphans',
    /** ipc: extract a compressed-archive game in-place and update its path */
    extractArchive: 'library:extract-archive'
  },
  emulator: {
    list: 'emulator:list',
    detect: 'emulator:detect',
    setOverride: 'emulator:set-override',
    test: 'emulator:test',
    checkBios: 'emulator:check-bios',
    /** ipc: install a user-picked BIOS file into the emulator's canonical dir */
    installBios: 'emulator:install-bios',
    /** ipc: spawn RPCS3 with a PUP file to trigger its firmware installer */
    installPs3Firmware: 'emulator:install-ps3-firmware',
    /** ipc: suggest an auto-installable emulator for a platform when none is detected */
    suggestInstall: 'emulator:suggest-install'
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update'
  },
  launch: {
    game: 'launch:game',
    folder: 'launch:folder',
    terminate: 'launch:terminate',
    /** broadcast: { gameId, gameTitle, code, seconds } when emulator exits non-zero early */
    failed: 'launch:failed',
    /** broadcast: ActiveLaunch payload when an emulator successfully spawns */
    started: 'launch:started',
    /** broadcast: { gameId, gameTitle } when its child process exits */
    ended: 'launch:ended',
    /** broadcast: when an emulator fails and we auto-retry with a different one */
    fallback: 'launch:fallback',
    /** ipc: returns ActiveLaunch[] for currently running emulators */
    active: 'launch:active'
  },
  performance: {
    /** ipc: returns the most recent sample for a game, if a monitor is running */
    latest: 'performance:latest',
    /** ipc: starts monitoring a native game that is already running */
    attach: 'performance:attach',
    /** ipc: returns the most recent finished session report for a game */
    report: 'performance:report',
    /** broadcast: PerformanceSample while a game is running */
    sample: 'performance:sample',
    /** broadcast: PerformanceReport when the monitored process exits */
    reportReady: 'performance:report-ready',
    /** ipc: list past session summaries for a game */
    sessions: 'performance:sessions',
    /** ipc: read full samples of one session for a game */
    session: 'performance:session',
    /** ipc: RTSS installed/running status (for the "ativar overlay" banner) */
    fpsCaptureStatus: 'performance:fps-capture-status',
    rtssStatus: 'performance:rtss-status',
    /** ipc: ask GameHub to launch RTSS if installed */
    rtssEnsure: 'performance:rtss-ensure'
  },
  discord: {
    /** ipc: returns current Discord RPC connection/config status */
    status: 'discord:status',
    /** ipc: probes Discord with the configured Application ID */
    validate: 'discord:validate'
  },
  achievements: {
    summaries: 'achievements:summaries',
    game: 'achievements:game',
    toggle: 'achievements:toggle',
    progress: 'achievements:progress'
  },
  journey: {
    list: 'journey:list',
    upsert: 'journey:upsert'
  },
  saves: {
    location: 'saves:location',
    list: 'saves:list',
    backup: 'saves:backup',
    restore: 'saves:restore',
    delete: 'saves:delete'
  },
  downloads: {
    start: 'downloads:start',
    cancel: 'downloads:cancel',
    progress: 'downloads:progress'
  },
  mods: {
    catalog: 'mods:catalog',
    installed: 'mods:installed',
    download: 'mods:download',
    progress: 'mods:progress'
  },
  controllers: {
    diagnostics: 'controllers:diagnostics'
  },
  media: {
    list: 'media:list',
    scan: 'media:scan',
    enrich: 'media:enrich',
    open: 'media:open',
    catalog: 'media:catalog',
    download: 'media:download',
    cancelDownload: 'media:cancel-download',
    generateSubtitles: 'media:generate-subtitles',
    watched: 'media:watched',
    recordWatch: 'media:record-watch',
    toggleFavorite: 'media:toggle-favorite',
    setWatched: 'media:set-watched',
    clearWatch: 'media:clear-watch',
    exportWatched: 'media:export-watched',
    refreshArtwork: 'media:refresh-artwork',
    progress: 'media:progress',
    removeFromLibrary: 'media:remove-from-library',
    streamingTrending: 'media:streaming-trending',
    streamingPairing: 'media:streaming-pairing',
    streamingConfirmPaired: 'media:streaming-confirm-paired'
  },
  system: {
    pickFolder: 'system:pick-folder',
    pickFile: 'system:pick-file',
    openExternal: 'system:open-external',
    toggleFullscreen: 'system:toggle-fullscreen',
    setFullscreen: 'system:set-fullscreen',
    isFullscreen: 'system:is-fullscreen',
    displays: 'system:displays',
    moveToDisplay: 'system:move-to-display',
    statPath: 'system:stat-path',
    logs: 'system:logs',
    log: 'system:log',
    /** broadcast: each LogEntry as it's written by the main process. */
    logStream: 'system:log-stream',
    about: 'system:about',
    checkUpdate: 'system:check-update',
    updateState: 'system:update-state',
    installUpdate: 'system:install-update',
    /** broadcast: updater lifecycle/progress updates */
    updateStatus: 'system:update-status',
    exportBackup: 'system:export-backup',
    previewBackup: 'system:preview-backup',
    applyBackup: 'system:apply-backup',
    /** ipc: kicks off download+install of a supported emulator */
    autoInstallEmulator: 'system:auto-install-emulator',
    /** broadcast: AutoInstallProgress events while install runs */
    autoInstallProgress: 'system:auto-install-progress',
    /** ipc: scan the local Steam install for games and add them to the library */
    importSteam: 'system:import-steam',
    /** ipc: scan local Epic manifests/.egstore folders and add games to the library */
    importEpic: 'system:import-epic',
    /** ipc: verify the user-provided SteamGridDB API key */
    testSteamGridDb: 'system:test-steamgriddb',
    /** ipc: scan local Riot Games installs and import them */
    importRiot: 'system:import-riot',
    /** ipc: write recommended shadPS4 config for a known engine profile */
    applyShadPs4Profile: 'system:apply-shadps4-profile',
    /** ipc: list crash reports for a game */
    listCrashes: 'system:list-crashes',
    /** ipc: aggregate crash stats for a game */
    crashStats: 'system:crash-stats',
    /** broadcast: emitted right after a crash is persisted */
    crashRecorded: 'system:crash-recorded',
    /** ipc: read full log of a specific crash */
    readCrashLog: 'system:read-crash-log',
    /** ipc: relaunch the app elevated (Windows) to enable RTSS reading */
    relaunchAsAdmin: 'system:relaunch-as-admin'
  }
} as const

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
    refetchCover: 'library:refetch-cover',
    setManualCover: 'library:set-manual-cover',
    coverUpdated: 'library:cover-updated',
    addManual: 'library:add-manual',
    remove: 'library:remove',
    healthCheck: 'library:health-check',
    cleanOrphans: 'library:clean-orphans'
  },
  emulator: {
    list: 'emulator:list',
    detect: 'emulator:detect',
    setOverride: 'emulator:set-override',
    test: 'emulator:test',
    checkBios: 'emulator:check-bios'
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update'
  },
  launch: {
    game: 'launch:game',
    folder: 'launch:folder',
    /** broadcast: { gameId, gameTitle, code, seconds } when emulator exits non-zero early */
    failed: 'launch:failed',
    /** broadcast: ActiveLaunch payload when an emulator successfully spawns */
    started: 'launch:started',
    /** broadcast: { gameId, gameTitle } when its child process exits */
    ended: 'launch:ended',
    /** ipc: returns ActiveLaunch[] for currently running emulators */
    active: 'launch:active'
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
  system: {
    pickFolder: 'system:pick-folder',
    pickFile: 'system:pick-file',
    openExternal: 'system:open-external',
    toggleFullscreen: 'system:toggle-fullscreen',
    setFullscreen: 'system:set-fullscreen',
    isFullscreen: 'system:is-fullscreen',
    statPath: 'system:stat-path',
    logs: 'system:logs',
    log: 'system:log',
    about: 'system:about',
    checkUpdate: 'system:check-update',
    exportBackup: 'system:export-backup',
    previewBackup: 'system:preview-backup',
    applyBackup: 'system:apply-backup'
  }
} as const

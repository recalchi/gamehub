import { BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { scanLibrary } from '@main/core/scanner'
import { detectEmulators } from '@main/core/emulators'
import { launchGame, listActiveLaunches, openFolder } from '@main/core/launcher'
import { libraryStore, settingsStore } from '@main/core/store'
import { log } from '@main/core/logger'
import { enrichLibrary, fetchSingle, setManualCover } from '@main/core/covers'
import { checkBios } from '@main/core/bios'
import { collectAbout, checkForUpdate } from '@main/core/about'
import { applyBackup, exportBackup, previewBackup } from '@main/core/backup'
import { addManualGame, removeGame, type ManualGameInput } from '@main/core/manualGames'
import { runHealthCheck, cleanOrphans } from '@main/core/health'
import { startDownload, cancelDownload, type StartDownloadInput } from '@main/core/downloads'
import {
  backupSave,
  deleteBackup,
  describeSaveLocation,
  listBackups,
  probeSaveLocations,
  restoreSave
} from '@main/core/saves'
import { IPC } from '@shared/ipc'
import type { AppSettings, EmulatorId, Game } from '@shared/types'
import { existsSync } from 'node:fs'

export function registerIpcHandlers(): void {
  // ----- Library -----
  ipcMain.handle(IPC.library.list, () => {
    log.info('ipc', 'library.list')
    return libraryStore.load()
  })

  ipcMain.handle(IPC.library.scan, async (_e, opts?: { fresh?: boolean }) => {
    log.info('ipc', `library.scan fresh=${opts?.fresh ?? false}`)
    const settings = settingsStore.load()
    const r = await scanLibrary({
      gameRoots: settings.gameRoots,
      emulatorRoots: settings.emulatorRoots,
      fresh: opts?.fresh ?? false
    })
    log.info('ipc', `library.scan complete: ${r.games.length} games`)
    // Post-scan diagnostic — log which games have resolvable save folders.
    probeSaveLocations()
    return r
  })

  ipcMain.handle(IPC.library.get, (_e, id: string) => {
    const data = libraryStore.load()
    return data.games.find((g) => g.id === id) ?? null
  })

  ipcMain.handle(IPC.library.update, (_e, id: string, patch: Partial<Game>) =>
    libraryStore.patchGame(id, patch)
  )

  ipcMain.handle(IPC.library.toggleFavorite, (_e, id: string) => {
    const data = libraryStore.load()
    const g = data.games.find((x) => x.id === id)
    if (!g) return null
    return libraryStore.patchGame(id, { favorite: !g.favorite })
  })

  ipcMain.handle(IPC.library.enrich, async () => {
    log.info('ipc', 'library.enrich')
    return enrichLibrary()
  })

  ipcMain.handle(IPC.library.refetchCover, async (_e, id: string) => {
    log.info('ipc', `library.refetch-cover ${id}`)
    return fetchSingle(id)
  })

  ipcMain.handle(IPC.library.setManualCover, async (_e, id: string, sourcePath: string) => {
    log.info('ipc', `library.set-manual-cover ${id}`)
    return setManualCover(id, sourcePath)
  })

  ipcMain.handle(IPC.library.addManual, (_e, input: ManualGameInput) => {
    log.info('ipc', `library.add-manual: ${input.title}`)
    return addManualGame(input)
  })

  ipcMain.handle(IPC.library.remove, (_e, id: string) => {
    log.info('ipc', `library.remove ${id}`)
    return removeGame(id)
  })

  ipcMain.handle(IPC.library.healthCheck, () => runHealthCheck())
  ipcMain.handle(IPC.library.cleanOrphans, () => cleanOrphans())

  // ----- Downloads -----
  ipcMain.handle(IPC.downloads.start, (_e, input: StartDownloadInput) => {
    log.info('ipc', `downloads.start: ${input.url}`)
    return startDownload(input)
  })
  ipcMain.handle(IPC.downloads.cancel, (_e, id: string) => {
    log.info('ipc', `downloads.cancel ${id}`)
    return cancelDownload(id)
  })

  // ----- Emulators -----
  ipcMain.handle(IPC.emulator.list, () => libraryStore.load().emulators)

  ipcMain.handle(IPC.emulator.detect, async () => {
    const settings = settingsStore.load()
    const errors: string[] = []
    const { emulators } = await detectEmulators(settings.emulatorRoots, errors)
    const data = libraryStore.load()
    libraryStore.save(data.games, emulators)
    return { emulators, errors }
  })

  ipcMain.handle(IPC.emulator.setOverride, (_e, id: EmulatorId, exePath: string) => {
    const settings = settingsStore.load()
    settings.emulatorOverrides = { ...settings.emulatorOverrides, [id]: exePath }
    settingsStore.save(settings)
    return settings
  })

  ipcMain.handle(IPC.emulator.test, (_e, exePath: string) => existsSync(exePath))

  ipcMain.handle(IPC.emulator.checkBios, (_e, emulatorId: string) => {
    const emu = libraryStore.load().emulators.find((e) => e.id === emulatorId)
    return checkBios(emu)
  })

  // ----- Settings -----
  ipcMain.handle(IPC.settings.get, () => settingsStore.load())

  ipcMain.handle(IPC.settings.update, (_e, patch: Partial<AppSettings>) => {
    const next = { ...settingsStore.load(), ...patch }
    settingsStore.save(next)
    return next
  })

  // ----- Launch -----
  ipcMain.handle(IPC.launch.game, async (_e, id: string) => {
    const data = libraryStore.load()
    const game = data.games.find((g) => g.id === id)
    if (!game) return { ok: false, error: 'Jogo não encontrado.' }
    return launchGame(game)
  })

  ipcMain.handle(IPC.launch.folder, async (_e, path: string) => {
    await openFolder(path)
    return { ok: true }
  })

  ipcMain.handle(IPC.launch.active, () => listActiveLaunches())

  // ----- Saves -----
  ipcMain.handle(IPC.saves.location, (_e, gameId: string) => describeSaveLocation(gameId))
  ipcMain.handle(IPC.saves.list, (_e, gameId: string) => listBackups(gameId))
  ipcMain.handle(IPC.saves.backup, (_e, gameId: string) => backupSave(gameId))
  ipcMain.handle(IPC.saves.restore, (_e, gameId: string, snapshotId: string) =>
    restoreSave(gameId, snapshotId)
  )
  ipcMain.handle(IPC.saves.delete, (_e, gameId: string, snapshotId: string) =>
    deleteBackup(gameId, snapshotId)
  )

  // ----- System -----
  ipcMain.handle(IPC.system.pickFolder, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle(IPC.system.pickFile, async (_e, filters?: Electron.FileFilter[]) => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters ?? [{ name: 'Executável', extensions: ['exe'] }]
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle(IPC.system.openExternal, (_e, url: string) => shell.openExternal(url))

  ipcMain.handle(IPC.system.toggleFullscreen, () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return false
    win.setFullScreen(!win.isFullScreen())
    return win.isFullScreen()
  })

  ipcMain.handle(IPC.system.setFullscreen, (_e, on: boolean) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return false
    if (win.isFullScreen() !== on) win.setFullScreen(on)
    return win.isFullScreen()
  })

  ipcMain.handle(IPC.system.isFullscreen, () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    return win ? win.isFullScreen() : false
  })

  ipcMain.handle(IPC.system.logs, (_e, limit?: number) => log.recent(limit))

  ipcMain.handle(IPC.system.log, (_e, level: 'info' | 'warn' | 'error', scope: string, message: string, data?: unknown) => {
    log[level](scope, message, data)
  })

  ipcMain.handle(IPC.system.about, () => collectAbout())
  ipcMain.handle(IPC.system.checkUpdate, (_e, url?: string) => checkForUpdate(url))
  ipcMain.handle(IPC.system.exportBackup, () => exportBackup())
  ipcMain.handle(IPC.system.previewBackup, () => previewBackup())
  ipcMain.handle(IPC.system.applyBackup, (_e, path: string) => applyBackup(path))
}

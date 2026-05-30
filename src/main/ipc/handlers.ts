import { BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { scanLibrary } from '@main/core/scanner'
import { detectEmulators } from '@main/core/emulators'
import { launchGame, listActiveLaunches, openFolder, terminateLaunch } from '@main/core/launcher'
import { libraryStore, settingsStore } from '@main/core/store'
import { log } from '@main/core/logger'
import { backfillBundledCovers, enrichGames, enrichLibrary, fetchSingle, setManualCover } from '@main/core/covers'
import { extractArchive } from '@main/core/archiveTools'
import { readdir, stat as fsStat } from 'node:fs/promises'
import { join as pathJoin } from 'node:path'
import {
  checkBios,
  discoverExternalBiosFiles,
  installBiosFile,
  installPs3Firmware,
  reconcileBiosStatus,
  shareBiosAcrossEmulators
} from '@main/core/bios'
import { lookupSerial, looksLikeDiscSerial } from '@shared/discSerials'
import { basename as pathBasename, extname as pathExtname } from 'node:path'
import { homedir } from 'node:os'
import { join as joinHome } from 'node:path'
import { collectAbout } from '@main/core/about'
import {
  checkForUpdatesNow,
  getUpdateState,
  installDownloadedUpdate
} from '@main/core/updater'
import { applyBackup, exportBackup, previewBackup } from '@main/core/backup'
import { addManualGame, importSteamGames, removeGame, type ManualGameInput } from '@main/core/manualGames'
import { importEpicGames } from '@main/core/epic'
import {
  cancelMediaDownload,
  enrichMediaItems,
  exportWatchedMediaBackup,
  generateAutoSubtitles,
  listMedia,
  listWatchedMedia,
  MEDIA_CATALOG,
  openMedia,
  recordMediaWatch,
  refreshMediaArtwork,
  scanMediaLibrary,
  startMediaDownload,
  toggleMediaFavorite,
  setMediaWatchedState,
  clearMediaWatch
} from '@main/core/cinema'
import { runHealthCheck, cleanOrphans } from '@main/core/health'
import { startDownload, cancelDownload, type StartDownloadInput } from '@main/core/downloads'
import { canAutoInstall, installEmulator } from '@main/core/autoInstall'
import { collectControllerDiagnostics } from '@main/core/controllers'
import { latestPerformanceReport, latestPerformanceSample } from '@main/core/performance'
import { discordRpcStatus, discordRpcValidate } from '@main/core/discordRpc'
import { listInstalledMods, listModCatalog, startModDownload } from '@main/core/modCatalog'
import { achievementDetail, listAchievementSummaries } from '@main/core/achievements'
import { PLATFORMS } from '@shared/platforms'
import { EMULATORS } from '@shared/emulators'
import {
  backupSave,
  deleteBackup,
  describeSaveLocation,
  listBackups,
  probeSaveLocations,
  restoreSave
} from '@main/core/saves'
import { IPC } from '@shared/ipc'
import type { AppSettings, DisplayTarget, EmulatorId, Game, GameStatus, ModDownloadInput, PlatformId } from '@shared/types'
import { existsSync } from 'node:fs'
import { listDisplays, moveMainWindowToDisplay } from '@main/core/windowing'

/**
 * Walk every game in the library and re-pick its emulator + status given the
 * currently detected emulators. Fixes legacy entries that pre-date the smarter
 * emulator-assignment in `addManualGame` (NES/SNES games stuck on
 * `status: ready` with no emulator attached).
 *
 * Cheap: just an in-memory pass plus one write if anything changed.
 *
 * Exported so CLI smokes / refresh commands can call it directly.
 */
/**
 * Apply the smarter title extraction (serials DB + parent-folder fallback)
 * to existing library entries. Lets us upgrade titles like "SCUS-97328" →
 * "Gran Turismo 4" without forcing a full re-scan.
 *
 * Only touches scanned games (no `adicionado manualmente` flag) — manual
 * entries have user-provided titles that we shouldn't overwrite.
 */
export function retitleSerialOnlyGames(): void {
  const data = libraryStore.load()
  let dirty = false
  const updated = data.games.map((g) => {
    if (g.flags?.includes('adicionado manualmente')) return g
    if (!looksLikeDiscSerial(g.title)) return g
    // Try DB lookup first
    const match = g.title.match(/(SCUS|SLUS|SLES|SCES|SLPS|SLPM|SCPS|PBPX|SCED)-\d+/i)
    if (match) {
      const fromDb = lookupSerial(match[0])
      if (fromDb) {
        dirty = true
        return { ...g, title: fromDb }
      }
    }
    // Fall back to parent folder name
    const parts = g.path.split(/[\\/]/)
    for (let levelsUp = 1; levelsUp <= 2 && parts.length > levelsUp; levelsUp++) {
      const folder = parts[parts.length - 1 - levelsUp]
      if (!folder || looksLikeDiscSerial(folder)) continue
      if (/^(ps[123]|psp|psx|xbox|wii|gamecube|nes|snes|n64|gb[ac]?|nds|3ds)$/i.test(folder)) continue
      const clean = folder
        .replace(/[_]+/g, ' ')
        .replace(/\s*\([^)]+\)/g, '')
        .replace(/\s*\[[^\]]+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (clean) {
        dirty = true
        return { ...g, title: clean }
      }
    }
    // Silence unused-import linter warning for pathBasename/pathExtname when
    // we don't enter the fallback (still useful for future expansions)
    void pathBasename
    void pathExtname
    return g
  })
  if (dirty) {
    libraryStore.save(updated, data.emulators)
    log.info('ipc', 'retitled serial-only games via local DB / parent folders')
  }
}

export function reconcileManualGameEmulators(): void {
  const data = libraryStore.load()
  const settings = settingsStore.load()
  const detected = new Set(data.emulators.map((e) => e.id))
  const overrides = settings.platformEmulators
  // In manual mode the user owns every per-game emulator decision. Don't
  // second-guess their picks just because the platform default disagrees —
  // that's the bug that made the GameDetail picker "revert" after a click.
  const manualMode = settings.emulatorSelection === 'manual'
  let dirty = false
  const updated = data.games.map((g) => {
    if (g.platform === 'pc') return g
    const platformDef = PLATFORMS[g.platform]
    if (!platformDef) return g

    const ordered = overrides[g.platform]
      ? [
          overrides[g.platform]!,
          ...platformDef.emulators.filter((e) => e !== overrides[g.platform])
        ]
      : platformDef.emulators

    const installed = ordered.find((id) => detected.has(id))
    const fallbackPick = installed ?? ordered[0]

    // Respect the per-game pick: if the user (or a previous successful
    // fallback) chose an emulator that's still valid for this platform and
    // installed, keep it. Only swap when the chosen emulator is no longer
    // a candidate or no longer detected.
    const currentIsValid =
      g.emulator !== undefined &&
      g.emulator !== 'unknown' &&
      platformDef.emulators.includes(g.emulator) &&
      detected.has(g.emulator)

    const expectedEmulator =
      manualMode && g.emulator && g.emulator !== 'unknown'
        ? g.emulator // strict in manual mode — never touch
        : currentIsValid
          ? g.emulator!
          : fallbackPick

    const def = expectedEmulator ? EMULATORS[expectedEmulator] : undefined
    const emulatorReady = expectedEmulator
      ? detected.has(expectedEmulator)
      : Boolean(installed)
    const expectedStatus: GameStatus = !emulatorReady
      ? 'missing-emulator'
      : def?.needsBios
        ? g.status === 'ready'
          ? 'ready' // keep — BIOS reconcile probably already promoted it
          : 'missing-bios'
        : 'ready'

    if (g.emulator !== expectedEmulator || g.status !== expectedStatus) {
      dirty = true
      const patched: Game = { ...g, emulator: expectedEmulator, status: expectedStatus }
      return patched
    }
    return g
  })
  if (dirty) {
    libraryStore.save(updated, data.emulators)
    log.info('ipc', 'reconciled manual game emulators/status')
  }
}

export function registerIpcHandlers(): void {
  // ----- Library -----
  ipcMain.handle(IPC.library.list, async () => {
    log.info('ipc', 'library.list')
    retitleSerialOnlyGames()
    reconcileManualGameEmulators()
    // Best-effort cover backfill — recovers cover images bundled alongside
    // ROMs in earlier seeds that pre-date the auto-cover extraction.
    await backfillBundledCovers()
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

  ipcMain.handle(IPC.library.enrichGames, async (_e, ids: string[]) => {
    log.info('ipc', `library.enrich-games ${ids.length}`)
    return enrichGames(ids)
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

  ipcMain.handle(IPC.system.importSteam, async () => {
    log.info('ipc', 'system.importSteam')
    return importSteamGames()
  })

  ipcMain.handle(IPC.system.testSteamGridDb, async () => {
    log.info('ipc', 'system.testSteamGridDb')
    const { testSteamGridDbKey } = await import('@main/core/steamGridDb')
    return testSteamGridDbKey()
  })

  ipcMain.handle(IPC.system.importRiot, async () => {
    log.info('ipc', 'system.importRiot')
    const { importRiotGames } = await import('@main/core/riot')
    return importRiotGames()
  })

  ipcMain.handle(IPC.system.applyShadPs4Profile, async (_e, profile: 'ue4' | 'default') => {
    log.info('ipc', `system.applyShadPs4Profile ${profile}`)
    const { applyShadPs4Profile } = await import('@main/core/shadps4')
    return applyShadPs4Profile(profile)
  })

  ipcMain.handle(IPC.system.listCrashes, async (_e, gameId: string) => {
    const { listCrashes } = await import('@main/core/crashTracker')
    return listCrashes(gameId)
  })

  ipcMain.handle(IPC.system.crashStats, async (_e, gameId: string) => {
    const { crashStats } = await import('@main/core/crashTracker')
    return crashStats(gameId)
  })

  ipcMain.handle(IPC.system.readCrashLog, async (_e, logPath: string) => {
    const { readFileSync } = await import('node:fs')
    try {
      // Sanity: only allow paths inside the crashes dir
      const { PATHS } = await import('@main/core/paths')
      const crashesRoot = `${PATHS.userData}\\crashes\\`
      if (!logPath.startsWith(crashesRoot) && !logPath.startsWith(crashesRoot.replace(/\\/g, '/'))) {
        return { error: 'Caminho de log fora do diretório de crashes.' }
      }
      return { content: readFileSync(logPath, 'utf8') }
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC.system.importEpic, async () => {
    log.info('ipc', 'system.importEpic')
    const result = await importEpicGames()
    void enrichLibrary()
    return result
  })

  ipcMain.handle(IPC.library.healthCheck, () => runHealthCheck())
  ipcMain.handle(IPC.library.cleanOrphans, () => cleanOrphans())

  ipcMain.handle(IPC.library.extractArchive, async (_e, gameId: string) => {
    const data = libraryStore.load()
    const game = data.games.find((g) => g.id === gameId)
    if (!game) return { error: 'Jogo não encontrado.' }
    if (!existsSync(game.path)) return { error: `Arquivo não encontrado: ${game.path}` }
    const platformDef = (await import('@shared/platforms')).PLATFORMS[game.platform]
    if (!platformDef) return { error: `Plataforma desconhecida: ${game.platform}` }

    const destDir = game.path.substring(0, game.path.lastIndexOf('.'))
    log.info('ipc', `extractArchive: ${game.title} → ${destDir}`)
    const ok = await extractArchive(game.path, destDir)
    if (!ok) {
      return {
        error:
          'Falha na extração. Verifique formato suportado (.zip/.7z) ou se há espaço em disco.'
      }
    }
    // Find the largest file matching this platform's extensions inside the
    // extracted tree — that's almost certainly the ISO/ROM the user wants.
    const validExts = new Set(platformDef.extensions.map((e) => `.${e.toLowerCase()}`))
    // Wrap in a single-prop ref so TS doesn't narrow `best` to `never` after
    // the async closure mutates it.
    const winner: { hit: { path: string; size: number } | null } = { hit: null }
    async function walk(dir: string, depth: number): Promise<void> {
      if (depth > 4) return
      let entries: string[]
      try {
        entries = await readdir(dir)
      } catch {
        return
      }
      for (const entry of entries) {
        const full = pathJoin(dir, entry)
        let st
        try {
          st = await fsStat(full)
        } catch {
          continue
        }
        if (st.isDirectory()) {
          await walk(full, depth + 1)
          continue
        }
        const ext = entry.toLowerCase().substring(entry.lastIndexOf('.'))
        if (!validExts.has(ext)) continue
        if (!winner.hit || st.size > winner.hit.size) {
          winner.hit = { path: full, size: st.size }
        }
      }
    }
    await walk(destDir, 0)
    if (!winner.hit) {
      return {
        error: 'Extração ok, mas nenhum arquivo ISO/ROM válido foi encontrado dentro.'
      }
    }
    // Update the game record to point at the extracted file. Recompute status:
    // archive was 'corrupted', extracted file should at minimum be 'ready' for
    // an HLE emu or 'missing-bios' if BIOS is needed.
    libraryStore.patchGame(gameId, { path: winner.hit.path, status: 'ready' })
    log.info('ipc', `extracted ${game.title} → ${winner.hit.path} (${winner.hit.size} bytes)`)
    // Reconcile so missing-bios resolves correctly for the new path
    reconcileManualGameEmulators()
    return { ok: true, extractedPath: winner.hit.path, sizeBytes: winner.hit.size }
  })

  // ----- Downloads -----
  ipcMain.handle(IPC.downloads.start, (_e, input: StartDownloadInput) => {
    log.info('ipc', `downloads.start: ${input.url}`)
    return startDownload(input)
  })
  ipcMain.handle(IPC.downloads.cancel, (_e, id: string) => {
    log.info('ipc', `downloads.cancel ${id}`)
    return cancelDownload(id)
  })

  // ----- Mods -----
  ipcMain.handle(IPC.mods.catalog, () => listModCatalog())
  ipcMain.handle(IPC.mods.installed, () => listInstalledMods())
  ipcMain.handle(IPC.mods.download, (_e, input: ModDownloadInput) => startModDownload(input))

  // ----- Controllers -----
  ipcMain.handle(IPC.controllers.diagnostics, () => collectControllerDiagnostics())

  // ----- Cinema / media -----
  ipcMain.handle(IPC.media.list, () => listMedia())
  ipcMain.handle(IPC.media.scan, (_e, opts?: { fresh?: boolean }) => scanMediaLibrary(opts))
  ipcMain.handle(IPC.media.enrich, (_e, ids?: string[]) => enrichMediaItems(ids))
  ipcMain.handle(IPC.media.open, (_e, id: string) => openMedia(id))
  ipcMain.handle(IPC.media.catalog, () => MEDIA_CATALOG)
  ipcMain.handle(IPC.media.download, (_e, entryId: string) => startMediaDownload(entryId))
  ipcMain.handle(IPC.media.cancelDownload, (_e, id: string) => cancelMediaDownload(id))
  ipcMain.handle(IPC.media.generateSubtitles, (_e, input) => generateAutoSubtitles(input))
  ipcMain.handle(IPC.media.watched, () => listWatchedMedia())
  ipcMain.handle(IPC.media.recordWatch, (_e, input) => recordMediaWatch(input))
  ipcMain.handle(IPC.media.toggleFavorite, (_e, id: string) => toggleMediaFavorite(id))
  ipcMain.handle(IPC.media.setWatched, (_e, id: string, completed: boolean) =>
    setMediaWatchedState(id, completed)
  )
  ipcMain.handle(IPC.media.clearWatch, (_e, id: string) => clearMediaWatch(id))
  ipcMain.handle(IPC.media.exportWatched, () => exportWatchedMediaBackup())
  ipcMain.handle(IPC.media.refreshArtwork, (_e, ids?: string[]) => refreshMediaArtwork(ids))

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

  ipcMain.handle(IPC.emulator.suggestInstall, (_e, platform: PlatformId) => {
    // Return the first emulator in the platform's preference order that we
    // can auto-install AND isn't already detected. UI uses this to render a
    // one-click "Install X" button on games whose platform has no emulator.
    const platformDef = PLATFORMS[platform]
    if (!platformDef) return null
    const detected = new Set(libraryStore.load().emulators.map((e) => e.id))
    for (const id of platformDef.emulators) {
      if (detected.has(id)) continue
      if (!canAutoInstall(id)) continue
      const def = EMULATORS[id]
      if (!def) continue
      return { emulatorId: id, emulatorName: def.name }
    }
    return null
  })

  ipcMain.handle(
    IPC.emulator.installBios,
    (_e, emulatorId: EmulatorId, sourcePath: string) => {
      const data = libraryStore.load()
      const emu = data.emulators.find((e) => e.id === emulatorId)
      if (!emu) return { error: `Emulador ${emulatorId} não detectado.` }
      const r = installBiosFile(emu, sourcePath)
      if ('ok' in r) {
        // Promote any games tied to this emu from missing-bios → ready
        const stats = reconcileBiosStatus(data.games, data.emulators)
        libraryStore.save(data.games, data.emulators)
        log.info('ipc', `installBios: promoted ${stats.promoted} games to ready`)
      }
      return r
    }
  )

  ipcMain.handle(IPC.emulator.installPs3Firmware, async () => {
    return installPs3Firmware()
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

  ipcMain.handle(IPC.launch.terminate, async (_e, gameId: string) => {
    log.info('ipc', `launch.terminate ${gameId}`)
    return terminateLaunch(gameId)
  })

  ipcMain.handle(IPC.performance.latest, (_e, gameId: string) =>
    latestPerformanceSample(gameId)
  )

  ipcMain.handle(IPC.performance.report, (_e, gameId: string) =>
    latestPerformanceReport(gameId)
  )

  ipcMain.handle(IPC.discord.status, () => discordRpcStatus())
  ipcMain.handle(IPC.discord.validate, () => discordRpcValidate())

  ipcMain.handle(IPC.achievements.summaries, () => listAchievementSummaries())
  ipcMain.handle(IPC.achievements.game, (_e, gameId: string) => achievementDetail(gameId))

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

  ipcMain.handle(IPC.system.displays, () => listDisplays())

  ipcMain.handle(IPC.system.moveToDisplay, (_e, target: DisplayTarget) =>
    moveMainWindowToDisplay(target)
  )

  ipcMain.handle(IPC.system.statPath, async (_e, path: string) => {
    try {
      const { stat } = await import('node:fs/promises')
      const st = await stat(path)
      return { exists: true, isDirectory: st.isDirectory(), size: st.size }
    } catch {
      return { exists: false, isDirectory: false, size: 0 }
    }
  })

  ipcMain.handle(IPC.system.logs, (_e, limit?: number) => log.recent(limit))

  ipcMain.handle(IPC.system.log, (_e, level: 'info' | 'warn' | 'error', scope: string, message: string, data?: unknown) => {
    log[level](scope, message, data)
  })

  ipcMain.handle(IPC.system.about, () => collectAbout())
  ipcMain.handle(IPC.system.checkUpdate, () => checkForUpdatesNow())
  ipcMain.handle(IPC.system.updateState, () => getUpdateState())
  ipcMain.handle(IPC.system.installUpdate, () => installDownloadedUpdate())
  ipcMain.handle(IPC.system.exportBackup, () => exportBackup())
  ipcMain.handle(IPC.system.previewBackup, () => previewBackup())
  ipcMain.handle(IPC.system.applyBackup, (_e, path: string) => applyBackup(path))
  ipcMain.handle(
    IPC.system.autoInstallEmulator,
    async (_e, id: EmulatorId, displayName: string) => {
      log.info('ipc', `system.autoInstallEmulator ${id}`)
      const r = await installEmulator(id, displayName)
      // After install, refresh the emulator list AND share BIOS into the new
      // install — otherwise the freshly installed DuckStation hits its first
      // launch without any BIOS in its data dir and confuses the user.
      if ('ok' in r) {
        const settings = settingsStore.load()
        const errors: string[] = []
        const det = await detectEmulators(settings.emulatorRoots, errors)
        const home = homedir()
        const biosRoots = Array.from(
          new Set([
            ...settings.gameRoots,
            ...settings.emulatorRoots,
            joinHome(home, 'Downloads'),
            joinHome(home, 'Documents')
          ])
        )
        const externalBios = discoverExternalBiosFiles(biosRoots)
        const share = shareBiosAcrossEmulators(det.emulators, externalBios)
        if (share.shared > 0) {
          log.info('ipc', `post-install BIOS share: ${share.shared} file(s)`, share.details)
        }
        const data = libraryStore.load()
        reconcileBiosStatus(data.games, det.emulators)
        libraryStore.save(data.games, det.emulators)
      }
      return r
    }
  )
}

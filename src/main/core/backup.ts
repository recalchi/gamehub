import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dialog } from 'electron'
import { PATHS } from './paths'
import { settingsStore, libraryStore } from './store'
import { log } from './logger'

/**
 * Export + import the full GameHub config (settings + library) as a single
 * JSON file. Useful for backing up before a reinstall or syncing between
 * machines.
 *
 * Format is versioned so future schema changes can be migrated gracefully.
 * Covers are not bundled (they're a cache and would balloon the file size);
 * the user can clear/repopulate them via the existing enrich flow.
 */

const BACKUP_VERSION = 1

interface BackupPayload {
  version: number
  exportedAt: string
  /** GameHub app version that produced this backup */
  appVersion?: string
  settings: unknown
  library: unknown
}

/** Headless writer — used by both the UI dialog flow and the smoke test. */
export async function writeBackupTo(path: string): Promise<{ ok: true; path: string } | { error: string }> {
  try {
    const payload: BackupPayload = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      settings: settingsStore.load(),
      library: libraryStore.load()
    }
    await writeFile(path, JSON.stringify(payload, null, 2), 'utf8')
    log.info('backup', `exported to ${path}`)
    return { ok: true, path }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('backup', `export failed: ${msg}`)
    return { error: msg }
  }
}

export async function exportBackup(suggestedPath?: string): Promise<{ ok: true; path: string } | { error: string }> {
  const r = await dialog.showSaveDialog({
    defaultPath: suggestedPath ?? `gamehub-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'GameHub Backup (JSON)', extensions: ['json'] }],
    title: 'Salvar backup do GameHub'
  })
  if (r.canceled || !r.filePath) return { error: 'Cancelado.' }
  return writeBackupTo(r.filePath)
}

export interface BackupPreview {
  ok: true
  exportedAt: string
  appVersion?: string
  gameCount: number
  emulatorCount: number
  path: string
}

export async function previewBackup(): Promise<BackupPreview | { error: string }> {
  const r = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'GameHub Backup (JSON)', extensions: ['json'] }],
    title: 'Selecionar backup para restaurar'
  })
  if (r.canceled || !r.filePaths[0]) return { error: 'Cancelado.' }
  const path = r.filePaths[0]
  try {
    const raw = await readFile(path, 'utf8')
    const data = JSON.parse(raw) as BackupPayload
    if (typeof data?.version !== 'number') {
      return { error: 'Arquivo não parece ser um backup do GameHub.' }
    }
    if (data.version > BACKUP_VERSION) {
      return {
        error: `Backup foi feito por uma versão mais nova (v${data.version}). Atualize o GameHub.`
      }
    }
    const lib = data.library as { games?: unknown[]; emulators?: unknown[] }
    return {
      ok: true,
      exportedAt: data.exportedAt,
      appVersion: data.appVersion,
      gameCount: Array.isArray(lib?.games) ? lib.games.length : 0,
      emulatorCount: Array.isArray(lib?.emulators) ? lib.emulators.length : 0,
      path
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('backup', `preview failed: ${msg}`)
    return { error: msg }
  }
}

export async function applyBackup(path: string): Promise<{ ok: true } | { error: string }> {
  if (!existsSync(path)) return { error: 'Arquivo não encontrado.' }
  try {
    const raw = await readFile(path, 'utf8')
    const data = JSON.parse(raw) as BackupPayload

    // Auto-save the CURRENT state next to the import target so the user can
    // recover if the backup turns out to be wrong.
    const safetyPath = path.replace(/\.json$/i, '') + `.pre-restore-${Date.now()}.json`
    try {
      const current: BackupPayload = {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        settings: settingsStore.load(),
        library: libraryStore.load()
      }
      await writeFile(safetyPath, JSON.stringify(current, null, 2), 'utf8')
      log.info('backup', `safety snapshot written to ${safetyPath}`)
    } catch (err) {
      log.warn('backup', `safety snapshot failed: ${String(err)}`)
    }

    // Write directly to the on-disk files so they take effect immediately
    if (data.settings && typeof data.settings === 'object') {
      await writeFile(PATHS.settingsFile, JSON.stringify(data.settings, null, 2), 'utf8')
    }
    if (data.library && typeof data.library === 'object') {
      await writeFile(PATHS.libraryFile, JSON.stringify(data.library, null, 2), 'utf8')
    }
    log.info('backup', `restored from ${path}`)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('backup', `restore failed: ${msg}`)
    return { error: msg }
  }
}

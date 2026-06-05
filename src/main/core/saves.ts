import { existsSync, readdirSync, statSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { PATHS } from './paths'
import { libraryStore } from './store'
import { log } from './logger'
import {
  PC_SAVE_CATALOG,
  PC_FALLBACK_ROOTS,
  normalizeTitle,
  expandPath
} from './save-catalog/pc'
import type { EmulatorId, Game, SaveSnapshot } from '@shared/types'

/**
 * Modern emulators often store user data under `%USERPROFILE%\Documents\<App>\`
 * by default (PCSX2 Qt, PPSSPP, Dolphin). We check those locations as a
 * fallback when the install-dir-relative path doesn't exist.
 */
const DOCUMENTS_FALLBACKS: Partial<Record<EmulatorId, string[]>> = {
  pcsx2: ['Documents\\PCSX2\\memcards', 'Documents\\PCSX2\\sstates'],
  ppsspp: ['Documents\\PPSSPP\\memstick\\PSP\\SAVEDATA'],
  dolphin: ['Documents\\Dolphin Emulator\\GC', 'Documents\\Dolphin Emulator\\Wii'],
  duckstation: ['Documents\\DuckStation\\memcards', 'Documents\\DuckStation\\savestates']
}

/**
 * Save manager — backup, restore, list snapshots.
 *
 * Most retro emulators don't keep per-game save folders; they share a single
 * directory (memcards/, saves/, savestates/). For these we snapshot the whole
 * folder. For per-game emulators (rpcs3 with its `dev_hdd0/home/.../savedata`),
 * we snapshot only the game's subfolder.
 *
 * Snapshots live at:
 *   userdata/saves/<gameId>/<ISO-timestamp>/
 *
 * Each snapshot is just a flat copy of the relevant directory tree. No
 * compression for the MVP — keeps the code simple and the files browsable
 * from Explorer.
 */

interface SaveLocation {
  /** absolute path to the source folder we'll back up */
  path: string
  /** human-readable label shown in UI */
  label: string
}

/**
 * Resolve where the emulator stores saves for this game.
 * For shared memcard emulators, the same path is returned for every game on
 * that platform — the user accepts that "backup save for X" snapshots the
 * entire memcard.
 */
function resolveSaveLocation(game: Game, emulatorInstallPath?: string): SaveLocation | null {
  // PC standalone games: look up known save-path catalog, then fuzzy fallback.
  // Steam/Epic/Riot entries are intentionally skipped here — store integrations
  // handle their saves; mixing would conflate two unrelated install footprints.
  if (game.platform === 'pc') {
    if (
      game.path.startsWith('steam://') ||
      game.path.startsWith('epic://') ||
      game.path.startsWith('riot://') ||
      game.flags?.includes('steam') ||
      game.flags?.includes('epic') ||
      game.flags?.includes('riot')
    ) {
      return null
    }
    return resolvePcSaveLocation(game)
  }

  if (!game.emulator || !emulatorInstallPath) return null

  const candidates: Partial<Record<EmulatorId, string[]>> = {
    epsxe: ['memcards', 'sstates'],
    psxfin: ['cards', 'saves'],
    duckstation: ['memcards', 'savestates'],
    pcsx2: ['memcards', 'sstates'],
    rpcs3: ['dev_hdd0\\home\\00000001\\savedata'],
    dolphin: ['User\\GC', 'User\\Wii'],
    ppsspp: ['memstick\\PSP\\SAVEDATA'],
    xemu: ['eeprom.bin'],
    mgba: ['saves'],
    desmume: ['Battery'],
    citra: ['user'],
    ryujinx: ['bis\\user'],
    retroarch: ['saves', 'states']
  }

  const subs = candidates[game.emulator]
  if (subs) {
    for (const sub of subs) {
      const full = join(emulatorInstallPath, sub)
      if (existsSync(full)) return { path: full, label: sub }
    }
  }

  // Fallback: try Documents/ for emulators that default to non-portable mode
  const docs = DOCUMENTS_FALLBACKS[game.emulator]
  if (docs) {
    const home = homedir()
    for (const rel of docs) {
      const full = join(home, rel)
      if (existsSync(full)) {
        return { path: full, label: rel.split('\\').slice(-2).join('/') }
      }
    }
  }
  return null
}

/**
 * Look up PC save location. First try the static catalog (exact normalized
 * title match), then walk a few common roots looking for a folder whose name
 * loosely matches the title.
 */
function resolvePcSaveLocation(game: Game): SaveLocation | null {
  const slug = normalizeTitle(game.title)
  const exact = PC_SAVE_CATALOG[slug]
  if (exact) {
    for (const tmpl of exact) {
      const full = expandPath(tmpl)
      if (full && existsSync(full)) {
        return { path: full, label: shortenLabel(full) }
      }
    }
  }
  // Fuzzy fallback: scan well-known roots for a directory whose normalized
  // name matches the game's slug. Cheap because we only look one level deep.
  const fuzzyTarget = slug.replace(/\s+/g, '')
  for (const rootTmpl of PC_FALLBACK_ROOTS) {
    const root = expandPath(rootTmpl)
    if (!root || !existsSync(root)) continue
    let entries: string[]
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }
    for (const name of entries) {
      const candidate = normalizeTitle(name).replace(/\s+/g, '')
      if (!candidate) continue
      if (candidate === fuzzyTarget || candidate.includes(fuzzyTarget) || fuzzyTarget.includes(candidate)) {
        const full = join(root, name)
        try {
          if (statSync(full).isDirectory()) {
            return { path: full, label: shortenLabel(full) }
          }
        } catch {
          // ignore unreadable entries
        }
      }
    }
  }
  return null
}

function shortenLabel(full: string): string {
  const parts = full.replace(/\//g, '\\').split('\\')
  return parts.slice(-2).join('/')
}

/** Recursively copy a directory tree. */
function copyTree(src: string, dst: string): { files: number; bytes: number } {
  mkdirSync(dst, { recursive: true })
  let files = 0
  let bytes = 0
  for (const entry of readdirSync(src)) {
    const s = join(src, entry)
    const d = join(dst, entry)
    let st
    try {
      st = statSync(s)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      const r = copyTree(s, d)
      files += r.files
      bytes += r.bytes
    } else {
      copyFileSync(s, d)
      files += 1
      bytes += st.size
    }
  }
  return { files, bytes }
}

/** Sum sizes of an existing snapshot directory. */
function measure(dir: string): { files: number; bytes: number } {
  let files = 0
  let bytes = 0
  function walk(d: string): void {
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(d, e)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(p)
      else {
        files++
        bytes += st.size
      }
    }
  }
  walk(dir)
  return { files, bytes }
}

function gameSavesRoot(gameId: string): string {
  return join(PATHS.saves, gameId)
}

export async function backupSave(gameId: string): Promise<SaveSnapshot | { error: string }> {
  const data = libraryStore.load()
  const game = data.games.find((g) => g.id === gameId)
  if (!game) return { error: 'Jogo não encontrado.' }
  const emu = data.emulators.find((e) => e.id === game.emulator)
  const loc = resolveSaveLocation(game, emu?.installPath)
  if (!loc) {
    return {
      error: `Não sei onde ${game.emulator ?? 'esse emulador'} guarda saves. Configure manualmente.`
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dst = join(gameSavesRoot(gameId), stamp)
  const { files, bytes } = copyTree(loc.path, dst)
  log.info('saves', `backup ${gameId}: ${files} files / ${bytes} bytes from ${loc.path}`)
  return {
    id: stamp,
    createdAt: new Date().toISOString(),
    sizeBytes: bytes,
    fileCount: files,
    sourcePath: loc.path
  }
}

export async function listBackups(gameId: string): Promise<SaveSnapshot[]> {
  const root = gameSavesRoot(gameId)
  if (!existsSync(root)) return []
  const out: SaveSnapshot[] = []
  for (const name of readdirSync(root)) {
    const full = join(root, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (!st.isDirectory()) continue
    const { files, bytes } = measure(full)
    out.push({
      id: name,
      createdAt: name.replace(/-/g, ':'), // approximate inverse
      sizeBytes: bytes,
      fileCount: files,
      sourcePath: full
    })
  }
  return out.sort((a, b) => (b.id > a.id ? 1 : -1))
}

export async function restoreSave(
  gameId: string,
  snapshotId: string
): Promise<{ ok: true } | { error: string }> {
  const data = libraryStore.load()
  const game = data.games.find((g) => g.id === gameId)
  if (!game) return { error: 'Jogo não encontrado.' }
  const emu = data.emulators.find((e) => e.id === game.emulator)
  const loc = resolveSaveLocation(game, emu?.installPath)
  if (!loc) return { error: 'Local de save desconhecido para este emulador.' }

  const src = join(gameSavesRoot(gameId), snapshotId)
  if (!existsSync(src)) return { error: 'Snapshot não encontrado.' }

  // Safety: take an auto-backup of the current state before overwriting.
  // No one wants their save destroyed by an accidental restore.
  const safety = join(gameSavesRoot(gameId), `auto-before-restore-${Date.now()}`)
  if (existsSync(loc.path)) {
    try {
      copyTree(loc.path, safety)
      log.info('saves', `safety snapshot taken at ${safety}`)
    } catch (err) {
      log.warn('saves', `failed to take safety snapshot: ${String(err)}`)
    }
  }

  // Replace destination contents with snapshot contents
  try {
    // Don't blow away the parent dir — only its children
    for (const entry of readdirSync(loc.path)) {
      rmSync(join(loc.path, entry), { recursive: true, force: true })
    }
    copyTree(src, loc.path)
    log.info('saves', `restored ${snapshotId} → ${loc.path}`)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('saves', `restore failed: ${msg}`)
    return { error: msg }
  }
}

export async function deleteBackup(
  gameId: string,
  snapshotId: string
): Promise<{ ok: true } | { error: string }> {
  const p = join(gameSavesRoot(gameId), snapshotId)
  if (!existsSync(p)) return { error: 'Snapshot não encontrado.' }
  try {
    rmSync(p, { recursive: true, force: true })
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** What we expose to the renderer so the UI can describe the save situation. */
export function describeSaveLocation(gameId: string): { available: boolean; path?: string; label?: string } {
  const data = libraryStore.load()
  const game = data.games.find((g) => g.id === gameId)
  if (!game) return { available: false }
  const emu = data.emulators.find((e) => e.id === game.emulator)
  const loc = resolveSaveLocation(game, emu?.installPath)
  if (!loc) return { available: false }
  return { available: true, path: loc.path, label: loc.label }
}

/**
 * Boot-time diagnostic: log the save location resolution for every game in the
 * library. Costs almost nothing (just `existsSync` per candidate) and makes
 * misconfigured emulator paths obvious without needing UI interaction.
 */
export function probeSaveLocations(): void {
  const data = libraryStore.load()
  if (data.games.length === 0) return
  let ok = 0
  let miss = 0
  for (const g of data.games) {
    const emu = data.emulators.find((e) => e.id === g.emulator)
    const loc = resolveSaveLocation(g, emu?.installPath)
    if (loc) ok++
    else miss++
  }
  log.info('saves', `save-location probe: ${ok} resolved, ${miss} unknown`)
}

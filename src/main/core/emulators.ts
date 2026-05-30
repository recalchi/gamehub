import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { EMULATORS, EMULATOR_LIST } from '@shared/emulators'
import { log } from './logger'
import { settingsStore } from './store'
import type { DetectedEmulator, EmulatorId } from '@shared/types'
import type { LaunchArgOptions } from '@shared/emulators'

const MAX_DEPTH = 3

export interface EmulatorDetection {
  /** the canonical pick per emulator id — what the launcher uses */
  emulators: DetectedEmulator[]
  /** every install path discovered, including duplicates like rpcs3_old — used
   * by the game scanner to skip emulator subtrees entirely */
  installPaths: string[]
}

/**
 * Walk the configured emulator roots looking for known emulator executables.
 * Then merge with any manual overrides from settings.
 *
 * We track **every** install path we observe (not only the canonical one per
 * emulator id), so the game scanner can skip them all. Otherwise an emulator
 * shipped with a backup copy (e.g. `rpcs3/rpcs3_old/`) would only get one of
 * the two paths into the skip set and the scanner would crawl through the
 * other's huge bundled tree (dev_hdd0/, qt6/, etc).
 */
export async function detectEmulators(roots: string[], errors: string[]): Promise<EmulatorDetection> {
  const settings = settingsStore.load()
  const found = new Map<EmulatorId, DetectedEmulator>()
  const installPaths: string[] = []

  // 1. Manual overrides take precedence
  for (const [id, exePath] of Object.entries(settings.emulatorOverrides) as Array<[EmulatorId, string]>) {
    if (!exePath || !existsSync(exePath)) continue
    const def = EMULATORS[id]
    if (!def) continue
    const installPath = exePath.substring(0, exePath.lastIndexOf('\\'))
    found.set(id, {
      id,
      name: def.name,
      executable: exePath,
      installPath,
      platforms: def.platforms,
      source: 'manual'
    })
    installPaths.push(installPath)
  }

  // 2. Scan filesystem roots
  for (const root of roots) {
    try {
      walk(root, 0, found, installPaths)
    } catch (err) {
      const msg = `failed to scan emulator root ${root}: ${String(err)}`
      errors.push(msg)
      log.error('emulators', msg)
    }
  }

  return { emulators: Array.from(found.values()), installPaths }
}

function walk(
  dir: string,
  depth: number,
  out: Map<EmulatorId, DetectedEmulator>,
  installPaths: string[]
): void {
  if (depth > MAX_DEPTH) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walk(full, depth + 1, out, installPaths)
      continue
    }
    // It's a file — check if its name matches a known emulator exe
    const filename = entry.toLowerCase()
    for (const def of EMULATOR_LIST) {
      if (def.executables.includes(filename)) {
        installPaths.push(dir)
        if (out.has(def.id) && out.get(def.id)!.source === 'manual') continue
        out.set(def.id, {
          id: def.id,
          name: def.name,
          executable: full,
          installPath: dir,
          platforms: def.platforms,
          source: 'auto'
        })
        log.info('emulators', `found ${def.name} at ${full}`)
        break
      }
    }
  }
}

export function findExecutableForGame(
  emulators: DetectedEmulator[],
  emulatorId?: EmulatorId
): DetectedEmulator | undefined {
  if (!emulatorId) return undefined
  return emulators.find((e) => e.id === emulatorId)
}

/** Build the absolute argv for launching a game via its emulator. */
export function buildLaunchArgs(
  emulatorId: EmulatorId,
  gamePath: string,
  options: LaunchArgOptions = { fullscreen: true }
): string[] {
  const def = EMULATORS[emulatorId]
  if (!def?.buildArgs) return [gamePath]
  return def.buildArgs(gamePath, options)
}

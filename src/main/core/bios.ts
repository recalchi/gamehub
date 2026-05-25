import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { log } from './logger'
import type { BiosCheck, DetectedEmulator, EmulatorId } from '@shared/types'

interface BiosSpec {
  /** does this emulator need BIOS to launch commercial games? */
  required: boolean
  /** paths relative to install dir OR `~/<rel>` for Documents-style installs */
  searchPaths: Array<{ rel: string; relativeTo: 'install' | 'home' }>
  /** regex patterns matching valid BIOS filenames (case-insensitive) */
  patterns: RegExp[]
  /** user-facing example filenames */
  expected: string[]
  /** if true, finding any non-empty content in `searchPaths` counts as "found"
   * (used for firmware-style emulators like RPCS3 with hundreds of files) */
  acceptAnyPopulatedFolder?: boolean
  /** minimum file size in bytes to treat as a real BIOS (filter erase.me etc.) */
  minBytes?: number
}

const SPECS: Partial<Record<EmulatorId, BiosSpec>> = {
  epsxe: {
    required: true,
    searchPaths: [{ rel: 'bios', relativeTo: 'install' }],
    patterns: [/^scph\d+.*\.bin$/i, /^ps[x1].*\.bin$/i],
    expected: ['SCPH1001.BIN', 'scph7502.bin', 'scph5500.bin'],
    minBytes: 100_000
  },
  psxfin: {
    required: true,
    searchPaths: [{ rel: 'bios', relativeTo: 'install' }],
    patterns: [/^scph\d+.*\.bin$/i],
    expected: ['SCPH1001.BIN'],
    minBytes: 100_000
  },
  duckstation: {
    required: true,
    searchPaths: [
      { rel: 'bios', relativeTo: 'install' },
      { rel: 'Documents\\DuckStation\\bios', relativeTo: 'home' }
    ],
    patterns: [/^scph\d+.*\.bin$/i, /^ps[x1].*\.bin$/i],
    expected: ['scph1001.bin', 'ps-30j.bin'],
    minBytes: 100_000
  },
  pcsx2: {
    required: true,
    searchPaths: [
      { rel: 'bios', relativeTo: 'install' },
      { rel: 'Documents\\PCSX2\\bios', relativeTo: 'home' }
    ],
    patterns: [/^scph\d+.*\.bin$/i, /^ps2.*\.bin$/i],
    expected: ['scph10000.bin', 'scph77001.bin', 'scph39001.bin'],
    minBytes: 1_000_000
  },
  rpcs3: {
    required: true,
    searchPaths: [{ rel: 'dev_flash', relativeTo: 'install' }],
    patterns: [],
    expected: ['Install firmware (PS3UPDAT.PUP) via RPCS3 first run'],
    acceptAnyPopulatedFolder: true
  },
  xemu: {
    required: true,
    searchPaths: [{ rel: '', relativeTo: 'install' }],
    patterns: [/^mcpx.*\.bin$/i, /^xbox.*\.bios$/i, /^complex.*\.bin$/i],
    expected: ['mcpx_1.0.bin', 'xboxhd.bios'],
    minBytes: 1024
  },
  dolphin: { required: false, searchPaths: [], patterns: [], expected: [] },
  ppsspp: { required: false, searchPaths: [], patterns: [], expected: [] },
  mgba: { required: false, searchPaths: [], patterns: [], expected: [] },
  desmume: { required: false, searchPaths: [], patterns: [], expected: [] },
  retroarch: { required: false, searchPaths: [], patterns: [], expected: [] },
  native: { required: false, searchPaths: [], patterns: [], expected: [] }
}

/**
 * Check whether the given emulator has its BIOS in place.
 * Returns `required: false` for HLE emulators that don't need BIOS at all
 * (Dolphin/Wii, PPSSPP, etc.) so the UI can show a green "ready" state.
 */
export function checkBios(emulator: DetectedEmulator | undefined): BiosCheck {
  if (!emulator) {
    return { required: true, found: false, expected: [], triedLocations: [] }
  }
  const spec = SPECS[emulator.id]
  if (!spec) {
    return { required: false, found: true, expected: [], triedLocations: [] }
  }
  if (!spec.required) {
    return { required: false, found: true, expected: [], triedLocations: [] }
  }

  const tried: string[] = []
  const home = homedir()
  for (const sp of spec.searchPaths) {
    const base = sp.relativeTo === 'install' ? emulator.installPath : home
    const full = sp.rel ? join(base, sp.rel) : base
    tried.push(full)
    if (!existsSync(full)) continue

    // Firmware-folder style (RPCS3 dev_flash)
    if (spec.acceptAnyPopulatedFolder) {
      try {
        const populated = readdirSync(full).length > 0
        if (populated) {
          return {
            required: true,
            found: true,
            matchedPath: full,
            searchLocation: sp.rel,
            expected: spec.expected,
            triedLocations: tried
          }
        }
      } catch {
        /* unreadable, treat as missing */
      }
      continue
    }

    // File-pattern style
    let entries: string[]
    try {
      entries = readdirSync(full)
    } catch {
      continue
    }
    for (const e of entries) {
      const f = join(full, e)
      let st
      try {
        st = statSync(f)
      } catch {
        continue
      }
      if (!st.isFile()) continue
      if (spec.minBytes && st.size < spec.minBytes) continue
      if (spec.patterns.some((p) => p.test(e))) {
        return {
          required: true,
          found: true,
          matchedPath: f,
          searchLocation: sp.rel,
          expected: spec.expected,
          triedLocations: tried
        }
      }
    }
  }

  return { required: true, found: false, expected: spec.expected, triedLocations: tried }
}

/**
 * Recompute the status of every game based on current BIOS availability.
 * Called after the scan finishes — if BIOS is in place, "missing-bios" flips
 * to "ready"; otherwise we keep the old status as-is.
 */
export function reconcileBiosStatus(
  games: import('@shared/types').Game[],
  emulators: DetectedEmulator[]
): { promoted: number; stillMissing: number } {
  let promoted = 0
  let stillMissing = 0
  for (const g of games) {
    if (g.status !== 'missing-bios') continue
    const emu = emulators.find((e) => e.id === g.emulator)
    const bios = checkBios(emu)
    if (bios.found) {
      g.status = 'ready'
      promoted++
    } else {
      stillMissing++
    }
  }
  log.info('bios', `reconciled: ${promoted} promoted to ready, ${stillMissing} still missing BIOS`)
  return { promoted, stillMissing }
}

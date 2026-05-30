import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import { log } from './logger'
import { libraryStore } from './store'
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
    expected: [
      'Coloque PS3UPDAT.PUP em <RPCS3>/bios/ e use "Instalar firmware PS3" no painel ao lado.'
    ],
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
  mesen: { required: false, searchPaths: [], patterns: [], expected: [] },
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

interface BiosCandidate {
  /** Absolute path to the file */
  path: string
  /** File basename */
  filename: string
  /** Source file size in bytes — used to differentiate PS1 (≈500KB) vs PS2 (4MB) */
  size: number
  /** Human label of where we found it ("ePSXe", "Downloads", etc.) */
  origin: string
}

/**
 * Walk a list of search roots looking for files that look like emulator BIOS.
 * Bounded by `maxDepth` to keep this cheap — we don't want to crawl the whole
 * disk. Any file matching ANY emulator's pattern + min-size is a candidate;
 * the caller filters per-target.
 *
 * This catches BIOS the user dumped to their Downloads folder, or to a games
 * root, or somewhere weird — not just inside emulator install dirs.
 */
export function discoverExternalBiosFiles(
  searchRoots: string[],
  maxDepth = 3
): BiosCandidate[] {
  const allPatterns = new Set<RegExp>()
  let minSize = Infinity
  for (const spec of Object.values(SPECS)) {
    if (!spec?.required || spec.acceptAnyPopulatedFolder) continue
    for (const p of spec.patterns) allPatterns.add(p)
    if (spec.minBytes) minSize = Math.min(minSize, spec.minBytes)
  }
  if (minSize === Infinity) minSize = 0

  const seen = new Set<string>()
  const out: BiosCandidate[] = []

  function walk(dir: string, depth: number, originLabel: string): void {
    if (depth > maxDepth) return
    const key = dir.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
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
        // Skip emulator-internal dirs we don't care about (cache, shaders, etc).
        const lower = entry.toLowerCase()
        if (lower === 'node_modules' || lower === '.git') continue
        walk(full, depth + 1, originLabel)
        continue
      }
      if (st.size < minSize) continue
      // Fast skip — only files in the ballpark for a BIOS dump
      if (st.size > 64 * 1024 * 1024) continue
      const matches = Array.from(allPatterns).some((p) => p.test(entry))
      if (!matches) continue
      out.push({ path: full, filename: entry, size: st.size, origin: originLabel })
    }
  }

  for (const root of searchRoots) {
    if (!existsSync(root)) continue
    try {
      const label = basename(root) || root
      walk(root, 0, label)
    } catch (err) {
      log.warn('bios', `discover walk failed at ${root}: ${String(err)}`)
    }
  }

  return out
}

/**
 * Auto-share BIOS files between compatible emulators.
 *
 * Sources of BIOS we consider:
 *   1. Other detected emulators' BIOS dirs (the trivial case — ePSXe has a
 *      PS1 BIOS, DuckStation needs one, copy it).
 *   2. Externally discovered files passed via `extra` — the scanner does a
 *      shallow walk of game roots / Documents / Downloads to find BIOS the
 *      user has lying around outside emulator folders.
 *
 * Patterns + min-size guards prevent cross-platform copies (a 500KB PS1 BIOS
 * won't get copied as a PS2 BIOS, etc).
 */
export function shareBiosAcrossEmulators(
  emulators: DetectedEmulator[],
  extra: BiosCandidate[] = []
): {
  shared: number
  details: string[]
} {
  let shared = 0
  const details: string[] = []

  // Collect every available candidate up front so each target sees them all.
  const allCandidates: BiosCandidate[] = [...extra]
  for (const source of emulators) {
    const r = checkBios(source)
    if (!r.found || !r.matchedPath) continue
    let size: number
    try {
      size = statSync(r.matchedPath).size
    } catch {
      continue
    }
    allCandidates.push({
      path: r.matchedPath,
      filename: basename(r.matchedPath),
      size,
      origin: source.name
    })
  }

  for (const target of emulators) {
    const spec = SPECS[target.id]
    if (!spec?.required || spec.acceptAnyPopulatedFolder) continue
    if (checkBios(target).found) continue
    const targetDir = spec.searchPaths[0]
    if (!targetDir) continue

    for (const cand of allCandidates) {
      // The candidate file must be valid for the TARGET's BIOS spec —
      // size threshold filters out PS1 BIOS (≈500KB) when target needs
      // PS2 (4MB+), and the pattern check guards against name mismatches.
      if (spec.minBytes && cand.size < spec.minBytes) continue
      if (!spec.patterns.some((p) => p.test(cand.filename))) continue

      const destDir =
        targetDir.relativeTo === 'install'
          ? join(target.installPath, targetDir.rel)
          : join(homedir(), targetDir.rel)
      const destFile = join(destDir, cand.filename)

      // Don't copy onto itself
      if (destFile.toLowerCase() === cand.path.toLowerCase()) continue

      try {
        mkdirSync(destDir, { recursive: true })
        copyFileSync(cand.path, destFile)
        log.info(
          'bios',
          `shared BIOS ${cand.filename} (${cand.size} bytes) from ${cand.origin} → ${target.name}`
        )
        details.push(`${cand.filename}: ${cand.origin} → ${target.name}`)
        shared++
        break
      } catch (err) {
        log.warn('bios', `failed to share BIOS to ${target.name}: ${String(err)}`)
      }
    }
  }
  return { shared, details }
}

/**
 * Copy a user-picked BIOS file into the canonical location for an emulator.
 *
 * Validates that the file actually matches the emulator's pattern + minimum
 * size before copying — we don't want to drop a random JPEG in the BIOS
 * folder because the user picked the wrong file. Returns the destination
 * path on success.
 */
export function installBiosFile(
  emulator: DetectedEmulator,
  sourcePath: string
): { ok: true; destination: string } | { error: string } {
  const spec = SPECS[emulator.id]
  if (!spec?.required) return { error: 'Este emulador não precisa de BIOS.' }
  if (!existsSync(sourcePath)) return { error: 'Arquivo não encontrado.' }

  const filename = basename(sourcePath)
  let size: number
  try {
    size = statSync(sourcePath).size
  } catch (err) {
    return { error: `Não consegui ler o arquivo: ${String(err)}` }
  }
  if (spec.minBytes && size < spec.minBytes) {
    return {
      error: `Arquivo pequeno demais (${size} bytes) — BIOS válida tem pelo menos ${spec.minBytes} bytes.`
    }
  }
  if (spec.patterns.length > 0 && !spec.patterns.some((p) => p.test(filename))) {
    return {
      error: `Nome ${filename} não parece BIOS deste emulador. Esperado: ${spec.expected.join(', ')}.`
    }
  }

  const targetDir = spec.searchPaths[0]
  if (!targetDir) return { error: 'Emulador sem caminho de BIOS configurado.' }
  const destDir =
    targetDir.relativeTo === 'install'
      ? join(emulator.installPath, targetDir.rel)
      : join(homedir(), targetDir.rel)
  const destFile = join(destDir, filename)

  try {
    mkdirSync(destDir, { recursive: true })
    copyFileSync(sourcePath, destFile)
    log.info('bios', `installed BIOS ${filename} from ${sourcePath} → ${destFile}`)
    return { ok: true, destination: destFile }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('bios', `installBiosFile failed: ${msg}`)
    return { error: msg }
  }
}

/**
 * Find a PS3 firmware PUP file the user has dropped somewhere reachable.
 * Looks in <rpcs3>/bios/ first, then the user's Downloads.
 */
export function findPs3Firmware(rpcs3: DetectedEmulator): string | null {
  const candidates = [
    join(rpcs3.installPath, 'bios'),
    join(rpcs3.installPath, 'firmware'),
    join(homedir(), 'Downloads')
  ]
  for (const dir of candidates) {
    if (!existsSync(dir)) continue
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const e of entries) {
      if (!/\.pup$/i.test(e)) continue
      const full = join(dir, e)
      try {
        const st = statSync(full)
        if (st.isFile() && st.size > 100_000_000) return full
      } catch {
        /* ignore */
      }
    }
  }
  return null
}

/**
 * Install PS3 firmware by spawning RPCS3 with the PUP path. RPCS3 detects PUP
 * files passed on the CLI and triggers its firmware installer dialog.
 * Returns a promise that resolves when the installer dialog closes.
 */
export async function installPs3Firmware(): Promise<{ ok: true; pup: string } | { error: string }> {
  const data = libraryStore.load()
  const rpcs3 = data.emulators.find((e) => e.id === 'rpcs3')
  if (!rpcs3) return { error: 'RPCS3 não encontrado. Instale o emulador primeiro.' }
  const pup = findPs3Firmware(rpcs3)
  if (!pup) {
    return {
      error:
        'PS3UPDAT.PUP não encontrado. Baixe o firmware oficial em playstation.com/pt-br/support/hardware/ps3/system-software/ e coloque em ' +
        join(rpcs3.installPath, 'bios')
    }
  }
  log.info('bios', `installing PS3 firmware from ${pup} via ${rpcs3.executable}`)
  try {
    const child = spawn(rpcs3.executable, [pup], {
      cwd: rpcs3.installPath,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, QT_QPA_PLATFORM_PLUGIN_PATH: rpcs3.installPath }
    })
    child.unref()
    return { ok: true, pup }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('bios', `installPs3Firmware spawn failed: ${msg}`)
    return { error: msg }
  }
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

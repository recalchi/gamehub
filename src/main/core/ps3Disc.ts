import { execFile } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { log } from './logger'

const exec = promisify(execFile)

/**
 * PS3 ISO loader for RPCS3.
 *
 * RPCS3 expects a PS3 disc as an *extracted* `PS3_GAME/USRDIR/EBOOT.BIN`
 * folder tree — not a raw .iso. The pragmatic shortcut on Windows is to
 * mount the ISO as a virtual drive (`Mount-DiskImage`), find the PS3_GAME
 * folder on the mounted volume, and pass that path to RPCS3.
 *
 * This only works for *decrypted* dumps — the 3K3y / PS3ISO / redump-decrypted
 * format that has a readable PS3_GAME folder when mounted. Encrypted disc
 * dumps need IRD keys + offline decryption tooling that we don't ship.
 * We detect "no PS3_GAME on the mounted drive" and surface a helpful error
 * pointing the user at PS3 Dec / managunz so they know what to do next.
 */

interface MountResult {
  driveLetter: string
  ps3GamePath: string
}

const mounted = new Map<string, string>()

async function powershell(script: string): Promise<string> {
  const { stdout } = await exec(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
  )
  return stdout.trim()
}

/**
 * Mount the ISO and return the EBOOT.BIN path RPCS3 should boot.
 *
 * RPCS3 has three valid arguments — disc root (folder containing PS3_GAME),
 * the PS3_GAME folder itself, or the EBOOT.BIN. Empirically PS3_GAME alone
 * triggers a "Game install failed" because RPCS3 reads it as an install
 * source. Disc root works for some titles but not all (depends on PARAM.SFO
 * placement). EBOOT.BIN is the unambiguous winner — RPCS3 always treats it
 * as "boot this binary directly", so we resolve to that.
 *
 * Idempotent — if we already mounted this ISO during this session we re-use
 * the drive letter without re-mounting.
 */
export async function mountPs3Iso(
  isoPath: string
): Promise<{ ok: true; bootPath: string; driveLetter: string } | { error: string }> {
  if (!existsSync(isoPath)) return { error: `ISO não encontrado: ${isoPath}` }

  // Already mounted in this session?
  const cached = mounted.get(isoPath.toLowerCase())
  if (cached && existsSync(cached)) {
    const boot = resolveBootPath(cached)
    if (boot) return { ok: true, bootPath: boot, driveLetter: cached.slice(0, 2) }
    mounted.delete(isoPath.toLowerCase())
  }

  log.info('ps3disc', `mounting ${isoPath}`)
  // Mount-DiskImage + Get-Volume gives us the drive letter Windows assigned.
  // Escape the path for PowerShell single-quote literals.
  const psPath = isoPath.replace(/'/g, "''")
  const script = `$img = Mount-DiskImage -ImagePath '${psPath}' -PassThru -ErrorAction Stop; Start-Sleep -Milliseconds 600; $v = Get-Volume -DiskImage $img; if ($v -and $v.DriveLetter) { Write-Output ($v.DriveLetter + ':') } else { throw 'sem drive letter atribuído' }`

  let driveLetter: string
  try {
    const out = await powershell(script)
    driveLetter = out.trim().split(/\r?\n/).pop() ?? ''
    if (!/^[A-Z]:$/i.test(driveLetter)) {
      return { error: `Mount retornou letra inesperada: "${out}"` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('ps3disc', `mount failed: ${msg}`)
    return {
      error: `Falha ao montar ISO. Talvez já esteja montado em outro lugar, ou seja uma ISO encriptada. (${msg.slice(0, 200)})`
    }
  }

  const driveRoot = driveLetter + '\\'
  const bootPath = resolveBootPath(driveRoot)
  if (!bootPath) {
    await unmountPs3Iso(isoPath).catch(() => {})
    return {
      error:
        'Drive montou mas EBOOT.BIN não foi encontrado em PS3_GAME/USRDIR/. ' +
        'Provavelmente é uma ISO encriptada (precisa de chave IRD). ' +
        'Use PS3 Dec (https://github.com/Redrrx/ps3dec) ou managunz para decriptar antes.'
    }
  }

  mounted.set(isoPath.toLowerCase(), driveRoot)
  log.info('ps3disc', `mounted ${isoPath} at ${driveLetter}, boot = ${bootPath}`)
  return { ok: true, bootPath, driveLetter }
}

/**
 * Find the EBOOT.BIN under a disc root. Standard layout is
 * <root>/PS3_GAME/USRDIR/EBOOT.BIN, but some repacks store it directly at
 * <root>/PS3_GAME/EBOOT.BIN or skip the PS3_GAME wrapper entirely.
 */
function resolveBootPath(discRoot: string): string | null {
  const candidates = [
    join(discRoot, 'PS3_GAME', 'USRDIR', 'EBOOT.BIN'),
    join(discRoot, 'PS3_GAME', 'EBOOT.BIN'),
    join(discRoot, 'USRDIR', 'EBOOT.BIN'),
    join(discRoot, 'EBOOT.BIN')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  // PS3_GAME may exist but EBOOT.BIN missing — still treat as decrypted disc
  // and let RPCS3 sort it out (we fall back to the disc root path).
  const ps3Game = join(discRoot, 'PS3_GAME')
  if (existsSync(ps3Game)) return discRoot
  return null
}

export async function unmountPs3Iso(isoPath: string): Promise<void> {
  mounted.delete(isoPath.toLowerCase())
  const psPath = isoPath.replace(/'/g, "''")
  try {
    await powershell(`Dismount-DiskImage -ImagePath '${psPath}' -ErrorAction Stop | Out-Null`)
    log.info('ps3disc', `unmounted ${isoPath}`)
  } catch (err) {
    log.warn('ps3disc', `unmount failed for ${isoPath}: ${String(err)}`)
  }
}

/**
 * Best-effort check: does the ISO look like a PS3 decrypted dump?
 * Used by the UI to surface "this won't play, run PS3 Dec first" upfront
 * instead of waiting for the mount to fail.
 *
 * We don't actually parse the disc format — the cheap check is "is it
 * suspiciously around the size of a BD25/BD50 dump?". Encrypted vs decrypted
 * isn't distinguishable from size alone; the real verdict comes from the
 * mount attempt. So this is a soft warning only.
 */
export function isLikelyPs3DiscIso(isoPath: string): boolean {
  try {
    const st = statSync(isoPath)
    // BD25 = 25GB single layer; BD50 = 50GB dual. Most PS3 dumps are 6-25GB.
    return st.isFile() && st.size > 1_000_000_000
  } catch {
    return false
  }
}

/** Drop all mounts we created during this session (e.g. on app quit). */
export async function unmountAll(): Promise<void> {
  const paths = Array.from(mounted.keys())
  for (const p of paths) {
    await unmountPs3Iso(p).catch(() => {})
  }
}

/** Sniff a folder for the PS3_GAME directory (handles directly-extracted dumps). */
export function findPs3GameFolder(rootPath: string): string | null {
  if (!existsSync(rootPath)) return null
  let st
  try {
    st = statSync(rootPath)
  } catch {
    return null
  }
  if (st.isDirectory()) {
    try {
      const children = readdirSync(rootPath)
      if (children.some((c) => c.toUpperCase() === 'PS3_GAME')) return rootPath
      // One level down: parent folder containing extracted-disc dir
      for (const c of children) {
        const sub = join(rootPath, c)
        try {
          if (
            statSync(sub).isDirectory() &&
            readdirSync(sub).some((cc) => cc.toUpperCase() === 'PS3_GAME')
          ) {
            return sub
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* unreadable */
    }
  }
  return null
}

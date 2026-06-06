/**
 * PresentMon-backed FPS reader.
 *
 * Why this exists: RTSS hooks fail for games protected by anti-cheat (EAC,
 * BattlEye, etc.). PresentMon uses ETW (Event Tracing for Windows) at the
 * kernel level — it sees every D3D `Present` call regardless of injection,
 * so it works for Elden Ring, Fortnite, Helldivers 2, anything EAC.
 *
 * Trade-off: PresentMon requires admin to start an ETW session. We spawn it
 * via `Start-Process -Verb RunAs` once per game launch; subsequent reads are
 * free.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { log } from './logger'

/**
 * Are we running with elevated (admin) token?
 *
 * Use `net session` which only admins can execute. Returns true on exit 0,
 * false otherwise. Cached after first call since IL doesn't change for the
 * lifetime of the process.
 */
let isAdminCache: boolean | null = null
export function isProcessElevated(): boolean {
  if (process.platform !== 'win32') return false
  if (isAdminCache !== null) return isAdminCache
  try {
    const r = spawnSync('net.exe', ['session'], { windowsHide: true, timeout: 3000 })
    isAdminCache = r.status === 0
  } catch {
    isAdminCache = false
  }
  return isAdminCache
}

let presentmonBinary: string | null = null

function resolvePresentMonBinary(): string | null {
  if (presentmonBinary && existsSync(presentmonBinary)) return presentmonBinary
  // In production (packaged): process.resourcesPath/tools/PresentMon.exe
  // In dev: build/tools/PresentMon.exe
  const candidates = [
    join(process.resourcesPath ?? '', 'tools', 'PresentMon.exe'),
    join(app.getAppPath(), '..', 'tools', 'PresentMon.exe'),
    join(process.cwd(), 'build', 'tools', 'PresentMon.exe')
  ]
  for (const c of candidates) {
    if (existsSync(c)) {
      presentmonBinary = c
      log.info('presentmon', `using binary at ${c}`)
      return c
    }
  }
  log.warn('presentmon', 'PresentMon.exe not found in any known location')
  return null
}

/** Last observed FPS per PID, with timestamp for staleness. */
const fpsCache = new Map<number, { fps: number; at: number }>()
const trackedSessions = new Map<number, ChildProcess>()

const STALE_MS = 4000

/** Returns the most recently observed FPS for a PID, or undefined if stale. */
export function fpsFromPresentMon(pid: number): number | undefined {
  const e = fpsCache.get(pid)
  if (!e) return undefined
  if (Date.now() - e.at > STALE_MS) return undefined
  return e.fps
}

/**
 * Start a PresentMon ETW session targeting a single PID. Idempotent — calling
 * twice with the same PID is a no-op.
 *
 * Requires admin. Returns true if PresentMon spawned (we don't wait for
 * actual data — that comes asynchronously through the parser).
 */
export async function startPresentMonForPid(pid: number, processName?: string): Promise<boolean> {
  if (process.platform !== 'win32') return false
  if (trackedSessions.has(pid)) return true
  const bin = resolvePresentMonBinary()
  if (!bin) return false

  // PresentMon writes to its CSV file with EXCLUSIVE access — no other
  // process can read it while PresentMon is alive. So we can't use the
  // file-tail approach unless we own the file descriptor.
  //
  // Solution: use `-output_stdout` and capture PresentMon's stdout directly.
  // That requires GameHub itself to be admin (ETW needs admin, and we need
  // direct stdio with the child). If GameHub isn't elevated, we surface that
  // through the UI and the user clicks the existing "Reiniciar como admin"
  // button — once relaunched, this path works without any UAC per game.
  if (!isProcessElevated()) {
    log.warn(
      'presentmon',
      `not elevated — cannot spawn PresentMon for pid=${pid}. UI will prompt for relaunch.`
    )
    return false
  }

  try {
    log.info('presentmon', `spawning child for pid=${pid} (${processName ?? '?'})`)
    const sessionName = `GameHub-${pid}`
    // Pre-clean: terminate any stale ETW session with the same name. This
    // matters when the previous GameHub instance crashed without cleanup —
    // PresentMon refuses to start if a same-named session is alive.
    const cleanup = spawnSync('logman.exe', ['stop', sessionName, '-ets'], {
      windowsHide: true,
      timeout: 3000
    })
    if (cleanup.status === 0) {
      log.info('presentmon', `cleaned stale session ${sessionName}`)
    }
    const pmChild = spawn(
      bin,
      [
        '-process_id', String(pid),
        '-output_stdout',
        '-no_top',
        '-stop_existing_session',
        '-session_name', sessionName,
        '-terminate_on_proc_exit'
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    trackedSessions.set(pid, pmChild)
    pmChild.stderr?.on('data', (chunk) => {
      log.debug?.('presentmon', `[stderr] ${String(chunk).trim().slice(0, 200)}`)
    })
    pmChild.on('exit', (code) => {
      log.info('presentmon', `pm exit pid=${pid} code=${code}`)
      trackedSessions.delete(pid)
      fpsCache.delete(pid)
    })
    pmChild.on('error', (err) => {
      log.warn('presentmon', `pm error pid=${pid}: ${err.message}`)
    })
    void consumePresentMonStdout(pid, pmChild)
    return true
  } catch (err) {
    log.warn('presentmon', `spawn failed: ${String(err)}`)
    return false
  }
}

/**
 * Stream PresentMon stdout line-by-line, parse frame intervals, push into
 * the FPS cache.
 */
async function consumePresentMonStdout(pid: number, proc: ChildProcess): Promise<void> {
  if (!proc.stdout) return
  const buffer: number[] = []
  let leftover = ''
  proc.stdout.on('data', (chunk) => {
    const text = leftover + String(chunk)
    const lines = text.split(/\r?\n/)
    leftover = lines.pop() ?? ''
    for (const line of lines) {
      if (!line) continue
      if (/^application/i.test(line)) continue
      const cols = line.split(',')
      if (cols.length < 10) continue
      const msBetween = Number(cols[9])
      if (Number.isFinite(msBetween) && msBetween > 0 && msBetween < 1000) {
        buffer.push(msBetween)
        if (buffer.length > 120) buffer.shift()
        if (buffer.length >= 5) {
          const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length
          fpsCache.set(pid, { fps: 1000 / avg, at: Date.now() })
        }
      }
    }
  })
}

export function stopPresentMonForPid(pid: number): void {
  const proc = trackedSessions.get(pid)
  if (proc) {
    try { proc.kill() } catch { /* ignore */ }
    trackedSessions.delete(pid)
  }
  fpsCache.delete(pid)
}

/**
 * Lightweight CSV tailer. PresentMon 1.10 CSV columns (verified by running
 * the bundled binary against DWM):
 *   0  Application
 *   1  ProcessID
 *   2  SwapChainAddress
 *   3  Runtime
 *   4  SyncInterval
 *   5  PresentFlags
 *   6  Dropped
 *   7  TimeInSeconds
 *   8  msInPresentAPI
 *   9  msBetweenPresents    ← what we need: frame interval in ms
 *  10  AllowsTearing
 *  11  PresentMode
 *  12  msUntilRenderComplete
 *  13  msUntilDisplayed
 *  14  msBetweenDisplayChange
 *
 * FPS = 1000 / avg(msBetweenPresents) over the most recent samples.
 *
 * The earlier code read column 11 (PresentMode, a string) and silently
 * discarded every sample as NaN — which is why no FPS ever showed up.
 */
async function tailPresentMonCsv(pid: number, file: string): Promise<void> {
  const fs = await import('node:fs')
  let lastSize = 0
  const buffer: number[] = []
  const interval = setInterval(() => {
    if (!trackedSessions.has(pid)) {
      clearInterval(interval)
      return
    }
    let stat
    try { stat = fs.statSync(file) } catch { return }
    if (stat.size <= lastSize) return
    const fd = fs.openSync(file, 'r')
    try {
      const len = stat.size - lastSize
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, lastSize)
      lastSize = stat.size
      const text = buf.toString('utf8')
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue
        // Skip header (case-insensitive, matches any leading "Application" col)
        if (/^application/i.test(line)) continue
        const cols = line.split(',')
        if (cols.length < 10) continue
        const msBetween = Number(cols[9])
        if (Number.isFinite(msBetween) && msBetween > 0 && msBetween < 1000) {
          buffer.push(msBetween)
        }
      }
      // Keep last ~60 samples (≈1s at 60 FPS)
      while (buffer.length > 60) buffer.shift()
      if (buffer.length >= 5) {
        const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length
        const fps = 1000 / avg
        fpsCache.set(pid, { fps, at: Date.now() })
      }
    } finally {
      fs.closeSync(fd)
    }
  }, 1000)
}

/** Status for the UI banner: are we admin? is PM available? */
export function presentMonStatus(): { elevated: boolean; available: boolean; activeSessions: number } {
  return {
    elevated: isProcessElevated(),
    available: resolvePresentMonBinary() !== null,
    activeSessions: trackedSessions.size
  }
}

export function shutdownAllPresentMon(): void {
  for (const pid of Array.from(trackedSessions.keys())) {
    stopPresentMonForPid(pid)
  }
}

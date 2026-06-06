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
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { log } from './logger'

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

  // PresentMon 1.10 flags use a SINGLE dash (not double). Wrong dashes were
  // the silent failure that kept FPS at "--" the whole previous attempt.
  //   -process_id PID         scope to one process
  //   -output_file PATH       write CSV to a file we can tail
  //   -no_top                 don't draw the top-of-frame summary
  //   -stop_existing_session  if ETW session named "PresentMon" exists, take it over
  //   -session_name           unique per PID so multiple games can be tracked
  try {
    log.info('presentmon', `spawning for pid=${pid} (${processName ?? '?'})`)
    // PresentMon needs admin for ETW. Use Start-Process -Verb RunAs.
    // We can't get stdout from an elevated child via PowerShell trivially,
    // so we redirect to a temp file and tail it.
    const { tmpdir } = await import('node:os')
    const { unlinkSync, openSync, closeSync } = await import('node:fs')
    const outFile = join(tmpdir(), `gh-presentmon-${pid}.csv`)
    try { unlinkSync(outFile) } catch { /* not present */ }
    try { closeSync(openSync(outFile, 'w')) } catch { /* ignore */ }
    const sessionName = `GameHub-${pid}`
    const ps = spawn(
      'powershell.exe',
      [
        '-NoProfile', '-NonInteractive', '-Command',
        `Start-Process -FilePath '${bin.replace(/'/g, "''")}' ` +
        `-ArgumentList '-process_id','${pid}','-output_file','${outFile.replace(/'/g, "''")}','-no_top','-stop_existing_session','-session_name','${sessionName}' ` +
        `-Verb RunAs -WindowStyle Hidden`
      ],
      { windowsHide: true, detached: true, stdio: 'ignore' }
    )
    ps.unref()
    trackedSessions.set(pid, ps)
    // Tail the CSV file once a second; compute FPS from the timing column.
    void tailPresentMonCsv(pid, outFile)
    return true
  } catch (err) {
    log.warn('presentmon', `spawn failed: ${String(err)}`)
    return false
  }
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

export function shutdownAllPresentMon(): void {
  for (const pid of Array.from(trackedSessions.keys())) {
    stopPresentMonForPid(pid)
  }
}

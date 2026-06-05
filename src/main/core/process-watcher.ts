import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename } from 'node:path'
import { libraryStore } from './store'
import { startPerformanceMonitor, stopPerformanceMonitor, latestPerformanceSample } from './performance'
import { ensureRtssRunning } from './rtss'
import { log } from './logger'
import type { ActiveLaunch, Game } from '@shared/types'

const execFileAsync = promisify(execFile)

/**
 * Background watcher that auto-attaches the performance monitor to library
 * games that the user launched OUTSIDE GameHub (Steam shortcut, desktop, the
 * game already running before GameHub opened, etc.).
 *
 * Why this exists: `startPerformanceMonitor` previously only ran for games
 * we launched ourselves. If you opened Elden Ring through Steam directly,
 * GameHub had no idea it was running — so no FPS, no CPU%, nothing.
 *
 * Strategy:
 *  - Every POLL_MS, list running processes by exe name.
 *  - For each library game with a matchable `.exe`, check if its process is
 *    alive. If yes and we're not already monitoring → register a synthetic
 *    ActiveLaunch and call startPerformanceMonitor.
 *  - When the process disappears for several consecutive polls, stop the
 *    monitor.
 *
 * Cheap and resilient: a single PowerShell `Get-Process | Select Id,Name`
 * call per tick, ~30ms.
 */

const POLL_MS = 4000
/**
 * How many missed polls before we consider an auto-attached game closed.
 * Was 3 (~12s) but anti-cheat games (Elden Ring/EAC) intermittently make
 * `Get-Process` slow or return partial data — leading to false detaches
 * while the game is clearly still running. 8 misses ≈ 32s gives slow polls
 * plenty of room to recover.
 */
const AUTO_MISS_LIMIT = 8

interface AutoTracked {
  gameId: string
  pid: number
  miss: number
}

const tracked = new Map<string, AutoTracked>()
let timer: NodeJS.Timeout | null = null
let running = false

export function startProcessWatcher(): void {
  if (timer) return
  log.info('process-watcher', `starting (poll=${POLL_MS}ms)`)
  // Kick once immediately so already-running games get picked up fast.
  void tick()
  timer = setInterval(() => void tick(), POLL_MS)
}

export function stopProcessWatcher(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
  for (const entry of tracked.values()) stopPerformanceMonitor(entry.gameId)
  tracked.clear()
}

async function tick(): Promise<void> {
  if (running) return
  running = true
  try {
    const procs = await listProcesses()
    if (procs.length === 0) {
      // Probe failed — don't churn the tracked map.
      return
    }
    const games = libraryStore.load().games
    const byExe = indexGamesByExe(games)

    const seenGameIds = new Set<string>()
    for (const proc of procs) {
      const game = matchGameForProcess(proc, byExe)
      if (!game) continue
      seenGameIds.add(game.id)

      const current = tracked.get(game.id)
      if (current) {
        current.pid = proc.pid
        current.miss = 0
        continue
      }

      // Already being monitored via a real launch? Skip.
      const live = latestPerformanceSample(game.id)
      if (live && live.status === 'running') continue

      const synthetic: ActiveLaunch = {
        gameId: game.id,
        gameTitle: game.title,
        emulatorName: game.platform === 'pc' ? 'Windows' : (game.emulator ?? 'native'),
        pid: proc.pid,
        processName: proc.name,
        executablePath: proc.path,
        startedAt: new Date().toISOString()
      }
      tracked.set(game.id, { gameId: game.id, pid: proc.pid, miss: 0 })
      log.info(
        'process-watcher',
        `auto-attaching "${game.title}" (pid=${proc.pid}, exe=${proc.name})`
      )
      try {
        startPerformanceMonitor(synthetic)
      } catch (err) {
        log.warn('process-watcher', `start monitor failed: ${String(err)}`)
        tracked.delete(game.id)
      }
      // Best-effort: try to bring RTSS up so FPS becomes available. Fire and
      // forget — failures here just mean no overlay FPS, which is fine.
      if (game.platform === 'pc') {
        void ensureRtssRunning()
          .then((res) => log.info('process-watcher', `rtss ensure: ${res}`))
          .catch(() => undefined)
      }
    }

    // Detach games whose processes are gone.
    for (const entry of Array.from(tracked.values())) {
      if (seenGameIds.has(entry.gameId)) continue
      entry.miss += 1
      if (entry.miss >= AUTO_MISS_LIMIT) {
        log.info('process-watcher', `auto-detaching ${entry.gameId} (process gone)`)
        tracked.delete(entry.gameId)
        stopPerformanceMonitor(entry.gameId)
      }
    }
  } catch (err) {
    log.warn('process-watcher', `tick failed: ${String(err)}`)
  } finally {
    running = false
  }
}

interface RunningProcess {
  pid: number
  name: string
  path?: string
}

async function listProcesses(): Promise<RunningProcess[]> {
  if (process.platform !== 'win32') return []
  // We ask for Path too — that's what lets us match games that share an exe
  // name with something common (e.g. "Launcher.exe") by their install dir.
  // Get-Process accesses Path through Process.MainModule which fails for
  // some protected processes; that's fine, we just don't get the path.
  const command =
    "Get-Process | Where-Object { $_.Id -gt 4 } | " +
    "ForEach-Object { try { $p = $_.MainModule.FileName } catch { $p = '' }; " +
    "[PSCustomObject]@{ Id = $_.Id; Name = $_.ProcessName; Path = $p } } | " +
    "ConvertTo-Json -Compress"
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, timeout: 6000, maxBuffer: 4 * 1024 * 1024 }
    )
    const parsed = JSON.parse(stdout || '[]') as unknown
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    const out: RunningProcess[] = []
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      const id = Number(e.Id)
      const name = String(e.Name ?? '')
      const path = typeof e.Path === 'string' ? e.Path : undefined
      if (!Number.isFinite(id) || !name) continue
      out.push({ pid: id, name, path: path || undefined })
    }
    return out
  } catch (err) {
    log.debug?.('process-watcher', `listProcesses failed: ${String(err)}`)
    return []
  }
}

interface GameExeKey {
  /** lowercased basename without .exe */
  exe: string
  /** lowercased install dir (for ambiguity-breaking when exe is generic) */
  installDirLower?: string
}

function indexGamesByExe(games: Game[]): Map<string, Array<{ game: Game; key: GameExeKey }>> {
  const map = new Map<string, Array<{ game: Game; key: GameExeKey }>>()
  for (const game of games) {
    const path = game.path
    // URI-style entries (steam://, com.epicgames.launcher://, riot://) don't
    // have a tied process name we can predict — store integration handles
    // matching via window title / Steam appid in their own paths.
    if (!path || path.includes('://')) continue
    const exe = basename(path).toLowerCase().replace(/\.exe$/, '')
    if (!exe) continue
    const installDirLower = path.replace(/[\\/][^\\/]+$/, '').toLowerCase()
    const bucket = map.get(exe) ?? []
    bucket.push({ game, key: { exe, installDirLower } })
    map.set(exe, bucket)
  }
  return map
}

function matchGameForProcess(
  proc: RunningProcess,
  byExe: Map<string, Array<{ game: Game; key: GameExeKey }>>
): Game | null {
  const name = proc.name.toLowerCase().replace(/\.exe$/, '')
  const bucket = byExe.get(name)
  if (!bucket || bucket.length === 0) return null
  if (bucket.length === 1) return bucket[0].game
  // Disambiguate by install dir if we have the running process path.
  if (proc.path) {
    const lower = proc.path.toLowerCase()
    for (const entry of bucket) {
      if (entry.key.installDirLower && lower.startsWith(entry.key.installDirLower)) {
        return entry.game
      }
    }
  }
  // Fallback — pick the first.
  return bucket[0].game
}

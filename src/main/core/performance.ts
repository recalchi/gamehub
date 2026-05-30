import { execFile } from 'node:child_process'
import { cpus, freemem, totalmem } from 'node:os'
import { promisify } from 'node:util'
import { BrowserWindow } from 'electron'
import { settingsStore } from './store'
import { log } from './logger'
import { IPC } from '@shared/ipc'
import type { ActiveLaunch, PerformanceReport, PerformanceSample } from '@shared/types'

const execFileAsync = promisify(execFile)

interface ProcessSnapshot {
  name?: string
  cpuSeconds?: number
  workingSetBytes?: number
  privateBytes?: number
  responding?: boolean
  /** Sum of GPU 3D engine usage % across all instances of this PID. */
  gpuPercent?: number
  /** Dedicated VRAM bytes used by this PID. */
  gpuMemoryBytes?: number
  /** Best-effort window title from the main window — used to scrape FPS
   *  (PCSX2/RPCS3/DuckStation all write "FPS: nn.n" or similar in there). */
  windowTitle?: string
}

interface SessionState {
  launch: ActiveLaunch
  startedAtMs: number
  timer: NodeJS.Timeout
  samples: PerformanceSample[]
  previous?: { cpuSeconds: number; sampledAtMs: number }
  busy: boolean
  /** Number of consecutive query failures — we only stop the session after a
   *  few in a row to survive transient PowerShell hiccups. */
  missCount: number
}

const sessions = new Map<string, SessionState>()
const latestSamples = new Map<string, PerformanceSample>()
const reports = new Map<string, PerformanceReport>()

export function startPerformanceMonitor(launch: ActiveLaunch): void {
  const settings = settingsStore.load().performance
  if (!settings.enabled) return

  stopPerformanceMonitor(launch.gameId, false)

  if (!launch.pid) {
    const sample: PerformanceSample = {
      gameId: launch.gameId,
      gameTitle: launch.gameTitle,
      emulatorName: launch.emulatorName,
      sampledAt: new Date().toISOString(),
      elapsedSeconds: 0,
      status: 'unavailable',
      note: 'Sem PID observavel. Jogos iniciados por URI/Steam podem precisar de detecao futura por processo.'
    }
    latestSamples.set(launch.gameId, sample)
    publish(IPC.performance.sample, sample)
    return
  }

  const intervalMs = clamp(settings.sampleIntervalMs, 1000, 10_000)
  const state: SessionState = {
    launch,
    startedAtMs: Date.parse(launch.startedAt),
    timer: setInterval(() => void sampleSession(launch.gameId), intervalMs),
    samples: [],
    busy: false,
    missCount: 0
  }
  sessions.set(launch.gameId, state)
  void sampleSession(launch.gameId)
}

/** How many consecutive empty samples before we declare the session over. */
const MAX_MISSES = 4

export function stopPerformanceMonitor(gameId: string, publishReport = true): PerformanceReport | null {
  const state = sessions.get(gameId)
  sessions.delete(gameId)
  gpuCache.delete(gameId)
  sampleTick.delete(gameId)
  if (!state) return null

  clearInterval(state.timer)
  const report = buildReport(state)
  reports.set(gameId, report)

  const endedSample: PerformanceSample = {
    gameId,
    gameTitle: state.launch.gameTitle,
    emulatorName: state.launch.emulatorName,
    pid: state.launch.pid,
    sampledAt: report.endedAt,
    elapsedSeconds: report.durationSeconds,
    status: 'ended',
    note: 'Sessao finalizada. Relatorio pronto.'
  }
  latestSamples.set(gameId, endedSample)
  if (publishReport) {
    publish(IPC.performance.sample, endedSample)
    publish(IPC.performance.reportReady, report)
  }
  return report
}

export function latestPerformanceSample(gameId: string): PerformanceSample | null {
  return latestSamples.get(gameId) ?? null
}

export function latestPerformanceReport(gameId: string): PerformanceReport | null {
  return reports.get(gameId) ?? null
}

async function sampleSession(gameId: string): Promise<void> {
  const state = sessions.get(gameId)
  if (!state || state.busy) return
  state.busy = true

  try {
    const snapshot = await queryProcess(state.launch.pid, state.launch.processName, gameId)
    if (!snapshot) {
      // Don't kill the session on a single empty sample — PowerShell sometimes
      // hiccups, and emulators that fork a worker subprocess can briefly leave
      // us with no matching PID. Stop only after several misses in a row.
      state.missCount += 1
      if (state.missCount >= MAX_MISSES) {
        stopPerformanceMonitor(gameId)
      }
      return
    }
    state.missCount = 0

    const now = Date.now()
    let cpuPercent: number | undefined
    if (snapshot.cpuSeconds !== undefined) {
      if (state.previous) {
        const cpuDelta = snapshot.cpuSeconds - state.previous.cpuSeconds
        const secondsDelta = (now - state.previous.sampledAtMs) / 1000
        if (secondsDelta > 0 && cpuDelta >= 0) {
          cpuPercent = clamp((cpuDelta / secondsDelta / cpus().length) * 100, 0, 100)
        }
      }
      state.previous = { cpuSeconds: snapshot.cpuSeconds, sampledAtMs: now }
    }

    const sample: PerformanceSample = {
      gameId,
      gameTitle: state.launch.gameTitle,
      emulatorName: state.launch.emulatorName,
      pid: state.launch.pid,
      processName: snapshot.name,
      sampledAt: new Date(now).toISOString(),
      elapsedSeconds: Math.max(0, Math.round((now - state.startedAtMs) / 1000)),
      cpuPercent,
      memoryMb: bytesToMb(snapshot.workingSetBytes),
      privateMemoryMb: bytesToMb(snapshot.privateBytes),
      systemMemoryUsedPercent: systemMemoryUsedPercent(),
      gpuPercent: snapshot.gpuPercent,
      gpuMemoryMb: bytesToMb(snapshot.gpuMemoryBytes),
      fps: snapshot.windowTitle ? extractFpsFromTitle(snapshot.windowTitle) : undefined,
      responding: snapshot.responding,
      status: 'running'
    }

    const maxSamples = Math.max(
      5,
      Math.ceil(settingsStore.load().performance.historySeconds / (settingsStore.load().performance.sampleIntervalMs / 1000))
    )
    state.samples.push(sample)
    if (state.samples.length > maxSamples) state.samples.shift()
    latestSamples.set(gameId, sample)
    publish(IPC.performance.sample, sample)
  } catch (err) {
    log.warn('performance', `sample failed for ${gameId}: ${String(err)}`)
  } finally {
    const current = sessions.get(gameId)
    if (current) current.busy = false
  }
}

/**
 * Query a snapshot of the emulator process(es).
 *
 * Strategy — we want to survive three real-world quirks:
 *  1. Emulators that exec/respawn (the tracked PID dies but another instance
 *     with the same name is running the game).
 *  2. Launchers that spawn the actual emulator as a child (PID we tracked
 *     was a short-lived loader).
 *  3. Transient PowerShell failures (network MOFs reloading, WMI hiccups).
 *
 * So we always look up by process name when we have one, aggregate stats
 * across every matching instance, and only fall back to direct PID lookup
 * if name resolution returns nothing.
 */
/** Per-game GPU sample cache. Refreshed less often than the main loop. */
const gpuCache = new Map<string, { gpuPercent?: number; gpuMemoryBytes?: number; takenAtMs: number }>()
/** Sample-counter so we only re-query GPU every Nth basic sample. */
const sampleTick = new Map<string, number>()

async function queryProcess(
  pid: number | undefined,
  processName: string | undefined,
  gameId: string
): Promise<ProcessSnapshot | null> {
  if (process.platform !== 'win32') return null
  if (!pid && !processName) return null

  // --- Step 1: fast Get-Process for CPU/RAM/title. No Get-Counter here —
  // perf counters can take 1-2s each and were causing the whole query to
  // time out for shadPS4 sessions, leaving the UI permanently showing "--".
  const safeName = processName?.replace(/'/g, "''") ?? ''
  const command = `
    $hint = '${safeName}'
    $procs = @()
    if ($hint) {
      $procs = @(Get-Process -Name $hint -ErrorAction SilentlyContinue)
    }
    ${pid ? `if ($procs.Count -eq 0) { $procs = @(Get-Process -Id ${pid} -ErrorAction SilentlyContinue) }` : ''}
    if ($procs.Count -eq 0) { exit 2 }
    $cpuSum = 0.0; $wsSum = [int64]0; $pvtSum = [int64]0
    $allResponding = $true; $title = $null; $name = $null; $pids = @()
    foreach ($p in $procs) {
      try { $cpuSum += [double]$p.CPU } catch {}
      try { $wsSum += [int64]$p.WorkingSet64 } catch {}
      try { $pvtSum += [int64]$p.PrivateMemorySize64 } catch {}
      try { if (-not $p.Responding) { $allResponding = $false } } catch {}
      if (-not $title) { try { if ($p.MainWindowTitle) { $title = $p.MainWindowTitle } } catch {} }
      if (-not $name) { $name = $p.ProcessName }
      $pids += $p.Id
    }
    [PSCustomObject]@{
      Name = $name; CPU = $cpuSum; WorkingSet64 = $wsSum; PrivateMemorySize64 = $pvtSum
      Responding = $allResponding; Title = $title; Instances = $procs.Count
      Pids = ($pids -join ',')
    } | ConvertTo-Json -Compress
  `

  let parsed: {
    Name?: string
    CPU?: number | null
    WorkingSet64?: number | null
    PrivateMemorySize64?: number | null
    Responding?: boolean | null
    Title?: string | null
    Instances?: number
    Pids?: string
  }
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 3000, windowsHide: true }
    )
    parsed = JSON.parse(stdout.trim())
  } catch (err) {
    log.warn('performance', `queryProcess fast path failed`, {
      gameId,
      pid,
      processName,
      err: err instanceof Error ? err.message : String(err)
    })
    return null
  }

  // --- Step 2: GPU sampling on a lower cadence (every 4th sample) — uses
  // Performance Counters which are slow. Cached in between calls so the UI
  // still shows the last known GPU %, not a flicker.
  const tick = (sampleTick.get(gameId) ?? 0) + 1
  sampleTick.set(gameId, tick)
  let gpuStats = gpuCache.get(gameId)
  if (parsed.Pids && (tick % 4 === 1 || !gpuStats)) {
    gpuStats = await queryGpu(parsed.Pids).catch(() => undefined) ?? gpuStats
    if (gpuStats) gpuCache.set(gameId, gpuStats)
  }

  return {
    name: parsed.Name,
    cpuSeconds: parsed.CPU ?? undefined,
    workingSetBytes: parsed.WorkingSet64 ?? undefined,
    privateBytes: parsed.PrivateMemorySize64 ?? undefined,
    responding: parsed.Responding ?? undefined,
    gpuPercent: gpuStats?.gpuPercent,
    gpuMemoryBytes: gpuStats?.gpuMemoryBytes,
    windowTitle: parsed.Title ?? undefined
  }
}

async function queryGpu(
  pidsCsv: string
): Promise<{ gpuPercent?: number; gpuMemoryBytes?: number; takenAtMs: number } | undefined> {
  const command = `
    $pids = '${pidsCsv}'.Split(',')
    $gpuTotal = 0.0
    $vramTotal = [int64]0
    foreach ($id in $pids) {
      try {
        $g = (Get-Counter "\\GPU Engine(pid_$id*engtype_3D)\\Utilization Percentage" -ErrorAction SilentlyContinue).CounterSamples
        if ($g) { $gpuTotal += ($g | Measure-Object CookedValue -Sum).Sum }
      } catch {}
      try {
        $v = (Get-Counter "\\GPU Process Memory(pid_$id*)\\Dedicated Usage" -ErrorAction SilentlyContinue).CounterSamples
        if ($v) { $vramTotal += [int64](($v | Measure-Object CookedValue -Sum).Sum) }
      } catch {}
    }
    [PSCustomObject]@{ Gpu = [math]::Round($gpuTotal, 1); Vram = $vramTotal } | ConvertTo-Json -Compress
  `
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { timeout: 4000, windowsHide: true }
  )
  const parsed = JSON.parse(stdout.trim()) as { Gpu?: number | null; Vram?: number | null }
  return {
    gpuPercent: parsed.Gpu == null ? undefined : Math.min(100, Math.max(0, parsed.Gpu)),
    gpuMemoryBytes: parsed.Vram ?? undefined,
    takenAtMs: Date.now()
  }
}

/**
 * Most emulators write framerate to their main window title — PCSX2
 * "PCSX2 [60.00 FPS]", RPCS3 "FPS: 30.0 | GS: ...", DuckStation "DuckStation
 * 60.0 FPS / 16.7ms / VS=1". Cheap regex grabs the first number near
 * "FPS" — robust enough for the half-dozen common formats.
 */
function extractFpsFromTitle(title: string): number | undefined {
  const m = title.match(/(\d+(?:\.\d+)?)\s*FPS/i) ?? title.match(/FPS[:\s|]+(\d+(?:\.\d+)?)/i)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 && n < 500 ? n : undefined
}

function buildReport(state: SessionState): PerformanceReport {
  const settings = settingsStore.load().performance
  const endedAt = new Date()
  const durationSeconds = Math.max(1, Math.round((endedAt.getTime() - state.startedAtMs) / 1000))
  const cpuValues = numbers(state.samples.map((s) => s.cpuPercent))
  const memoryValues = numbers(state.samples.map((s) => s.memoryMb))
  const systemValues = numbers(state.samples.map((s) => s.systemMemoryUsedPercent))
  const peakCpu = max(cpuValues)
  const peakMemory = max(memoryValues)
  const avgCpu = avg(cpuValues)
  const avgMemory = avg(memoryValues)
  const diagnostics: string[] = []
  const suggestions: string[] = []
  let hasWarnings = false

  if (state.samples.length === 0) {
    diagnostics.push('Sem amostras suficientes para diagnostico.')
    suggestions.push('Mantenha o jogo aberto por pelo menos alguns segundos para gerar um relatorio util.')
  } else {
    diagnostics.push(`Sessao monitorada por ${formatDuration(durationSeconds)} com ${state.samples.length} amostras.`)
    if (peakCpu !== undefined) {
      diagnostics.push(`Pico de CPU do processo: ${Math.round(peakCpu)}%.`)
      if (peakCpu >= settings.warnCpuPercent) {
        hasWarnings = true
        suggestions.push('CPU alta: reduza escala interna/resolucao do emulador ou feche apps em segundo plano.')
      }
    }
    if (peakMemory !== undefined) {
      diagnostics.push(`Pico de RAM do processo: ${Math.round(peakMemory)} MB.`)
      if (peakMemory >= settings.warnMemoryMb) {
        hasWarnings = true
        suggestions.push('RAM alta: evite texture packs pesados e confira se ha vazamento apos trocar de jogo.')
      }
    }
    if (state.samples.some((s) => s.responding === false)) {
      hasWarnings = true
      diagnostics.push('O processo ficou sem responder em pelo menos uma amostra.')
      suggestions.push('Se houve travadas, teste outro backend grafico do emulador ou atualize o driver de video.')
    }
    if (systemValues.some((v) => v >= 90)) {
      hasWarnings = true
      suggestions.push('Memoria do sistema acima de 90%: feche navegadores/launchers antes de jogos pesados.')
    }
    if (suggestions.length === 0) {
      suggestions.push('Sessao estavel. Nenhuma acao obrigatoria detectada.')
    }
  }

  return {
    gameId: state.launch.gameId,
    gameTitle: state.launch.gameTitle,
    emulatorName: state.launch.emulatorName,
    pid: state.launch.pid,
    startedAt: state.launch.startedAt,
    endedAt: endedAt.toISOString(),
    durationSeconds,
    sampleCount: state.samples.length,
    averages: {
      cpuPercent: avgCpu,
      memoryMb: avgMemory,
      systemMemoryUsedPercent: avg(systemValues)
    },
    peaks: {
      cpuPercent: peakCpu,
      memoryMb: peakMemory,
      systemMemoryUsedPercent: max(systemValues)
    },
    diagnostics,
    suggestions,
    health: state.samples.length === 0 ? 'unknown' : hasWarnings ? 'attention' : 'good'
  }
}

function publish(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function bytesToMb(bytes: number | undefined): number | undefined {
  return bytes === undefined ? undefined : Math.round(bytes / 1024 / 1024)
}

function systemMemoryUsedPercent(): number {
  return Math.round(((totalmem() - freemem()) / totalmem()) * 100)
}

function numbers(values: Array<number | undefined>): number[] {
  return values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
}

function avg(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  return values.reduce((a, b) => a + b, 0) / values.length
}

function max(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  return Math.max(...values)
}

function clamp(value: number, min: number, maxValue: number): number {
  return Math.min(maxValue, Math.max(min, value))
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}min ${rest}s` : `${minutes}min`
}

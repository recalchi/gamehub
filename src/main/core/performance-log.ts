import { existsSync, readdirSync, statSync, readFileSync, appendFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PATHS } from './paths'
import { log } from './logger'
import type { PerformanceSample } from '@shared/types'

/**
 * Append-only NDJSON sample logs grouped by game / session. Lets the
 * GameDetail "Histórico → Desempenho" pane show FPS curves across past
 * sessions instead of only the live ring buffer.
 *
 * Layout:
 *   userData/perf/<gameId>/<sessionId>.ndjson
 *
 * Retention: we keep the last 30 sessions per game. Anything older is pruned
 * at session start. Each session file caps at ~5MB by skipping writes once
 * the file exceeds it (a 2-hour session at 5s cadence is ~1MB, so 5MB is
 * generous).
 */
const MAX_SESSIONS_PER_GAME = 30
const MAX_SESSION_FILE_BYTES = 5 * 1024 * 1024

export interface PerfSessionSummary {
  sessionId: string
  startedAt: string
  endedAt?: string
  durationSeconds: number
  fpsAvg?: number
  fpsMin?: number
  fpsMax?: number
  cpuPeak?: number
  gpuPeak?: number
  ramPeakMb?: number
  sampleCount: number
}

export interface PerfSessionDetail extends PerfSessionSummary {
  samples: PerformanceSample[]
}

function gameDir(gameId: string): string {
  const dir = join(PATHS.perf, sanitize(gameId))
  mkdirSync(dir, { recursive: true })
  return dir
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

const openSessions = new Map<string, { sessionId: string; file: string; bytes: number }>()

export function beginPerfSession(gameId: string, startedAt: string): string {
  const sessionId = startedAt.replace(/[:.]/g, '-')
  // Defensive: file system errors (permission denied, disk full, AV lock)
  // must NEVER cripple live monitoring. The persistent FPS log is a nicety;
  // the live panel is core. Catch everything and fall through.
  try {
    const file = join(gameDir(gameId), `${sessionId}.ndjson`)
    openSessions.set(gameId, { sessionId, file, bytes: 0 })
    pruneOldSessions(gameId)
  } catch (err) {
    log.warn('perf-log', `beginPerfSession failed for ${gameId}: ${String(err)}`)
  }
  return sessionId
}

export function appendPerfSample(gameId: string, sample: PerformanceSample): void {
  const session = openSessions.get(gameId)
  if (!session) return
  if (session.bytes > MAX_SESSION_FILE_BYTES) return
  try {
    const line = JSON.stringify(stripHeavy(sample)) + '\n'
    appendFileSync(session.file, line, 'utf8')
    session.bytes += line.length
  } catch (err) {
    log.warn('perf-log', `append failed for ${gameId}: ${String(err)}`)
  }
}

export function endPerfSession(gameId: string): void {
  openSessions.delete(gameId)
}

function stripHeavy(s: PerformanceSample): PerformanceSample {
  // We don't need note/processName in long-term storage; trims file size.
  const { note: _n, processName: _p, ...rest } = s
  return rest as PerformanceSample
}

function pruneOldSessions(gameId: string): void {
  const dir = gameDir(gameId)
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.ndjson'))
    .map((f) => ({ name: f, mtime: safeMtime(join(dir, f)) }))
    .sort((a, b) => b.mtime - a.mtime)
  for (const f of files.slice(MAX_SESSIONS_PER_GAME)) {
    try {
      rmSync(join(dir, f.name), { force: true })
    } catch {
      // best-effort prune; nothing user-visible if it fails
    }
  }
}

function safeMtime(file: string): number {
  try {
    return statSync(file).mtimeMs
  } catch {
    return 0
  }
}

export function listPerfSessions(gameId: string, limit = 10): PerfSessionSummary[] {
  const dir = join(PATHS.perf, sanitize(gameId))
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.ndjson'))
    .sort()
    .reverse()
    .slice(0, limit)
  return files.map((f) => summarize(join(dir, f), f.replace(/\.ndjson$/, '')))
}

export function readPerfSession(gameId: string, sessionId: string): PerfSessionDetail | null {
  const file = join(PATHS.perf, sanitize(gameId), `${sanitize(sessionId)}.ndjson`)
  if (!existsSync(file)) return null
  const samples = parseFile(file)
  return { ...summaryFromSamples(sessionId, samples), samples }
}

function summarize(file: string, sessionId: string): PerfSessionSummary {
  const samples = parseFile(file)
  return summaryFromSamples(sessionId, samples)
}

function summaryFromSamples(sessionId: string, samples: PerformanceSample[]): PerfSessionSummary {
  const fps = samples.map((s) => s.fps).filter((v): v is number => typeof v === 'number')
  const cpu = samples.map((s) => s.cpuPercent).filter((v): v is number => typeof v === 'number')
  const gpu = samples.map((s) => s.gpuPercent).filter((v): v is number => typeof v === 'number')
  const ram = samples.map((s) => s.memoryMb).filter((v): v is number => typeof v === 'number')
  const startedAt = samples[0]?.sampledAt ?? sessionId.replace(/-/g, ':')
  const endedAt = samples.length > 1 ? samples[samples.length - 1].sampledAt : undefined
  const duration = samples.length
    ? Math.max(0, Math.round((Date.parse(samples[samples.length - 1].sampledAt) - Date.parse(samples[0].sampledAt)) / 1000))
    : 0
  return {
    sessionId,
    startedAt,
    endedAt,
    durationSeconds: duration,
    fpsAvg: fps.length ? fps.reduce((a, b) => a + b, 0) / fps.length : undefined,
    fpsMin: fps.length ? Math.min(...fps) : undefined,
    fpsMax: fps.length ? Math.max(...fps) : undefined,
    cpuPeak: cpu.length ? Math.max(...cpu) : undefined,
    gpuPeak: gpu.length ? Math.max(...gpu) : undefined,
    ramPeakMb: ram.length ? Math.max(...ram) : undefined,
    sampleCount: samples.length
  }
}

function parseFile(file: string): PerformanceSample[] {
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as PerformanceSample
        } catch {
          return null
        }
      })
      .filter((s): s is PerformanceSample => !!s)
  } catch {
    return []
  }
}

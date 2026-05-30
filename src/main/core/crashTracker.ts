import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PATHS } from './paths'
import { log } from './logger'

/**
 * Crash tracking for emulator launches.
 *
 * When an emulator process exits unexpectedly (non-zero code, short uptime,
 * or specific patterns in stdout/stderr) we extract the symptom signature
 * and persist a crash report under `<userdata>/crashes/<gameId>/`. The UI
 * can list these per-game so the user sees:
 *
 *   - When the crash happened
 *   - How far they got (session uptime)
 *   - Which line of the emulator log triggered it
 *   - The last 200 lines of output for context
 *
 * Pattern matching is intentionally broad — different emulators write
 * different "I'm dying" messages: shadPS4 writes `<Critical>` + line ref,
 * RPCS3 writes "F " thread errors, PCSX2 writes "Aborting", etc.
 */

export interface CrashReport {
  /** ISO timestamp */
  ts: string
  gameId: string
  gameTitle: string
  emulatorId: string
  emulatorName: string
  /** Process exit code (null if killed by signal) */
  exitCode: number | null
  /** Session uptime in seconds before the crash */
  uptimeSeconds: number
  /** One-line symptom signature (the trigger line) */
  signature: string
  /** Category we classified this into */
  category: CrashCategory
  /** Path to the full log on disk */
  logPath: string
}

export type CrashCategory =
  | 'assertion'
  | 'segfault'
  | 'vulkan-oom'
  | 'vulkan-error'
  | 'memory'
  | 'shader'
  | 'filesystem'
  | 'user-quit'
  | 'unknown'

interface CrashPattern {
  /** Regex against any single output line */
  pattern: RegExp
  category: CrashCategory
  /** Higher priority overrides lower if multiple patterns hit */
  priority: number
}

const PATTERNS: CrashPattern[] = [
  // Vulkan: out of memory has highest priority — it's the most actionable
  { pattern: /ErrorOutOfDeviceMemory|ErrorOutOfHostMemory|VK_ERROR_OUT_OF/i, category: 'vulkan-oom', priority: 100 },
  { pattern: /Vulkan error|vk_swapchain.*Failed/i, category: 'vulkan-error', priority: 90 },
  // C++ assertion failures (shadPS4, fpPS4, PCSX2 all use this idiom)
  { pattern: /Assertion Failed|assert\(.+\) failed|panicked at/i, category: 'assertion', priority: 80 },
  // Memory subsystem
  { pattern: /address_space\.cpp|MapMemory|out of memory|memory.cpp/i, category: 'memory', priority: 70 },
  // Shader compilation
  { pattern: /shader.*fail|CompileModule.*error|pipeline.*fail/i, category: 'shader', priority: 60 },
  // Filesystem (missing file errors don't crash but contribute)
  { pattern: /sceKernelOpen: error|file_system\.cpp.*error/i, category: 'filesystem', priority: 30 },
  // POSIX signal
  { pattern: /Segmentation fault|SIGSEGV|SIGABRT|access violation/i, category: 'segfault', priority: 95 }
]

/**
 * Classify an emulator's recent output into a category + symptom line.
 * Walks lines bottom-up because the actual fatal line is almost always the
 * last interesting message before the process died.
 */
export function classifyCrash(output: string): { category: CrashCategory; signature: string } {
  const lines = output.split('\n').filter((l) => l.trim())
  let best: { category: CrashCategory; line: string; priority: number } | null = null
  // Walk from the end so the most recent matching line wins ties.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    for (const p of PATTERNS) {
      if (!p.pattern.test(line)) continue
      if (!best || p.priority > best.priority) {
        best = { category: p.category, line: line.trim(), priority: p.priority }
      }
    }
    // Don't scan the whole log if we already found a high-priority hit
    if (best && best.priority >= 80) break
  }
  if (!best) {
    return {
      category: 'unknown',
      signature: lines[lines.length - 1]?.slice(0, 240) ?? '(sem output capturado)'
    }
  }
  return { category: best.category, signature: best.line.slice(0, 240) }
}

/**
 * Decide whether a process exit was actually a crash vs a clean user quit.
 * - Exit code 0 + uptime > 30s → user closed it normally
 * - Any other case → look at the output to classify
 */
function isLikelyCrash(exitCode: number | null, uptimeSeconds: number, output: string): boolean {
  if (exitCode === 0 && uptimeSeconds > 30) return false
  if (uptimeSeconds < 5) return true // never got off the ground
  return /Critical|Assertion|Fatal|Aborting|Segmentation/i.test(output)
}

function crashDir(gameId: string): string {
  const dir = join(PATHS.userData, 'crashes', gameId)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Record a crash. Returns the persisted report; caller broadcasts to UI.
 * No-op (returns null) when we determine this wasn't actually a crash.
 */
export function recordCrash(opts: {
  gameId: string
  gameTitle: string
  emulatorId: string
  emulatorName: string
  exitCode: number | null
  uptimeSeconds: number
  output: string
}): CrashReport | null {
  if (!isLikelyCrash(opts.exitCode, opts.uptimeSeconds, opts.output)) {
    if (opts.exitCode === 0) {
      log.info('crashTracker', `clean exit for ${opts.gameTitle} after ${opts.uptimeSeconds}s`)
    }
    return null
  }
  const { category, signature } = classifyCrash(opts.output)
  const ts = new Date().toISOString()
  const dir = crashDir(opts.gameId)
  const stamp = ts.replace(/[:.]/g, '-')
  const logPath = join(dir, `${stamp}.log`)
  const reportPath = join(dir, `${stamp}.json`)

  const report: CrashReport = {
    ts,
    gameId: opts.gameId,
    gameTitle: opts.gameTitle,
    emulatorId: opts.emulatorId,
    emulatorName: opts.emulatorName,
    exitCode: opts.exitCode,
    uptimeSeconds: opts.uptimeSeconds,
    signature,
    category,
    logPath
  }

  try {
    writeFileSync(logPath, opts.output, 'utf8')
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
    log.warn(
      'crashTracker',
      `recorded crash for ${opts.gameTitle}: ${category} after ${opts.uptimeSeconds}s — ${signature.slice(0, 120)}`
    )
  } catch (err) {
    log.error('crashTracker', `failed to write crash report: ${String(err)}`)
  }

  // Prune old reports — keep last 20 per game
  pruneCrashes(opts.gameId, 20)
  return report
}

export function listCrashes(gameId: string): CrashReport[] {
  const dir = join(PATHS.userData, 'crashes', gameId)
  if (!existsSync(dir)) return []
  const out: CrashReport[] = []
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return []
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try {
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8')) as CrashReport
      out.push(data)
    } catch {
      /* corrupt report, skip */
    }
  }
  return out.sort((a, b) => b.ts.localeCompare(a.ts))
}

/** Aggregate stats across all crashes for a game — fuels the UI chip. */
export function crashStats(gameId: string): {
  total: number
  byCategory: Record<CrashCategory, number>
  lastTs?: string
  longestSession: number
  shortestSession: number
} {
  const crashes = listCrashes(gameId)
  const byCategory = {} as Record<CrashCategory, number>
  let longestSession = 0
  let shortestSession = Number.MAX_SAFE_INTEGER
  for (const c of crashes) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1
    longestSession = Math.max(longestSession, c.uptimeSeconds)
    shortestSession = Math.min(shortestSession, c.uptimeSeconds)
  }
  return {
    total: crashes.length,
    byCategory,
    lastTs: crashes[0]?.ts,
    longestSession,
    shortestSession: crashes.length > 0 ? shortestSession : 0
  }
}

function pruneCrashes(gameId: string, keep: number): void {
  const dir = join(PATHS.userData, 'crashes', gameId)
  if (!existsSync(dir)) return
  let entries: Array<{ name: string; mtime: number }>
  try {
    entries = readdirSync(dir).map((name) => {
      const st = statSync(join(dir, name))
      return { name, mtime: st.mtimeMs }
    })
  } catch {
    return
  }
  const sorted = entries.sort((a, b) => b.mtime - a.mtime)
  // Each crash is a .json + .log pair, so keep `keep * 2` entries total
  const toDelete = sorted.slice(keep * 2)
  for (const e of toDelete) {
    try {
      require('node:fs').unlinkSync(join(dir, e.name))
    } catch {
      /* ignore */
    }
  }
}

/**
 * Pretty-printable category label + actionable hint for the UI.
 */
export function describeCrashCategory(category: CrashCategory): { label: string; hint: string } {
  switch (category) {
    case 'vulkan-oom':
      return {
        label: 'VRAM esgotada',
        hint: 'Reduza resolução interna pra 720p ou desligue readbacks no config do emulador.'
      }
    case 'vulkan-error':
      return {
        label: 'Erro no Vulkan',
        hint: 'Atualize driver da GPU. Pode ser bug do emulador com formato específico.'
      }
    case 'assertion':
      return {
        label: 'Assertion do emulador',
        hint: 'Bug interno do emulador — geralmente resolvido em release nova.'
      }
    case 'memory':
      return {
        label: 'Alocação de memória',
        hint: 'Feche outros apps pesados ou aumente page file do Windows.'
      }
    case 'shader':
      return {
        label: 'Compilação de shader',
        hint: 'Limpe cache de shaders do emulador e tente de novo.'
      }
    case 'segfault':
      return {
        label: 'Segmentation fault',
        hint: 'Versão do emulador incompatível com o jogo. Tente outra release.'
      }
    case 'filesystem':
      return {
        label: 'Arquivo do jogo',
        hint: 'Verifique se a extração do PKG completou — arquivos podem estar faltando.'
      }
    case 'user-quit':
      return { label: 'Fechamento normal', hint: 'Você fechou o jogo.' }
    default:
      return { label: 'Causa desconhecida', hint: 'Veja o log completo pra mais detalhes.' }
  }
}

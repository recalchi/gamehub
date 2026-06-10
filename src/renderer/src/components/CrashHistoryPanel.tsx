import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  FileText,
  Skull,
  Timer,
  Zap
} from 'lucide-react'
import type { CrashCategory, CrashReport, CrashStats } from '@shared/types'
import { M } from '../motion/tokens'
import { formatPlayTime } from '../utils/time'

const CATEGORY_META: Record<CrashCategory, { label: string; tone: string; icon: typeof Skull; hint: string }> = {
  'vulkan-oom': {
    label: 'VRAM esgotada',
    tone: 'bg-rose-400/20 text-rose-300 border-rose-500/30',
    icon: Zap,
    hint: 'Reduza resolução interna do emulador ou desligue readbacks.'
  },
  'vulkan-error': {
    label: 'Erro Vulkan',
    tone: 'bg-amber-400/20 text-amber-300 border-amber-500/30',
    icon: Zap,
    hint: 'Atualize driver da GPU ou tente outra release do emulador.'
  },
  assertion: {
    label: 'Assertion',
    tone: 'bg-rose-400/20 text-rose-300 border-rose-500/30',
    icon: Skull,
    hint: 'Bug interno do emulador — geralmente fix em release nova.'
  },
  memory: {
    label: 'Memória',
    tone: 'bg-amber-400/20 text-amber-300 border-amber-500/30',
    icon: Cpu,
    hint: 'Feche apps pesados ou aumente page file do Windows.'
  },
  shader: {
    label: 'Shader',
    tone: 'bg-violet-400/20 text-violet-300 border-violet-500/30',
    icon: Zap,
    hint: 'Limpe cache de shaders do emulador.'
  },
  segfault: {
    label: 'Segfault',
    tone: 'bg-rose-400/20 text-rose-300 border-rose-500/30',
    icon: Skull,
    hint: 'Versão do emulador incompatível. Teste outra release.'
  },
  filesystem: {
    label: 'Arquivo do jogo',
    tone: 'bg-cyan-400/20 text-cyan-300 border-cyan-500/30',
    icon: FileText,
    hint: 'Reextraia o PKG ou verifique integridade do dump.'
  },
  'user-quit': {
    label: 'Fechado',
    tone: 'bg-slate-400/20 text-slate-300 border-slate-500/30',
    icon: Clock,
    hint: 'Saída limpa.'
  },
  unknown: {
    label: 'Desconhecido',
    tone: 'bg-slate-400/20 text-slate-300 border-slate-500/30',
    icon: AlertTriangle,
    hint: 'Veja o log completo pra mais contexto.'
  }
}

function formatSeconds(s: number): string {
  return formatPlayTime(s, '0s')
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'agora há pouco'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min atrás`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h atrás`
  return `${Math.floor(diff / 86_400_000)}d atrás`
}

/**
 * Per-game crash history. Shown on GameDetail under the BIOS panel area
 * when there's at least one crash recorded. Each crash is expandable to
 * see the trigger line + load the full log on demand.
 */
export default function CrashHistoryPanel({ gameId }: { gameId: string }): JSX.Element | null {
  const [crashes, setCrashes] = useState<CrashReport[]>([])
  const [stats, setStats] = useState<CrashStats | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [logContent, setLogContent] = useState<Record<string, string>>({})
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load(): Promise<void> {
      const [list, s] = await Promise.all([
        window.api.system.listCrashes(gameId),
        window.api.system.crashStats(gameId)
      ])
      if (!mounted) return
      setCrashes(list)
      setStats(s)
    }
    void load()
    const off = window.api.system.onCrashRecorded((report) => {
      if (report.gameId !== gameId) return
      void load()
    })
    return () => {
      mounted = false
      off()
    }
  }, [gameId])

  if (!stats || stats.total === 0) return null

  const visible = showAll ? crashes : crashes.slice(0, 3)

  async function loadLog(report: CrashReport): Promise<void> {
    if (logContent[report.logPath]) return
    const r = await window.api.system.readCrashLog(report.logPath)
    if ('content' in r) {
      setLogContent((prev) => ({ ...prev, [report.logPath]: r.content }))
    }
  }

  function toggle(id: string, report: CrashReport): void {
    if (expanded === id) {
      setExpanded(null)
    } else {
      setExpanded(id)
      void loadLog(report)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={M.page}
      className="mt-6 glass rounded-2xl p-5"
    >
      <header className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-300" />
          <h3 className="font-semibold text-base">Histórico de crashes</h3>
          <span className="text-xs text-slate-500 font-mono">
            {stats.total} {stats.total === 1 ? 'registro' : 'registros'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          {stats.longestSession > 0 && (
            <span className="flex items-center gap-1.5">
              <Timer className="w-3 h-3" />
              Maior: {formatSeconds(stats.longestSession)}
            </span>
          )}
          {stats.shortestSession > 0 && (
            <span className="flex items-center gap-1.5 text-rose-400/80">
              <Timer className="w-3 h-3" />
              Menor: {formatSeconds(stats.shortestSession)}
            </span>
          )}
        </div>
      </header>

      {/* Category chips */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {(Object.entries(stats.byCategory) as Array<[CrashCategory, number]>)
          .sort(([, a], [, b]) => b - a)
          .map(([cat, count]) => {
            const meta = CATEGORY_META[cat]
            return (
              <span
                key={cat}
                className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${meta.tone}`}
              >
                {meta.label} · {count}
              </span>
            )
          })}
      </div>

      <ul className="space-y-2">
        {visible.map((c) => {
          const meta = CATEGORY_META[c.category]
          const Icon = meta.icon
          const isExpanded = expanded === c.logPath
          return (
            <li key={c.logPath}>
              <button
                onClick={() => toggle(c.logPath, c)}
                className="w-full text-left rounded-lg border border-white/5 hover:border-white/15 bg-white/[0.02] hover:bg-white/[0.05] p-3 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 w-8 h-8 rounded-md border flex items-center justify-center ${meta.tone}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{meta.label}</span>
                      <span className="text-[11px] text-slate-500">{timeAgo(c.ts)}</span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        · {formatSeconds(c.uptimeSeconds)} jogados
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                      {c.signature}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </div>
              </button>
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={M.micro}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 ml-11 rounded-md bg-black/40 border border-white/5 p-3 space-y-2">
                      <p className="text-[11px] text-amber-200 leading-relaxed">
                        💡 {meta.hint}
                      </p>
                      <pre className="text-[10px] text-slate-400 font-mono leading-snug overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                        {logContent[c.logPath]?.split('\n').slice(-50).join('\n') ?? 'Carregando log…'}
                      </pre>
                      <div className="text-[10px] text-slate-500 flex items-center justify-between">
                        <span>
                          Emulador: {c.emulatorName} · Exit code: {c.exitCode ?? 'killed'}
                        </span>
                        <code className="text-slate-600 truncate max-w-xs">{c.logPath}</code>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          )
        })}
      </ul>

      {crashes.length > 3 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-xs text-slate-400 hover:text-accent flex items-center gap-1"
        >
          {showAll ? 'Mostrar só os 3 últimos' : `Ver todos os ${crashes.length} crashes`}
        </button>
      )}
    </motion.section>
  )
}

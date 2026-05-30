import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Cpu,
  Gauge,
  MemoryStick,
  Monitor,
  Sparkles
} from 'lucide-react'
import type { CrashStats, Game, PerformanceReport, PerformanceSample } from '@shared/types'

interface SessionStats {
  fpsMin: number
  fpsAvg: number
  fpsMax: number
  cpuPeak: number
  gpuPeak: number
  ramPeakMb: number
  vramPeakMb: number
  samples: number
}

const EMPTY_STATS: SessionStats = {
  fpsMin: Infinity,
  fpsAvg: 0,
  fpsMax: 0,
  cpuPeak: 0,
  gpuPeak: 0,
  ramPeakMb: 0,
  vramPeakMb: 0,
  samples: 0
}

export default function PerformancePanel({ game }: { game: Game }): JSX.Element {
  const [sample, setSample] = useState<PerformanceSample | null>(null)
  const [report, setReport] = useState<PerformanceReport | null>(null)
  const [sessionStats, setSessionStats] = useState<SessionStats>(EMPTY_STATS)
  const [crashStats, setCrashStats] = useState<CrashStats | null>(null)
  // FPS rolling sum kept outside React state to avoid render churn each tick.
  const fpsSumRef = useRef({ sum: 0, count: 0 })

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      window.api.performance.latest(game.id),
      window.api.performance.report(game.id)
    ]).then(([latest, latestReport]) => {
      if (cancelled) return
      setSample(latest)
      setReport(latestReport)
    })

    const offSample = window.api.performance.onSample((next) => {
      if (next.gameId !== game.id) return
      setSample(next)
      // Update rolling session stats. Skip non-running samples so a
      // stale "unavailable" doesn't drag the peaks.
      if (next.status !== 'running') return
      setSessionStats((prev) => {
        const fps = next.fps
        let fpsMin = prev.fpsMin
        let fpsMax = prev.fpsMax
        let fpsAvg = prev.fpsAvg
        if (fps !== undefined) {
          fpsSumRef.current.sum += fps
          fpsSumRef.current.count += 1
          fpsMin = Math.min(prev.fpsMin, fps)
          fpsMax = Math.max(prev.fpsMax, fps)
          fpsAvg = fpsSumRef.current.sum / fpsSumRef.current.count
        }
        return {
          fpsMin,
          fpsMax,
          fpsAvg,
          cpuPeak: Math.max(prev.cpuPeak, next.cpuPercent ?? 0),
          gpuPeak: Math.max(prev.gpuPeak, next.gpuPercent ?? 0),
          ramPeakMb: Math.max(prev.ramPeakMb, next.memoryMb ?? 0),
          vramPeakMb: Math.max(prev.vramPeakMb, next.gpuMemoryMb ?? 0),
          samples: prev.samples + 1
        }
      })
    })
    const offReport = window.api.performance.onReport((next) => {
      if (next.gameId === game.id) setReport(next)
    })
    // Crash history badge.
    void window.api.system.crashStats(game.id).then((s) => {
      if (!cancelled) setCrashStats(s)
    })
    const offCrash = window.api.system.onCrashRecorded((r) => {
      if (r.gameId !== game.id) return
      void window.api.system.crashStats(game.id).then(setCrashStats)
    })
    return () => {
      cancelled = true
      offSample()
      offReport()
      offCrash()
    }
  }, [game.id])

  // Reset session stats when a brand-new run starts (uptime resets to ~0).
  useEffect(() => {
    if (!sample) return
    if (sample.elapsedSeconds < 3 && sessionStats.samples > 5) {
      fpsSumRef.current = { sum: 0, count: 0 }
      setSessionStats(EMPTY_STATS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample?.elapsedSeconds])

  const live = sample?.status === 'running'
  const statusLabel = useMemo(() => {
    if (live) return 'Monitorando agora'
    if (sample?.status === 'unavailable') return 'Sem PID observavel'
    if (report) return 'Relatorio final'
    return 'Aguardando proxima sessao'
  }, [live, report, sample?.status])

  return (
    <section className="relative overflow-hidden rounded-lg border border-white/10 bg-black/30 backdrop-blur-xl">
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/[0.08] via-transparent to-accent/10" />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display font-semibold text-xl flex items-center gap-3">
              <span className="w-1.5 h-7 rounded-full bg-accent shadow-[0_0_12px_rgba(94,234,212,0.7)]" />
              Desempenho
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Painel ao vivo para deixar aberto em outro monitor enquanto joga.
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                live ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-slate-300'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-300 animate-pulse' : 'bg-slate-500'}`}
              />
              {statusLabel}
            </div>
            {crashStats && crashStats.total > 0 && (
              <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-rose-400/15 text-rose-300 border border-rose-500/30">
                <AlertTriangle className="w-3 h-3" />
                {crashStats.total} crash{crashStats.total === 1 ? '' : 'es'} registrado
                {crashStats.total === 1 ? '' : 's'}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <Metric
            icon={Cpu}
            label="CPU"
            value={sample?.cpuPercent !== undefined ? `${Math.round(sample.cpuPercent)}%` : '--'}
            hint={sample?.processName ?? sample?.emulatorName ?? game.emulator ?? 'processo'}
          />
          <Metric
            icon={Gauge}
            label="GPU"
            value={sample?.gpuPercent !== undefined ? `${Math.round(sample.gpuPercent)}%` : '--'}
            hint={
              sample?.gpuMemoryMb !== undefined
                ? `VRAM ${sample.gpuMemoryMb} MB`
                : 'engine 3D'
            }
          />
          <Metric
            icon={Activity}
            label="FPS"
            value={sample?.fps !== undefined ? `${sample.fps.toFixed(1)}` : '--'}
            hint={sample?.fps !== undefined ? 'do título do emulador' : 'não exposto'}
            tone={
              sample?.fps !== undefined
                ? sample.fps < 30
                  ? 'text-rose-300'
                  : sample.fps < 55
                    ? 'text-amber-300'
                    : 'text-emerald-300'
                : undefined
            }
          />
          <Metric
            icon={MemoryStick}
            label="RAM do jogo"
            value={sample?.memoryMb !== undefined ? `${sample.memoryMb} MB` : '--'}
            hint={sample?.privateMemoryMb !== undefined ? `privada ${sample.privateMemoryMb} MB` : 'working set'}
          />
          <Metric
            icon={Gauge}
            label="RAM do PC"
            value={
              sample?.systemMemoryUsedPercent !== undefined
                ? `${sample.systemMemoryUsedPercent}%`
                : '--'
            }
            hint="uso geral do sistema"
          />
          <Metric
            icon={Activity}
            label="Sessao"
            value={sample ? formatDuration(sample.elapsedSeconds) : '--'}
            hint={sample?.responding === false ? 'sem responder' : 'responsivo'}
            tone={sample?.responding === false ? 'text-amber-300' : undefined}
          />
        </div>

        {/* Session aggregates — live min/avg/max + peaks. Empty until enough
            samples have come in. */}
        {sessionStats.samples > 3 && (
          <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
              <Sparkles className="w-3 h-3" /> Estatísticas da sessão ({sessionStats.samples} amostras)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {sessionStats.fpsMax > 0 && (
                <SessionStat
                  label="FPS"
                  value={`${sessionStats.fpsAvg.toFixed(0)} avg`}
                  detail={`${isFinite(sessionStats.fpsMin) ? sessionStats.fpsMin.toFixed(0) : '?'} / ${sessionStats.fpsMax.toFixed(0)} min/max`}
                  tone={
                    sessionStats.fpsAvg < 30
                      ? 'text-rose-300'
                      : sessionStats.fpsAvg < 50
                        ? 'text-amber-300'
                        : 'text-emerald-300'
                  }
                />
              )}
              {sessionStats.cpuPeak > 0 && (
                <SessionStat
                  label="CPU peak"
                  value={`${Math.round(sessionStats.cpuPeak)}%`}
                  detail="ao longo da sessão"
                  tone={sessionStats.cpuPeak > 90 ? 'text-rose-300' : undefined}
                />
              )}
              {sessionStats.gpuPeak > 0 && (
                <SessionStat
                  label="GPU peak"
                  value={`${Math.round(sessionStats.gpuPeak)}%`}
                  detail="engine 3D"
                  tone={sessionStats.gpuPeak > 95 ? 'text-amber-300' : undefined}
                />
              )}
              {sessionStats.ramPeakMb > 0 && (
                <SessionStat
                  label="RAM peak"
                  value={`${sessionStats.ramPeakMb} MB`}
                  detail={
                    sessionStats.vramPeakMb > 0 ? `VRAM ${sessionStats.vramPeakMb} MB` : 'working set'
                  }
                />
              )}
            </div>
          </div>
        )}

        {sample?.note && (
          <div className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
            {sample.note}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg bg-white/[0.04] border border-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Monitor className="w-4 h-4 text-accent" /> Leitura ao vivo
            </div>
            <div className="mt-3 h-16 flex items-end gap-1">
              <Bar value={sample?.cpuPercent} color="bg-accent" />
              <Bar value={sample?.gpuPercent} color="bg-emerald-300" />
              <Bar value={sample?.fps !== undefined ? (sample.fps / 60) * 100 : undefined} color="bg-amber-300" />
              <Bar value={sample?.memoryMb ? Math.min(100, sample.memoryMb / 64) : undefined} color="bg-sky-400" />
              <Bar value={sample?.systemMemoryUsedPercent} color="bg-fuchsia-300" />
            </div>
            <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
              <span>CPU</span>
              <span>GPU</span>
              <span>FPS</span>
              <span>RAM jogo</span>
              <span>RAM PC</span>
            </div>
          </div>

          <div className="rounded-lg bg-white/[0.04] border border-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <BrainCircuit className="w-4 h-4 text-accent" /> Diagnostico final
            </div>
            {report ? (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <Summary label="Media CPU" value={formatMaybePercent(report.averages.cpuPercent)} />
                  <Summary label="Pico CPU" value={formatMaybePercent(report.peaks.cpuPercent)} />
                  <Summary label="Pico RAM" value={report.peaks.memoryMb ? `${Math.round(report.peaks.memoryMb)} MB` : '--'} />
                </div>
                <TextList icon={Activity} items={report.diagnostics} />
                <TextList icon={Sparkles} items={report.suggestions} accent />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Ao fechar o jogo, o GameHub gera um resumo com gargalos provaveis e sugestoes.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone
}: {
  icon: typeof Cpu
  label: string
  value: string
  hint: string
  tone?: string
}): JSX.Element {
  return (
    <div className="rounded-lg bg-white/[0.05] border border-white/5 p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-slate-500">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`mt-2 text-2xl font-display font-bold ${tone ?? 'text-white'}`}>{value}</div>
      <div className="text-[11px] text-slate-500 truncate">{hint}</div>
    </div>
  )
}

function SessionStat({
  label,
  value,
  detail,
  tone
}: {
  label: string
  value: string
  detail: string
  tone?: string
}): JSX.Element {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-base font-mono font-semibold ${tone ?? 'text-slate-100'}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{detail}</div>
    </div>
  )
}

function Bar({ value, color }: { value?: number; color: string }): JSX.Element {
  const height = value === undefined ? 8 : Math.max(8, Math.min(100, value))
  return <div className={`w-10 rounded-t ${color}`} style={{ height: `${height}%`, opacity: value === undefined ? 0.25 : 0.9 }} />
}

function Summary({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-md bg-black/20 px-2 py-2">
      <div className="text-slate-500">{label}</div>
      <div className="text-slate-100 font-semibold mt-0.5">{value}</div>
    </div>
  )
}

function TextList({
  icon: Icon,
  items,
  accent
}: {
  icon: typeof Activity
  items: string[]
  accent?: boolean
}): JSX.Element {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-xs text-slate-300 leading-relaxed">
          <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${accent ? 'text-accent' : 'text-slate-500'}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function formatMaybePercent(value?: number): string {
  return value === undefined ? '--' : `${Math.round(value)}%`
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}min ${rest}s` : `${minutes}min`
}

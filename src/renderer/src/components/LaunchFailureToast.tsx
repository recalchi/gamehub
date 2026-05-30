import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertOctagon,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileText,
  Loader2,
  X
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { AutoInstallProgress, LaunchFailedEvent } from '@shared/types'

/**
 * Listens globally for launch-failed broadcasts and renders a stacking toast.
 *
 * We auto-dismiss after 12s but keep them visible long enough for the user to
 * click "Ver logs" if they want diagnostics. Stack is capped at 3 to avoid
 * runaway when an emulator keeps crashing in a loop.
 */

interface Toast extends LaunchFailedEvent {
  toastId: number
}

const MAX_TOASTS = 3
const AUTO_DISMISS_MS = 12_000
const EXPANDED_DISMISS_MS = 60_000

export default function LaunchFailureToast(): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [installProgress, setInstallProgress] = useState<AutoInstallProgress | null>(null)
  const expandedRef = useRef<Set<number>>(new Set())
  expandedRef.current = expanded
  const navigate = useNavigate()

  useEffect(() => {
    let counter = 0
    return window.api.launch.onFailed((event) => {
      const toastId = ++counter
      setToasts((cur) => [...cur, { ...event, toastId }].slice(-MAX_TOASTS))
      setTimeout(() => {
        // Keep open longer if the user expanded the output — they're reading it.
        if (expandedRef.current.has(toastId)) {
          setTimeout(() => dismissById(toastId), EXPANDED_DISMISS_MS - AUTO_DISMISS_MS)
        } else {
          dismissById(toastId)
        }
      }, AUTO_DISMISS_MS)
    })
  }, [])

  useEffect(() => {
    return window.api.system.onAutoInstallProgress((p) => {
      setInstallProgress(p)
      if (p.state === 'done') {
        // Linger briefly so user sees success, then clear
        setTimeout(() => setInstallProgress(null), 2500)
      } else if (p.state === 'failed') {
        setTimeout(() => setInstallProgress(null), 6000)
      }
    })
  }, [])

  async function startInstall(emulatorId: string, displayName: string): Promise<void> {
    setInstallProgress({
      emulatorId: emulatorId as AutoInstallProgress['emulatorId'],
      emulatorName: displayName,
      state: 'downloading',
      received: 0
    })
    await window.api.system.autoInstallEmulator(
      emulatorId as AutoInstallProgress['emulatorId'],
      displayName
    )
  }

  function dismissById(id: number): void {
    setToasts((cur) => cur.filter((t) => t.toastId !== id))
    setExpanded((cur) => {
      const next = new Set(cur)
      next.delete(id)
      return next
    })
  }

  function toggleExpand(id: number): void {
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function copyOutput(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // clipboard write can fail silently — user can still read it on screen
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-[70] space-y-2 max-w-md pointer-events-none">
      <AnimatePresence>
        {installProgress && (
          <motion.div
            key="install-progress"
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 100, opacity: 0 }}
            className={`glass rounded-lg p-3 pointer-events-auto shadow-2xl border ${
              installProgress.state === 'failed'
                ? 'border-rose-500/40 bg-rose-950/40'
                : installProgress.state === 'done'
                  ? 'border-emerald-500/40 bg-emerald-950/40'
                  : 'border-accent/40 bg-ink-900/80'
            }`}
          >
            <div className="flex items-start gap-3">
              {installProgress.state === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-300 mt-0.5" />
              ) : installProgress.state === 'failed' ? (
                <AlertOctagon className="w-4 h-4 text-rose-300 mt-0.5" />
              ) : (
                <Loader2 className="w-4 h-4 text-accent animate-spin mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-100">
                  {installProgress.state === 'done'
                    ? `${installProgress.emulatorName} instalado!`
                    : installProgress.state === 'failed'
                      ? `Falha ao instalar ${installProgress.emulatorName}`
                      : installProgress.state === 'downloading'
                        ? `Baixando ${installProgress.emulatorName}…`
                        : installProgress.state === 'extracting'
                          ? `Extraindo ${installProgress.emulatorName}…`
                          : `Registrando ${installProgress.emulatorName}…`}
                </div>
                {installProgress.state === 'downloading' && installProgress.total ? (
                  <div className="mt-1">
                    <div className="h-1.5 bg-ink-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{
                          width: `${Math.round((installProgress.received / installProgress.total) * 100)}%`
                        }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {(installProgress.received / 1024 / 1024).toFixed(1)} /{' '}
                      {(installProgress.total / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                ) : null}
                {installProgress.state === 'failed' && installProgress.error && (
                  <div className="text-[11px] text-rose-200/80 mt-0.5">{installProgress.error}</div>
                )}
                {installProgress.state === 'done' && (
                  <div className="text-[11px] text-emerald-200/80 mt-0.5">
                    Clique em Jogar de novo — agora vai abrir com {installProgress.emulatorName}.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
        {toasts.map((t) => {
          const isExpanded = expanded.has(t.toastId)
          const hasOutput = !!t.output && t.output.trim().length > 0
          return (
            <motion.div
              key={t.toastId}
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 100, opacity: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              className="glass border border-rose-500/40 bg-rose-950/40 rounded-lg p-4 pointer-events-auto shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <AlertOctagon className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-rose-100">
                    {t.gameTitle} fechou inesperadamente
                  </div>
                  <div className="text-[11px] text-rose-200/80 mt-0.5">
                    {t.emulatorName} encerrou em {t.seconds}s com código {t.code ?? '?'}. Verifique
                    BIOS / arquivo / config.
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {t.installOffer && (
                      <button
                        onClick={() => {
                          dismissById(t.toastId)
                          void startInstall(
                            t.installOffer!.emulatorId,
                            t.installOffer!.emulatorName
                          )
                        }}
                        className="text-[11px] bg-accent/90 hover:bg-accent text-ink-950 inline-flex items-center gap-1 px-2 py-1 rounded font-semibold shadow-glow"
                      >
                        <Download className="w-3 h-3" /> Instalar {t.installOffer.emulatorName}
                      </button>
                    )}
                    {hasOutput && (
                      <button
                        onClick={() => toggleExpand(t.toastId)}
                        className="text-[11px] text-rose-200 hover:text-white inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                        {isExpanded ? 'Ocultar saída' : 'Mostrar saída'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        dismissById(t.toastId)
                        navigate('/settings')
                      }}
                      className="text-[11px] text-rose-200 hover:text-white inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5"
                    >
                      <FileText className="w-3 h-3" /> Ver logs
                    </button>
                  </div>
                  {isExpanded && hasOutput && (
                    <div className="mt-2 relative">
                      <pre className="max-h-48 overflow-auto text-[10px] leading-tight text-rose-100/90 bg-black/40 rounded p-2 font-mono whitespace-pre-wrap break-all">
                        {t.output}
                      </pre>
                      <button
                        onClick={() => copyOutput(t.output ?? '')}
                        title="Copiar saída"
                        className="absolute top-1 right-1 text-rose-200/70 hover:text-white p-1 rounded hover:bg-white/10"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => dismissById(t.toastId)}
                  className="text-rose-200/60 hover:text-rose-100 -mt-1 -mr-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

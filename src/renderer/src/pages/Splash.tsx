import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Gamepad2, SkipForward } from 'lucide-react'
import AnimatedBackground from '../components/AnimatedBackground'
import { useLibraryStore } from '../store/library'

/**
 * The splash never blocks UX. It must:
 *   - render immediately (no awaits before paint)
 *   - kick off init + scan asynchronously in the background
 *   - navigate to /home as soon as init completes, or after 4s (whichever is first)
 *   - never hang longer than HARD_TIMEOUT_MS even if everything errors
 *   - always expose a Skip button so the user can bail
 *   - surface errors visibly instead of swallowing them
 *
 * The full scan continues in the background after navigation; Home shows a
 * progress banner while it runs.
 */

const MIN_DISPLAY_MS = 2200
const HARD_TIMEOUT_MS = 15000

type Status =
  | { kind: 'init'; label: string }
  | { kind: 'ready'; label: string }
  | { kind: 'error'; label: string }

export default function Splash(): JSX.Element {
  const navigate = useNavigate()
  const initStore = useLibraryStore((s) => s.init)
  const scan = useLibraryStore((s) => s.scan)
  const progress = useLibraryStore((s) => s.progress)
  const [status, setStatus] = useState<Status>({ kind: 'init', label: 'Inicializando...' })
  const [navigated, setNavigated] = useState(false)

  // Hard safety: navigate after HARD_TIMEOUT_MS no matter what.
  useEffect(() => {
    const t = setTimeout(() => goHome('hard-timeout'), HARD_TIMEOUT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function goHome(reason: string): void {
    if (navigated) return
    setNavigated(true)
    // Fire-and-forget the renderer-side log so it shows up next to main logs
    window.api?.system?.log?.('info', 'splash', `navigating home: ${reason}`)
    navigate('/home', { replace: true })
  }

  useEffect(() => {
    const tStart = Date.now()
    let cancelled = false

    async function boot(): Promise<void> {
      // Sanity: if preload failed to load (window.api missing), surface it
      // immediately — this is the #1 reason a splash would otherwise hang.
      if (typeof window.api === 'undefined') {
        setStatus({
          kind: 'error',
          label: 'Erro: bridge IPC indisponível (preload não carregou).'
        })
        return
      }

      try {
        setStatus({ kind: 'init', label: 'Carregando biblioteca em cache...' })
        await initStore()
        if (cancelled) return

        // Trigger a fresh background scan (don't await it — Home will show progress)
        setStatus({ kind: 'init', label: 'Escaneando jogos em segundo plano...' })
        void scan({ fresh: false }).catch((err: unknown) => {
          window.api.system.log('warn', 'splash', `scan rejected: ${String(err)}`)
        })

        // Honour minimum display time so the splash never feels jarring
        const elapsed = Date.now() - tStart
        const wait = Math.max(0, MIN_DISPLAY_MS - elapsed)
        await new Promise((r) => setTimeout(r, wait))
        if (cancelled) return

        setStatus({ kind: 'ready', label: 'Pronto.' })
        goHome('boot-complete')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        window.api?.system?.log?.('error', 'splash', `boot failed: ${msg}`)
        setStatus({ kind: 'error', label: `Falha no boot: ${msg}` })
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Skip on any key
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        goHome('user-skip')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigated])

  const liveLabel =
    progress.phase !== 'idle' && progress.phase !== 'done'
      ? `${labelForProgress(progress.phase)} (${progress.scanned})`
      : status.label

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950 flex flex-col items-center justify-center">
      <AnimatedBackground />

      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center"
      >
        <motion.div
          animate={{ rotate: [0, 6, -6, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="text-accent mb-6"
        >
          <Gamepad2 className="w-24 h-24 drop-shadow-[0_0_30px_rgba(94,234,212,0.6)]" />
        </motion.div>

        <h1 className="font-display text-6xl font-bold tracking-[0.2em] logo-gradient">
          GAMEHUB
        </h1>
        <p className="text-slate-400 mt-2 text-sm tracking-widest uppercase">
          Your console. On your PC.
        </p>

        <div className="mt-10 w-80">
          <div className="h-1 rounded-full bg-white/5 overflow-hidden relative">
            <motion.div
              className={`h-full ${
                status.kind === 'error'
                  ? 'bg-rose-400'
                  : 'bg-gradient-to-r from-accent via-cyan-400 to-fuchsia-400'
              }`}
              initial={{ width: '0%' }}
              animate={{
                width:
                  status.kind === 'ready' ? '100%' : status.kind === 'error' ? '100%' : '70%'
              }}
              transition={{ duration: 1.4, ease: 'easeOut', repeat: status.kind === 'init' ? Infinity : 0, repeatType: 'reverse' }}
            />
          </div>
          <div
            className={`text-center text-xs mt-3 font-mono tracking-wider min-h-[1rem] flex items-center justify-center gap-2 ${
              status.kind === 'error' ? 'text-rose-300' : 'text-slate-400'
            }`}
          >
            {status.kind === 'error' && <AlertTriangle className="w-3 h-3" />}
            {liveLabel}
          </div>
        </div>

        <button
          onClick={() => goHome('skip-button')}
          className="mt-8 text-xs flex items-center gap-1.5 px-4 py-2 rounded-full glass text-slate-300 hover:text-white hover:bg-white/10 transition-all"
        >
          <SkipForward className="w-3 h-3" /> Pular agora
        </button>

        {status.kind === 'error' && (
          <p className="mt-4 text-xs text-slate-500 max-w-md text-center">
            Abra o DevTools (F12) para ver detalhes. O app continuará — mas algumas
            funções podem não trabalhar até o problema ser resolvido.
          </p>
        )}
      </motion.div>
    </div>
  )
}

function labelForProgress(phase: string): string {
  switch (phase) {
    case 'enumerating':
      return 'Lendo arquivos'
    case 'classifying':
      return 'Classificando'
    case 'enriching':
      return 'Enriquecendo metadados'
    default:
      return 'Escaneando'
  }
}

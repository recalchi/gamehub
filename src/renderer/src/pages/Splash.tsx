import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Gamepad2, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useLibraryStore } from '../store/library'
import { M, easings } from '../motion/tokens'
import {
  getOrCreateContext,
  playSplashBoot,
  playSplashLogo
} from '../audio/engine'
import type { LogEntry } from '@shared/types'

/**
 * Splash / boot sequence.
 *
 * Two visual stages: a focused logo intro (~1.2s) then the diagnostics panel.
 * Boot progress is driven by the REAL scan progress (no fake setInterval
 * sweep that lied to the user) — `bootProgress` = composed of init weight
 * (22%) + scan weight (60%) + ready (18%).
 *
 * Sound is one master AudioContext for the whole splash so the logo chime
 * and the boot chime sit on the same timeline — no drift between them, no
 * second context that fails autoplay independently.
 */
const MIN_DISPLAY_MS = 1400 // floor — splash never feels rushed
const HARD_TIMEOUT_MS = 22000 // ceiling — never block beyond this
const LOGO_DISPLAY_MS = 1200
// Pre-warm covers for this many recently-played games before letting the
// user reach Home. Trade-off: ~1-2s extra splash, but Home renders with
// art already in place instead of placeholders fading in afterward.
const PRIORITY_COVER_COUNT = 10

type Status =
  | { kind: 'init'; label: string }
  | { kind: 'ready'; label: string }
  | { kind: 'error'; label: string }

const BOOT_LINES = [
  'BOOTROM GAMEHUB/PC',
  'INPUT BUS: XINPUT + WEBGAMEPAD',
  'LIBRARY CACHE: MOUNTING',
  'COVER PIPELINE: WARM',
  'DISCORD PRESENCE: STANDBY',
  'PERFORMANCE MONITOR: ARMED'
]

export default function Splash(): JSX.Element {
  const navigate = useNavigate()
  const initStore = useLibraryStore((s) => s.init)
  const scan = useLibraryStore((s) => s.scan)
  const progress = useLibraryStore((s) => s.progress)
  const settings = useLibraryStore((s) => s.settings)
  const [status, setStatus] = useState<Status>({ kind: 'init', label: 'Inicializando sistema' })
  const [navigated, setNavigated] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [bootProgress, setBootProgress] = useState(8)
  const [stage, setStage] = useState<'logo' | 'loading'>('logo')
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([])
  // Master AudioContext shared between logo and boot chimes — guarantees both
  // sit on the same timeline so they never drift or double-attack.
  const audioRef = useRef<AudioContext | null>(null)

  const showRealLogs = settings?.appearance.showRealBootLogs ?? false

  // Tail real main-process logs into the diagnostics panel when the user
  // opted into "show real boot logs". We cap at the last 6 entries so the
  // list height matches the canned BOOT_LINES layout — drop-in replacement.
  useEffect(() => {
    if (!showRealLogs) return
    const off = window.api?.system?.onLogStream?.((entry) => {
      setLiveLogs((cur) => {
        const next = [...cur, entry]
        return next.length > 6 ? next.slice(-6) : next
      })
    })
    return off
  }, [showRealLogs])

  const activeLine = useMemo(() => {
    if (status.kind === 'error') return BOOT_LINES.length - 1
    return Math.min(BOOT_LINES.length - 1, Math.floor((bootProgress / 100) * BOOT_LINES.length))
  }, [bootProgress, status.kind])

  // Real-progress-driven boot bar. `init` weight is 0-22%, `scan` weight is
  // 22-82%, `ready` lands at 100%. No more setInterval pretending to know.
  useEffect(() => {
    if (status.kind === 'ready') {
      setBootProgress(100)
      return
    }
    if (progress.phase === 'enumerating') {
      const cap = 42
      setBootProgress((prev) => Math.max(prev, Math.min(cap, 22 + Math.log10(progress.scanned + 1) * 6)))
    } else if (progress.phase === 'classifying') {
      const ratio = progress.found > 0 ? progress.found / Math.max(progress.scanned, progress.found) : 0
      setBootProgress((prev) => Math.max(prev, 42 + ratio * 30))
    } else if (progress.phase === 'enriching') {
      setBootProgress((prev) => Math.max(prev, 72 + Math.min(10, progress.scanned / 6)))
    } else if (progress.phase === 'done') {
      setBootProgress((prev) => Math.max(prev, 90))
    }
  }, [progress, status.kind])

  // Stage transition: logo → loading. Audio is scheduled on the same context
  // so the boot chime starts exactly when the logo chime resolves.
  //
  // Autoplay is locked by the browser until the first user gesture. We
  // arm an immediate gesture listener so the audio fires as soon as the
  // user does literally anything (hover, key, click) — even if that
  // happens after the logo has appeared, we replay the sequence so they
  // never miss the chime.
  useEffect(() => {
    if (!soundEnabled) return
    let played = false
    let cancelled = false

    async function trigger(): Promise<void> {
      if (played || cancelled) return
      const ctx = await getOrCreateContext(audioRef)
      if (!ctx || ctx.state !== 'running' || cancelled) return
      played = true
      const t0 = ctx.currentTime + 0.05
      const logoDurationS = LOGO_DISPLAY_MS / 1000
      playSplashLogo(ctx, { startAt: t0 })
      // Schedule boot chime on the SAME context's clock — no setTimeout drift.
      playSplashBoot(ctx, { startAt: t0 + logoDurationS })
      // Stage transition gated by the audio clock — schedule visual swap at
      // the same audio time the boot chime fires. Conversion to ms via
      // performance.now offset keeps drift bounded to one frame.
      const audioOffsetMs = (t0 + logoDurationS - ctx.currentTime) * 1000
      window.setTimeout(() => {
        if (!cancelled) setStage('loading')
      }, Math.max(audioOffsetMs, 0))
    }

    // Try immediately (works if user interacted earlier — e.g. clicked the
    // app icon and the page already had focus). If it fails, arm gesture
    // listeners that retry on the first user input.
    void trigger()
    const onGesture = (): void => {
      void trigger()
    }
    window.addEventListener('pointerdown', onGesture, { once: true })
    window.addEventListener('keydown', onGesture, { once: true })
    window.addEventListener('touchstart', onGesture, { once: true })

    const stageTimer = window.setTimeout(() => setStage('loading'), LOGO_DISPLAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(stageTimer)
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown', onGesture)
      window.removeEventListener('touchstart', onGesture)
    }
  }, [soundEnabled])

  useEffect(() => {
    const t = setTimeout(() => goHome('hard-timeout'), HARD_TIMEOUT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function goHome(reason: string): void {
    if (navigated) return
    setNavigated(true)
    window.api?.system?.log?.('info', 'splash', `navigating home: ${reason}`)
    // Close the audio context on transition out so we don't leak the device.
    if (audioRef.current && audioRef.current.state !== 'closed') {
      audioRef.current.close().catch(() => undefined)
    }
    navigate('/home', { replace: true })
  }

  useEffect(() => {
    const tStart = Date.now()
    let cancelled = false

    async function boot(): Promise<void> {
      if (typeof window.api === 'undefined') {
        setStatus({ kind: 'error', label: 'Erro: bridge IPC indisponivel' })
        return
      }

      try {
        setStatus({ kind: 'init', label: 'Carregando biblioteca local' })
        setBootProgress(22)
        await initStore()
        if (cancelled) return

        // Race the filesystem scan against a 4s deadline. If the drive is
        // fast and library is small, scan wins → Home renders complete.
        // If scan exceeds 4s (large library / slow disk), we give up and
        // let it finish in the background; the ScanBanner on Home shows
        // progress while the user can already navigate.
        setStatus({ kind: 'init', label: 'Sincronizando catálogo' })
        const scanPromise = scan({ fresh: false }).catch((err: unknown) => {
          window.api.system.log('warn', 'splash', `scan rejected: ${String(err)}`)
          return null
        })
        const scanDeadline = new Promise((r) => setTimeout(r, 4000))
        await Promise.race([scanPromise, scanDeadline])
        if (cancelled) return

        // Warm covers for the visible-on-Home games. Library may be from
        // either the just-finished scan or the on-disk snapshot — both work
        // for prioritisation.
        setStatus({ kind: 'init', label: 'Carregando capas dos jogos recentes' })
        const data = await window.api.library.list()
        const recents = pickHomePriorityGames(data.games, PRIORITY_COVER_COUNT)
        if (recents.length > 0) {
          const enrichPromise = window.api.library.enrichGames(recents)
          const timeout = new Promise((r) => setTimeout(r, 1200))
          await Promise.race([enrichPromise, timeout])
        }
        if (cancelled) return

        const elapsed = Date.now() - tStart
        const wait = Math.max(0, MIN_DISPLAY_MS - elapsed)
        await new Promise((r) => setTimeout(r, wait))
        if (cancelled) return

        setStatus({ kind: 'ready', label: 'Sistema pronto' })
        await new Promise((r) => setTimeout(r, 220))
        // No second scan needed — the race above already kicked one off.
        // If it didn't finish in 4s, it's still running in the main process
        // and the renderer's ScanBanner will surface progress live.
        if (!cancelled) goHome('boot-complete')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        window.api?.system?.log?.('error', 'splash', `boot failed: ${msg}`)
        setStatus({ kind: 'error', label: `Falha no boot: ${msg}` })
        setBootProgress(100)
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      ? `${labelForProgress(progress.phase)} · ${progress.scanned}`
      : status.label

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#030407] text-slate-100">
      <div className="absolute inset-0 splash-console-grid" />
      <div className="absolute inset-0 splash-scanlines opacity-35" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(94,234,212,0.14),transparent_38%),linear-gradient(180deg,rgba(3,4,7,0.1),#030407_92%)]" />

      <AnimatePresence>{stage === 'logo' && <LogoIntro />}</AnimatePresence>

      <motion.div
        animate={{ opacity: stage === 'loading' ? 1 : 0 }}
        transition={M.hero}
        className="relative z-10 h-full px-10 py-8 flex flex-col"
      >
        <header className="flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.28em] text-slate-500">
          <span>GH-OS / LOCAL BOOT</span>
          <span>{new Date().toLocaleDateString('pt-BR')}</span>
        </header>

        <main className="flex-1 grid grid-cols-[minmax(260px,0.86fr)_minmax(360px,1.14fr)] gap-10 items-center">
          <motion.section
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, ease: easings.outExpo }}
            className="min-w-0"
          >
            <div className="relative w-52 h-52 mb-8">
              <motion.div
                className="absolute inset-0 rounded-[2rem] border border-accent/30 bg-accent/5"
                animate={{ rotate: [0, 3, -2, 0], scale: [1, 1.02, 1] }}
                transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute inset-5 rounded-[1.5rem] border border-white/10 bg-black/30"
                animate={{ opacity: [0.65, 1, 0.65] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Gamepad2 className="w-24 h-24 text-accent drop-shadow-[0_0_28px_rgba(94,234,212,0.75)]" />
              </div>
              <motion.div
                className="absolute -inset-4 border border-accent/10 rounded-[2.4rem]"
                animate={{ opacity: [0.2, 0.7, 0.2] }}
                transition={{ duration: 2.4, repeat: Infinity }}
              />
            </div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, ...M.hero }}
              className="font-display text-6xl font-bold tracking-[0.16em] logo-gradient leading-none"
            >
              GAMEHUB
            </motion.h1>
            <p className="mt-4 text-sm text-slate-400 uppercase tracking-[0.34em]">
              Console mode for your PC
            </p>

            <div className="mt-10 flex items-center gap-3">
              <button
                onClick={() => goHome('skip-button')}
                className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2"
              >
                <SkipForward className="w-4 h-4" /> Pular
              </button>
              <button
                onClick={() => {
                  const next = !soundEnabled
                  setSoundEnabled(next)
                  if (next) {
                    void getOrCreateContext(audioRef).then((ctx) => {
                      if (ctx && ctx.state === 'running') {
                        playSplashBoot(ctx, { startAt: ctx.currentTime })
                      }
                    })
                  }
                }}
                className="p-2 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                title={soundEnabled ? 'Desativar som' : 'Ativar som'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, ease: easings.outExpo }}
            className="relative rounded-lg border border-white/10 bg-black/30 backdrop-blur-xl overflow-hidden"
          >
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/[0.08] via-transparent to-accent/10" />
            <div className="relative p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="font-mono text-xs uppercase tracking-[0.24em] text-accent">
                  Boot Diagnostics
                </div>
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-400/70" />
                  <span className="w-2 h-2 rounded-full bg-amber-300/70" />
                  <span className="w-2 h-2 rounded-full bg-emerald-300/70" />
                </div>
              </div>

              <div className="mt-5 space-y-2.5 font-mono text-sm min-h-[180px]">
                {showRealLogs ? (
                  liveLogs.length === 0 ? (
                    <div className="text-slate-600 italic text-xs pt-2">
                      Aguardando eventos do processo principal…
                    </div>
                  ) : (
                    liveLogs.map((entry, i) => (
                      <motion.div
                        key={`${entry.ts}-${i}`}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={M.micro}
                        className="flex items-center gap-3 text-xs"
                      >
                        <span
                          className={`w-2 h-2 rounded-sm ${
                            entry.level === 'error'
                              ? 'bg-rose-400'
                              : entry.level === 'warn'
                                ? 'bg-amber-300'
                                : 'bg-emerald-300'
                          }`}
                        />
                        <span className="text-slate-500 uppercase tracking-wider text-[10px] w-12 shrink-0">
                          {entry.scope}
                        </span>
                        <span className="text-slate-200 truncate">{entry.message}</span>
                      </motion.div>
                    ))
                  )
                ) : (
                  BOOT_LINES.map((line, index) => {
                    const done = index < activeLine || status.kind === 'ready'
                    const active = index === activeLine && status.kind === 'init'
                    return (
                      <motion.div
                        key={line}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: done || active ? 1 : 0.32, x: 0 }}
                        transition={{ delay: index * 0.06, ...M.micro }}
                        className="flex items-center gap-3"
                      >
                        <span
                          className={`w-2 h-2 rounded-sm ${
                            done ? 'bg-emerald-300' : active ? 'bg-accent animate-pulse' : 'bg-slate-700'
                          }`}
                        />
                        <span className={done || active ? 'text-slate-100' : 'text-slate-600'}>
                          {line}
                        </span>
                        <span className="ml-auto text-[10px] text-slate-600">
                          {done ? 'OK' : active ? 'RUN' : 'WAIT'}
                        </span>
                      </motion.div>
                    )
                  })
                )}
              </div>

              <div className="mt-8">
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 mb-2">
                  <span>{liveLabel}</span>
                  <span>{Math.round(bootProgress)}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className={`h-full ${
                      status.kind === 'error'
                        ? 'bg-rose-400'
                        : 'bg-gradient-to-r from-accent via-cyan-300 to-rose-300'
                    }`}
                    animate={{ width: `${bootProgress}%` }}
                    transition={{ duration: 0.35, ease: easings.outQuint }}
                  />
                </div>
              </div>

              <AnimatePresence>
                {status.kind === 'error' && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-5 rounded-md border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-sm text-rose-200 flex gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{status.label}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.section>
        </main>

        <footer className="flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.22em] text-slate-600">
          <span>Enter / A para continuar</span>
          <span>{status.kind === 'ready' ? 'READY' : status.kind === 'error' ? 'ERROR' : 'LOADING'}</span>
        </footer>
      </motion.div>
    </div>
  )
}

function LogoIntro(): JSX.Element {
  return (
    <motion.div
      key="logo-intro"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(10px)' }}
      transition={M.hero}
      className="absolute inset-0 z-30 flex items-center justify-center bg-[#030407]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(94,234,212,0.20),transparent_36%),radial-gradient(circle_at_50%_55%,rgba(167,139,250,0.10),transparent_44%)]" />
      <motion.div
        initial={{ scale: 0.86, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={M.hero}
        className="relative flex flex-col items-center"
      >
        <motion.div
          className="absolute -inset-16 rounded-full border border-accent/10"
          animate={{ scale: [0.86, 1.18], opacity: [0, 0.8, 0] }}
          transition={{ duration: 1.55, repeat: Infinity, ease: 'easeOut' }}
        />
        <motion.div
          className="relative h-32 w-32 rounded-[2rem] border border-accent/30 bg-accent/10 flex items-center justify-center shadow-[0_0_52px_rgba(94,234,212,0.28)]"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Gamepad2 className="h-16 w-16 text-accent drop-shadow-[0_0_24px_rgba(94,234,212,0.9)]" />
        </motion.div>
        <motion.h1
          initial={{ letterSpacing: '0.42em', opacity: 0 }}
          animate={{ letterSpacing: '0.18em', opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.65, ease: easings.outExpo }}
          className="mt-8 font-display text-6xl font-bold logo-gradient"
        >
          GAMEHUB
        </motion.h1>
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 220, opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.55 }}
          className="mt-5 h-px bg-gradient-to-r from-transparent via-accent to-transparent"
        />
      </motion.div>
    </motion.div>
  )
}

/**
 * Pick the games that need their covers warmed before Home is shown.
 * Order: recently-played → favorited → first N ready games.
 */
function pickHomePriorityGames(games: import('@shared/types').Game[], limit: number): string[] {
  const pool: import('@shared/types').Game[] = []
  const seen = new Set<string>()
  const add = (g: import('@shared/types').Game): void => {
    if (g.cover) return // already cached, no fetch needed
    if (seen.has(g.id)) return
    seen.add(g.id)
    pool.push(g)
  }
  for (const g of [...games].sort((a, b) =>
    (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '')
  )) {
    if (g.lastPlayedAt) add(g)
  }
  for (const g of games) if (g.favorite) add(g)
  for (const g of games) if (g.status === 'ready') add(g)
  return pool.slice(0, limit).map((g) => g.id)
}

function labelForProgress(phase: string): string {
  switch (phase) {
    case 'enumerating':
      return 'Lendo arquivos'
    case 'classifying':
      return 'Classificando jogos'
    case 'enriching':
      return 'Atualizando capas'
    default:
      return 'Escaneando biblioteca'
  }
}

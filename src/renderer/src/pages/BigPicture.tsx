import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Cpu, Gamepad2, LogOut, Play } from 'lucide-react'
import AnimatedBackground from '../components/AnimatedBackground'
import { useLibraryStore } from '../store/library'
import { useGamepad } from '../hooks/useGamepad'
import { PLATFORM_LIST, PLATFORMS } from '@shared/platforms'
import type { Game, PlatformId } from '@shared/types'

/**
 * Big Picture / XMB-style fullscreen mode.
 *
 * Layout (PS3 XMB inspired):
 *   - Top half: horizontal row of platform icons. The focused platform sits
 *     dead center, larger and glowing. Adjacent platforms shrink and fade.
 *   - Bottom half: horizontal row of games for the focused platform, same
 *     focus-zoom treatment.
 *
 * Navigation:
 *   - Up/Down (DPAD or arrow keys / W/S) switches between "platform row" and
 *     "game row"
 *   - Left/Right (or A/D) moves within the active row
 *   - A / Enter launches the focused game (or, when on platform row, drops
 *     focus into the game row of that platform)
 *   - B / Backspace / Esc returns to the standard UI
 *
 * The mouse is intentionally not the primary input here — this is the
 * "across the room with a controller" mode.
 */

type Row = 'platforms' | 'games'

export default function BigPicture(): JSX.Element {
  const navigate = useNavigate()
  const games = useLibraryStore((s) => s.games)
  const launch = useLibraryStore((s) => s.launch)
  const [now, setNow] = useState(() => new Date())
  const [row, setRow] = useState<Row>('platforms')
  const [platformIdx, setPlatformIdx] = useState(0)
  const [gameIdx, setGameIdx] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30)
    return () => clearInterval(t)
  }, [])

  // Enter fullscreen on mount, restore on unmount. We remember the previous
  // state in a ref so users who entered Big Picture from a fullscreen-on-start
  // session don't get the window collapsed when they exit.
  useEffect(() => {
    let wasFullscreen = false
    ;(async () => {
      wasFullscreen = await window.api.system.isFullscreen()
      if (!wasFullscreen) await window.api.system.setFullscreen(true)
    })()
    return () => {
      void (async () => {
        const isFs = await window.api.system.isFullscreen()
        if (isFs && !wasFullscreen) await window.api.system.setFullscreen(false)
      })()
    }
  }, [])

  // Platforms that actually have games — XMB only shows what you own
  const platforms = useMemo(() => {
    const counts = new Map<PlatformId, Game[]>()
    for (const g of games) {
      if (g.platform === 'unknown') continue
      const arr = counts.get(g.platform) ?? []
      arr.push(g)
      counts.set(g.platform, arr)
    }
    return PLATFORM_LIST.filter((p) => counts.has(p.id)).map((p) => ({
      ...p,
      games: counts.get(p.id) ?? []
    }))
  }, [games])

  const currentPlatform = platforms[platformIdx]
  const currentGames = currentPlatform?.games ?? []
  const currentGame = currentGames[gameIdx]

  // Reset game index when switching platforms
  useEffect(() => {
    setGameIdx(0)
  }, [platformIdx])

  function flash(msg: string): void {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 3000)
  }

  async function launchCurrent(): Promise<void> {
    if (!currentGame) return
    flash(`Iniciando ${currentGame.title}…`)
    const r = await launch(currentGame.id)
    if (!r.ok) flash(r.error ?? 'Falha ao iniciar.')
  }

  function exitMode(): void {
    navigate('/home')
  }

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
          if (row === 'platforms') setPlatformIdx((i) => Math.max(0, i - 1))
          else setGameIdx((i) => Math.max(0, i - 1))
          break
        case 'ArrowRight':
        case 'd':
          if (row === 'platforms') setPlatformIdx((i) => Math.min(platforms.length - 1, i + 1))
          else setGameIdx((i) => Math.min(currentGames.length - 1, i + 1))
          break
        case 'ArrowUp':
        case 'w':
          setRow('platforms')
          break
        case 'ArrowDown':
        case 's':
          if (currentGames.length > 0) setRow('games')
          break
        case 'Enter':
          if (row === 'platforms' && currentGames.length > 0) setRow('games')
          else if (row === 'games') void launchCurrent()
          break
        case 'Escape':
        case 'Backspace':
          exitMode()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, platforms.length, currentGames.length])

  // Gamepad — share the global hook
  useGamepad({
    onLeft: () =>
      row === 'platforms'
        ? setPlatformIdx((i) => Math.max(0, i - 1))
        : setGameIdx((i) => Math.max(0, i - 1)),
    onRight: () =>
      row === 'platforms'
        ? setPlatformIdx((i) => Math.min(platforms.length - 1, i + 1))
        : setGameIdx((i) => Math.min(currentGames.length - 1, i + 1)),
    onUp: () => setRow('platforms'),
    onDown: () => currentGames.length > 0 && setRow('games'),
    onConfirm: () => {
      if (row === 'platforms' && currentGames.length > 0) setRow('games')
      else if (row === 'games') void launchCurrent()
    },
    onBack: exitMode
  })

  if (platforms.length === 0) {
    return (
      <div className="h-full w-full bg-ink-950 flex items-center justify-center text-slate-400">
        <p>Nenhum jogo na biblioteca para o modo TV.</p>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-ink-950 overflow-hidden relative text-slate-100">
      <AnimatedBackground />

      {/* Top-right clock + exit hint */}
      <div className="absolute top-6 right-10 z-20 flex items-center gap-6 text-right">
        <div>
          <div className="font-display text-4xl tracking-wider">
            {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-xs text-slate-400 uppercase tracking-widest">
            {now.toLocaleDateString('pt-BR', {
              weekday: 'short',
              day: '2-digit',
              month: 'short'
            })}
          </div>
        </div>
        <button
          onClick={exitMode}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5"
          title="Sair do modo TV (B / Esc)"
        >
          <LogOut className="w-3.5 h-3.5" /> Sair
        </button>
      </div>

      {/* Top-left mode badge */}
      <div className="absolute top-6 left-10 z-20 text-xs uppercase tracking-[0.4em] text-accent/80 font-display flex items-center gap-2">
        <Gamepad2 className="w-4 h-4" /> Modo TV
      </div>

      {/* Platform row */}
      <div className="absolute inset-x-0 top-1/4 z-10">
        <PlatformRow
          platforms={platforms}
          focusedIdx={platformIdx}
          rowFocused={row === 'platforms'}
        />
      </div>

      {/* Game row */}
      <div className="absolute inset-x-0 bottom-12 z-10">
        <GameRow
          games={currentGames}
          focusedIdx={gameIdx}
          rowFocused={row === 'games'}
          platformColor={currentPlatform?.color ?? '#5eead4'}
        />
        {currentGame && (
          <div className="text-center mt-4">
            <div className="font-display text-2xl">{currentGame.title}</div>
            <div className="text-xs text-slate-400 mt-1">
              {currentPlatform?.name} ·{' '}
              <span
                className={
                  currentGame.status === 'ready'
                    ? 'text-emerald-300'
                    : currentGame.status === 'missing-bios'
                      ? 'text-amber-300'
                      : 'text-slate-500'
                }
              >
                {currentGame.status === 'ready'
                  ? 'Pronto para jogar'
                  : currentGame.status === 'missing-bios'
                    ? 'BIOS necessária'
                    : currentGame.status}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom-center hint bar */}
      <div className="absolute bottom-2 left-0 right-0 text-center text-[11px] text-slate-600 z-20 font-mono">
        <Hint k="↑↓" label="Linha" /> ·{' '}
        <Hint k="← →" label="Item" /> ·{' '}
        <Hint k="A / Enter" label={row === 'games' ? 'Jogar' : 'Jogos'} /> ·{' '}
        <Hint k="B / Esc" label="Sair" />
      </div>

      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 glass rounded-full px-5 py-2 text-sm z-30"
          >
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Hint({ k, label }: { k: string; label: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 mx-2">
      <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{k}</kbd>
      <span className="text-slate-500">{label}</span>
    </span>
  )
}

function PlatformRow({
  platforms,
  focusedIdx,
  rowFocused
}: {
  platforms: Array<typeof PLATFORM_LIST[number] & { games: Game[] }>
  focusedIdx: number
  rowFocused: boolean
}): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-8 px-12">
      {platforms.map((p, i) => {
        const distance = Math.abs(i - focusedIdx)
        const focused = i === focusedIdx
        const scale = focused ? 1 : Math.max(0.55, 1 - distance * 0.15)
        const opacity = focused ? 1 : Math.max(0.3, 1 - distance * 0.25)
        return (
          <motion.div
            key={p.id}
            animate={{ scale, opacity }}
            transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
            className="flex flex-col items-center"
            style={{ minWidth: 120 }}
          >
            <div
              className={`w-28 h-28 rounded-2xl flex items-center justify-center font-display font-bold text-2xl border-2 transition-all ${
                focused && rowFocused
                  ? 'border-accent shadow-[0_0_40px_rgba(94,234,212,0.65)]'
                  : 'border-white/10'
              }`}
              style={{
                background: `linear-gradient(150deg, ${p.color}66, ${p.color}11)`
              }}
            >
              <Cpu className="w-10 h-10" style={{ color: p.color }} />
            </div>
            <div
              className={`mt-3 text-xs uppercase tracking-widest ${focused ? 'text-white' : 'text-slate-400'}`}
            >
              {p.shortName}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{p.games.length}</div>
          </motion.div>
        )
      })}
    </div>
  )
}

function GameRow({
  games,
  focusedIdx,
  rowFocused,
  platformColor
}: {
  games: Game[]
  focusedIdx: number
  rowFocused: boolean
  platformColor: string
}): JSX.Element {
  if (games.length === 0) {
    return <div className="text-center text-slate-500 text-sm">Sem jogos nessa plataforma.</div>
  }
  return (
    <div className="flex items-center justify-center gap-6 px-12">
      {games.map((g, i) => {
        const distance = Math.abs(i - focusedIdx)
        const focused = i === focusedIdx
        const scale = focused ? 1.1 : Math.max(0.5, 1 - distance * 0.18)
        const opacity = focused ? 1 : Math.max(0.25, 1 - distance * 0.3)
        return (
          <motion.div
            key={g.id}
            animate={{ scale, opacity }}
            transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
            className="shrink-0"
          >
            <div
              className={`w-40 h-56 rounded-xl overflow-hidden border-2 transition-all ${
                focused && rowFocused
                  ? 'border-accent shadow-[0_0_40px_rgba(94,234,212,0.7)]'
                  : 'border-white/10'
              }`}
              style={{
                background: g.cover
                  ? `url(${g.cover}) center/cover`
                  : `linear-gradient(160deg, ${platformColor}cc, ${platformColor}33)`
              }}
            >
              {!g.cover && (
                <div className="h-full flex items-center justify-center text-center px-3">
                  <div className="font-display font-bold text-white text-sm">{g.title}</div>
                </div>
              )}
              {focused && rowFocused && g.status === 'ready' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play className="w-10 h-10 fill-white text-white drop-shadow-lg" />
                </div>
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Library, Play, RefreshCw, Tv } from 'lucide-react'
import type { Game } from '@shared/types'
import { PLATFORMS } from '@shared/platforms'
import { useLibraryStore } from '../store/library'

const ROTATE_INTERVAL = 9000

interface Props {
  candidates: Game[]
}

/**
 * Auto-rotating hero section for Home.
 *
 * Picks up to 5 candidates (caller chooses the pool — typically a mix of
 * recent + ready). Cross-fades between them every 9s with a slow Ken Burns
 * zoom on the cover, plus a click-bar of dots to jump manually. Pauses
 * rotation when the user manually selects one (so they can read the info).
 *
 * The hero is the visual centerpiece of Home, so we go heavy on motion
 * relative to the rest of the UI.
 */
export default function RotatingHero({ candidates }: Props): JSX.Element {
  const scan = useLibraryStore((s) => s.scan)
  const progress = useLibraryStore((s) => s.progress)
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || candidates.length <= 1) return
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % candidates.length)
    }, ROTATE_INTERVAL)
    return () => clearInterval(t)
  }, [paused, candidates.length])

  // Clamp idx if the candidate pool shrinks
  useEffect(() => {
    if (idx >= candidates.length) setIdx(0)
  }, [candidates.length, idx])

  if (candidates.length === 0) {
    return (
      <section className="px-12 pt-16 pb-12 relative">
        <h1 className="text-5xl font-display font-bold leading-tight">
          Sua biblioteca está vazia
        </h1>
        <p className="text-slate-400 mt-3 max-w-lg">
          Configure o caminho dos seus jogos em Configurações ou execute um scan novo.
        </p>
        <div className="flex gap-3 mt-8">
          <Link
            to="/settings"
            className="px-6 py-3 bg-accent text-ink-950 rounded-lg font-semibold flex items-center gap-2"
          >
            Abrir Configurações
          </Link>
          <button
            onClick={() => scan({ fresh: true })}
            className="px-6 py-3 glass rounded-lg flex items-center gap-2 hover:bg-white/10"
          >
            <RefreshCw className="w-4 h-4" /> Re-escanear
          </button>
        </div>
      </section>
    )
  }

  const current = candidates[idx]
  const platform = PLATFORMS[current.platform]

  return (
    <section
      className="px-12 pt-16 pb-12 relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Big blurred backdrop using the focused game's cover */}
      <AnimatePresence mode="wait">
        {current.cover && (
          <motion.div
            key={`bg-${current.id}`}
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 0.32, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            className="absolute inset-0 -z-10"
            style={{
              backgroundImage: `url(${current.cover})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(40px) saturate(140%)',
              transform: 'scale(1.2)'
            }}
          />
        )}
      </AnimatePresence>

      <div className="flex items-start justify-between gap-8">
        <div className="max-w-2xl flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45 }}
            >
              <p className="text-accent text-xs tracking-[0.3em] uppercase mb-3 font-display">
                {current.lastPlayedAt ? 'Continuar jogando' : 'Em destaque'}
              </p>
              <h1 className="text-5xl font-display font-bold leading-tight">
                {current.title}
              </h1>
              <p className="text-slate-400 mt-3 max-w-lg">
                {platform.name}
                {current.developer ? ` · ${current.developer}` : ''}
                {current.year ? ` · ${current.year}` : ''}
              </p>
              {current.description && (
                <p className="text-slate-500 text-sm mt-3 max-w-lg leading-relaxed line-clamp-3">
                  {current.description}
                </p>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex gap-3 mt-8">
            <Link
              to={`/game/${current.id}`}
              className="px-6 py-3 bg-accent text-ink-950 rounded-lg font-semibold flex items-center gap-2 hover:bg-accent/90 transition-all shadow-[0_0_30px_rgba(94,234,212,0.4)]"
            >
              <Play className="w-4 h-4 fill-current" /> Jogar agora
            </Link>
            <Link
              to="/library"
              className="px-6 py-3 glass rounded-lg flex items-center gap-2 hover:bg-white/10 transition-all"
            >
              <Library className="w-4 h-4" /> Biblioteca
            </Link>
            <Link
              to="/tv"
              className="px-6 py-3 glass rounded-lg flex items-center gap-2 hover:bg-white/10 transition-all"
              title="Modo console fullscreen"
            >
              <Tv className="w-4 h-4" /> Modo TV
            </Link>
            <button
              onClick={() => scan({ fresh: true })}
              disabled={progress.phase !== 'idle' && progress.phase !== 'done'}
              className="px-6 py-3 glass rounded-lg flex items-center gap-2 hover:bg-white/10 transition-all disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${progress.phase !== 'idle' && progress.phase !== 'done' ? 'animate-spin' : ''}`}
              />
              Re-escanear
            </button>
          </div>

          {/* Pagination dots */}
          {candidates.length > 1 && (
            <div className="flex items-center gap-2 mt-6">
              {candidates.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setIdx(i)
                    setPaused(true)
                    setTimeout(() => setPaused(false), 12_000)
                  }}
                  className={`h-1 rounded-full transition-all ${
                    i === idx ? 'w-10 bg-accent' : 'w-3 bg-white/15 hover:bg-white/30'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Ken Burns cover */}
        <div className="hidden lg:block shrink-0 w-56 h-80 relative">
          <AnimatePresence>
            <motion.div
              key={current.id}
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: 1, scale: 1.08 }}
              exit={{ opacity: 0, scale: 1.08 }}
              transition={{
                opacity: { duration: 0.5 },
                scale: { duration: ROTATE_INTERVAL / 1000, ease: 'linear' }
              }}
              className="absolute inset-0 rounded-xl overflow-hidden border border-white/10 shadow-2xl"
              style={{
                background: current.cover
                  ? `url(${current.cover}) center/cover`
                  : `linear-gradient(160deg, ${platform.color}, ${platform.color}55)`
              }}
            >
              {!current.cover && (
                <div className="h-full flex items-center justify-center text-center px-3">
                  <div className="text-white font-display font-bold">{current.title}</div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

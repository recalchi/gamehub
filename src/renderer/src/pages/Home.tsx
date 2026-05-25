import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Library, Play, RefreshCw, Settings as SettingsIcon, Tv } from 'lucide-react'
import AnimatedBackground from '../components/AnimatedBackground'
import GameCard from '../components/GameCard'
import ScanBanner from '../components/ScanBanner'
import { useLibraryStore } from '../store/library'
import { PLATFORMS } from '@shared/platforms'

export default function Home(): JSX.Element {
  const games = useLibraryStore((s) => s.games)
  const scan = useLibraryStore((s) => s.scan)
  const progress = useLibraryStore((s) => s.progress)

  const recent = [...games]
    .filter((g) => g.lastPlayedAt)
    .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))
    .slice(0, 8)

  // Smarter hero pick: most-recently-played → most-recently-added → first
  // ready → first by title. Beats showing whatever's first alphabetically.
  const featured = pickFeatured(games)
  const favorites = games.filter((g) => g.favorite).slice(0, 8)
  const platformsWithGames = Array.from(new Set(games.map((g) => g.platform))).filter(
    (p) => p !== 'unknown'
  )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative min-h-full"
    >
      <AnimatedBackground />
      <ScanBanner />

      {/* Hero */}
      <section className="relative px-12 pt-16 pb-12">
        <div className="flex items-start justify-between gap-8">
          <div className="max-w-2xl">
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-accent text-xs tracking-[0.3em] uppercase mb-3 font-display"
            >
              Bem-vindo de volta
            </motion.p>
            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { delay: 0.1 } }}
              className="text-5xl font-display font-bold leading-tight"
            >
              {featured ? featured.title : 'Sua biblioteca está vazia'}
            </motion.h1>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { delay: 0.2 } }}
              className="text-slate-400 mt-3 max-w-lg"
            >
              {featured
                ? `${PLATFORMS[featured.platform].name} · ${games.length} jogos no total · ${platformsWithGames.length} plataformas`
                : 'Configure o caminho dos seus jogos para começar.'}
            </motion.p>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { delay: 0.3 } }}
              className="flex gap-3 mt-8"
            >
              {featured && (
                <Link
                  to={`/game/${featured.id}`}
                  className="px-6 py-3 bg-accent text-ink-950 rounded-lg font-semibold flex items-center gap-2 hover:bg-accent/90 transition-all shadow-[0_0_30px_rgba(94,234,212,0.4)] hover:shadow-[0_0_40px_rgba(94,234,212,0.7)]"
                >
                  <Play className="w-4 h-4 fill-current" /> Jogar agora
                </Link>
              )}
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
            </motion.div>
          </div>

          {/* Featured cover */}
          {featured && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, transition: { delay: 0.2, duration: 0.6 } }}
              className="hidden lg:block"
            >
              <GameCard game={featured} />
            </motion.div>
          )}
        </div>
      </section>

      {games.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8 pb-16 relative z-10">
          {recent.length > 0 && (
            <Shelf title="Jogados recentemente" games={recent} accent="#5eead4" />
          )}
          {favorites.length > 0 && (
            <Shelf title="Favoritos" games={favorites} accent="#f87171" />
          )}
          {platformsWithGames.slice(0, 6).map((p) => {
            const list = games.filter((g) => g.platform === p).slice(0, 12)
            return <Shelf key={p} title={PLATFORMS[p].name} games={list} accent={PLATFORMS[p].color} />
          })}
        </div>
      )}
    </motion.div>
  )
}

function pickFeatured(games: import('@shared/types').Game[]): import('@shared/types').Game | undefined {
  if (games.length === 0) return undefined
  const played = games.filter((g) => g.lastPlayedAt)
  if (played.length > 0) {
    return [...played].sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))[0]
  }
  const ready = games.filter((g) => g.status === 'ready')
  const pool = ready.length > 0 ? ready : games
  return [...pool].sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''))[0] ?? pool[0]
}

function Shelf({
  title,
  games,
  accent
}: {
  title: string
  games: import('@shared/types').Game[]
  accent: string
}): JSX.Element {
  return (
    <section className="space-y-3">
      <header className="flex items-center gap-3 px-12">
        <div
          className="w-1.5 h-7 rounded-full"
          style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
        />
        <h2 className="font-display font-semibold text-xl">{title}</h2>
        <span className="text-xs text-slate-500 font-mono">{games.length}</span>
      </header>
      <div className="shelf flex gap-4 overflow-x-auto pb-4 px-12">
        {games.map((g) => (
          <Link to={`/game/${g.id}`} key={g.id}>
            <GameCard game={g} />
          </Link>
        ))}
      </div>
    </section>
  )
}

function EmptyState(): JSX.Element {
  return (
    <div className="relative z-10 mx-12 my-16 glass rounded-2xl p-12 text-center">
      <p className="text-slate-300 text-lg mb-4">
        Nenhum jogo na biblioteca ainda.
      </p>
      <p className="text-slate-500 mb-6 text-sm">
        Configure o caminho dos seus jogos em Configurações ou execute um scan novo.
      </p>
      <div className="flex justify-center gap-3">
        <Link
          to="/settings"
          className="px-6 py-3 bg-accent text-ink-950 rounded-lg font-semibold flex items-center gap-2"
        >
          <SettingsIcon className="w-4 h-4" /> Abrir Configurações
        </Link>
      </div>
    </div>
  )
}

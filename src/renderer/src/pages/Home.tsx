import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Settings as SettingsIcon } from 'lucide-react'
import AnimatedBackground from '../components/AnimatedBackground'
import GameCard from '../components/GameCard'
import RotatingHero from '../components/RotatingHero'
import ScanBanner from '../components/ScanBanner'
import { useLibraryStore } from '../store/library'
import { PLATFORMS } from '@shared/platforms'

export default function Home(): JSX.Element {
  const games = useLibraryStore((s) => s.games)

  const recent = [...games]
    .filter((g) => g.lastPlayedAt)
    .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))
    .slice(0, 8)

  // Hero rotates between recently played + favorites + a couple of ready games
  const heroCandidates = pickHeroPool(games)
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

      <RotatingHero candidates={heroCandidates} />

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

/**
 * Pick the rotating hero pool. We mix:
 *   - most-recently-played (up to 2)
 *   - favorites (up to 2)
 *   - ready games sorted by recency added (fill to 5)
 *
 * Deduped by id, max 5 entries so the rotation feels purposeful rather than
 * an endless slideshow.
 */
function pickHeroPool(games: import('@shared/types').Game[]): import('@shared/types').Game[] {
  if (games.length === 0) return []
  const seen = new Set<string>()
  const out: import('@shared/types').Game[] = []
  const add = (g?: import('@shared/types').Game): void => {
    if (!g || seen.has(g.id) || out.length >= 5) return
    seen.add(g.id)
    out.push(g)
  }
  const recent = [...games]
    .filter((g) => g.lastPlayedAt)
    .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))
  recent.slice(0, 2).forEach(add)
  games.filter((g) => g.favorite).slice(0, 2).forEach(add)
  const ready = [...games]
    .filter((g) => g.status === 'ready')
    .sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''))
  ready.forEach(add)
  // Fallback: anything left
  games.forEach(add)
  return out
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

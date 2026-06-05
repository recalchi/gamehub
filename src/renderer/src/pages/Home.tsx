import { useMemo, useState } from 'react'
import RouteTransition from '../components/RouteTransition'
import { Link } from 'react-router-dom'
import { ChevronRight, Download, Settings as SettingsIcon, Sparkles } from 'lucide-react'
import AnimatedBackground from '../components/AnimatedBackground'
import GameBackdrop from '../components/GameBackdrop'
import GameCard from '../components/GameCard'
import RotatingHero from '../components/RotatingHero'
import ScanBanner from '../components/ScanBanner'
import { useLibraryStore } from '../store/library'
import { PLATFORMS } from '@shared/platforms'
import { CURATED_CATALOG, type CuratedEntry } from '@shared/curated'
import type { Game } from '@shared/types'

export default function Home(): JSX.Element {
  const games = useLibraryStore((s) => s.games)
  const dynamicBackgrounds = useLibraryStore(
    (s) => s.settings?.appearance.dynamicGameBackgrounds ?? true
  )
  const backgroundPreset = useLibraryStore(
    (s) => s.settings?.appearance.gameBackgroundPreset ?? 'vibrant'
  )
  const [heroGame, setHeroGame] = useState<Game | null>(null)

  // Memoize every derived shelf — the Home page re-renders on store changes
  // (cover updates stream in, scan progress ticks, etc.) and re-sorting the
  // whole library 4× per render is the main reason the "Jogados recentemente"
  // strip felt laggy.
  const recent = useMemo(
    () =>
      [...games]
        .filter((g) => g.lastPlayedAt)
        .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))
        .slice(0, 8),
    [games]
  )
  const heroCandidates = useMemo(() => pickHeroPool(games), [games])
  const favorites = useMemo(
    () => games.filter((g) => g.favorite).slice(0, 8),
    [games]
  )
  const steamGames = useMemo(
    () =>
      games
        .filter((g) => g.path.startsWith('steam://') || g.flags?.includes('steam'))
        .slice(0, 12),
    [games]
  )
  // PC standalone games — excludes Steam/Epic/Riot (those have their own shelf via
  // platform flags). PC and managed-store games must stay isolated per project rule.
  const pcGames = useMemo(
    () =>
      games
        .filter(
          (g) =>
            g.platform === 'pc' &&
            !g.path.startsWith('steam://') &&
            !g.path.startsWith('epic://') &&
            !g.path.startsWith('riot://') &&
            !g.flags?.includes('steam') &&
            !g.flags?.includes('epic') &&
            !g.flags?.includes('riot')
        )
        .slice(0, 12),
    [games]
  )
  const platformsWithGames = useMemo(
    () =>
      Array.from(new Set(games.map((g) => g.platform))).filter(
        (p) => p !== 'unknown' && p !== 'pc'
      ),
    [games]
  )

  // Curated catalog entries the user hasn't installed yet — surfaced as a
  // "sugestões" strip with cover art so a free game is one click away. Sorted
  // to put entries with cover URLs first (visual variety up front).
  const suggestions = useMemo(() => {
    const installedTitles = new Set(games.map((g) => `${g.title}::${g.platform}`))
    return CURATED_CATALOG.filter((e) => e.id !== 'tinyfugue-readme')
      .filter((e) => !installedTitles.has(`${e.title}::${e.platform}`))
      .sort((a, b) => (b.cover ? 1 : 0) - (a.cover ? 1 : 0))
      .slice(0, 8)
  }, [games])

  return (
    <RouteTransition className="relative min-h-full">
      <AnimatedBackground />
      {dynamicBackgrounds && (
        <GameBackdrop game={heroGame ?? heroCandidates[0]} preset={backgroundPreset} />
      )}
      <ScanBanner />

      <RotatingHero candidates={heroCandidates} onCurrentChange={setHeroGame} />

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
          {steamGames.length > 0 && (
            <Shelf title="Steam" games={steamGames} accent="#66c0f4" />
          )}
          {platformsWithGames.slice(0, 6).map((p) => {
            const list = games.filter((g) => g.platform === p).slice(0, 12)
            return <Shelf key={p} title={PLATFORMS[p].name} games={list} accent={PLATFORMS[p].color} />
          })}
          {pcGames.length > 0 && (
            <Shelf title="Windows / PC" games={pcGames} accent="#a78bfa" />
          )}
          {suggestions.length > 0 && <SuggestionShelf entries={suggestions} />}
        </div>
      )}
    </RouteTransition>
  )
}

/**
 * Curated catalog suggestions surfaced on the Home page. Same shape as a
 * regular shelf, but every card is a free download — single click installs.
 */
function SuggestionShelf({ entries }: { entries: CuratedEntry[] }): JSX.Element {
  return (
    <section className="space-y-3">
      <header className="flex items-center gap-3 px-12">
        <div
          className="w-1.5 h-7 rounded-full bg-amber-400"
          style={{ boxShadow: '0 0 12px #fbbf24' }}
        />
        <h2 className="font-display font-semibold text-xl flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" /> Sugestões da curadoria
        </h2>
        <span className="text-xs text-slate-500 font-mono">{entries.length}</span>
        <Link
          to="/catalog"
          className="ml-auto text-xs text-slate-400 hover:text-accent flex items-center gap-0.5"
        >
          Ver tudo <ChevronRight className="w-3 h-3" />
        </Link>
      </header>
      <div className="shelf flex gap-4 overflow-x-auto pb-4 px-12">
        {entries.map((e) => (
          <SuggestionCard key={e.id} entry={e} />
        ))}
      </div>
    </section>
  )
}

function SuggestionCard({ entry }: { entry: CuratedEntry }): JSX.Element {
  const platform = PLATFORMS[entry.platform]
  return (
    <Link
      to="/catalog"
      className="focus-card relative shrink-0 w-44 h-64 rounded-xl overflow-hidden border border-white/10 bg-ink-800 group block"
      style={{
        background: `linear-gradient(160deg, ${platform.color}33 0%, rgba(10,12,20,0.85) 60%)`
      }}
    >
      {entry.cover && (
        <img
          src={entry.cover}
          alt={entry.title}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
        />
      )}
      {!entry.cover && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center px-3">
            <div className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: platform.color }}>
              {platform.shortName}
            </div>
            <div className="text-white font-display font-bold leading-tight">{entry.title}</div>
          </div>
        </div>
      )}
      {/* "Baixar" badge top-right */}
      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-accent text-ink-950 text-[10px] font-bold flex items-center gap-1 shadow-glow">
        <Download className="w-2.5 h-2.5" /> Grátis
      </div>
      {/* Footer with title + platform */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] text-white/60 uppercase tracking-wider">
            {platform.shortName}
          </span>
          <span className="text-[10px] text-emerald-300/80 uppercase">{entry.license.split(' ')[0]}</span>
        </div>
        <div className="text-sm font-semibold text-white line-clamp-2 leading-tight">{entry.title}</div>
      </div>
    </Link>
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

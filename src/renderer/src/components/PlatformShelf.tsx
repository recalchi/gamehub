import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import GameCard from './GameCard'
import type { Game, PlatformId } from '@shared/types'
import { PLATFORMS } from '@shared/platforms'

interface PlatformShelfProps {
  platformId: PlatformId
  games: Game[]
}

export default function PlatformShelf({ platformId, games }: PlatformShelfProps): JSX.Element {
  const navigate = useNavigate()
  const platform = PLATFORMS[platformId]
  if (games.length === 0) return <></>

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between px-12">
        <div className="flex items-center gap-3">
          <div
            className="w-1.5 h-7 rounded-full"
            style={{ background: platform.color, boxShadow: `0 0 12px ${platform.color}` }}
          />
          <h2 className="font-display font-semibold text-xl tracking-wide">{platform.name}</h2>
          <span className="text-xs text-slate-500 font-mono">{games.length}</span>
        </div>
        <button
          onClick={() => navigate(`/library/${platformId}`)}
          className="text-xs text-slate-400 hover:text-accent flex items-center gap-1 transition-colors"
        >
          Ver tudo <ChevronRight className="w-3 h-3" />
        </button>
      </header>
      <div className="shelf flex gap-4 overflow-x-auto pb-4 px-12 scroll-smooth">
        {games.slice(0, 20).map((g) => (
          <GameCard key={g.id} game={g} onClick={() => navigate(`/game/${g.id}`)} />
        ))}
      </div>
    </section>
  )
}

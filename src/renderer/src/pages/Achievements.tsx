import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import RouteTransition from '../components/RouteTransition'
import { Link } from 'react-router-dom'
import { Award, CheckCircle2, ExternalLink, Gamepad2, Loader2, Search, ShieldQuestion } from 'lucide-react'
import { PLATFORMS } from '@shared/platforms'
import type { GameAchievementSummary } from '@shared/types'
import PageHeader from '../components/PageHeader'

type Filter = 'all' | 'ready' | 'needs' | 'unsupported'

export default function Achievements(): JSX.Element {
  const [items, setItems] = useState<GameAchievementSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    void window.api.achievements
      .summaries()
      .then(setItems)
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const ready = items.filter((item) => item.status === 'ready')
    return {
      ready: ready.length,
      totalAchievements: ready.reduce((sum, item) => sum + item.total, 0),
      needs: items.filter((item) => item.status === 'needs-configuration' || item.status === 'not-cached').length
    }
  }, [items])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((item) => {
        if (filter === 'ready') return item.status === 'ready'
        if (filter === 'needs') return item.status === 'needs-configuration' || item.status === 'not-cached'
        if (filter === 'unsupported') return item.status === 'unsupported'
        return true
      })
      .filter((item) => (q ? item.gameTitle.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        const statusDelta = statusWeight(a.status) - statusWeight(b.status)
        if (statusDelta !== 0) return statusDelta
        return b.total - a.total || a.gameTitle.localeCompare(b.gameTitle)
      })
  }, [filter, items, query])

  return (
    <RouteTransition className="px-12 py-12 max-w-7xl">
      <PageHeader
        title="Conquistas"
        icon={Award}
        subtitle="Centraliza conquistas identificaveis da biblioteca. Steam usa cache local do PC; consoles ficam preparados para RetroAchievements."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Kpi icon={<CheckCircle2 className="w-4 h-4" />} label="Jogos identificados" value={stats.ready} />
        <Kpi icon={<Award className="w-4 h-4" />} label="Conquistas mapeadas" value={stats.totalAchievements} />
        <Kpi icon={<ShieldQuestion className="w-4 h-4" />} label="Aguardando fonte" value={stats.needs} />
      </div>

      <div className="glass rounded-xl p-4 mb-5 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Buscar jogo..."
            className="w-full rounded-lg bg-white/5 border border-white/10 pl-9 pr-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterButton label="Todos" active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterButton label="Identificados" active={filter === 'ready'} onClick={() => setFilter('ready')} />
          <FilterButton label="Configurar" active={filter === 'needs'} onClick={() => setFilter('needs')} />
          <FilterButton label="Sem fonte" active={filter === 'unsupported'} onClick={() => setFilter('unsupported')} />
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Lendo fontes de conquistas...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.map((item) => (
            <AchievementSummaryCard key={item.gameId} item={item} />
          ))}
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="py-16 text-center text-slate-500">Nenhum jogo neste filtro.</div>
      )}
    </RouteTransition>
  )
}

function AchievementSummaryCard({ item }: { item: GameAchievementSummary }): JSX.Element {
  const platform = PLATFORMS[item.platform]
  return (
    <div className="glass rounded-xl overflow-hidden flex">
      <div
        className="w-24 sm:w-28 shrink-0 bg-white/5"
        style={{
          background: item.cover
            ? `url(${item.cover}) center/cover`
            : `linear-gradient(145deg, ${platform?.color ?? '#64748b'}, rgba(10,12,20,.9))`
        }}
      />
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-accent">
              {item.sourceLabel} · {platform?.shortName ?? item.platform}
            </div>
            <h2 className="font-display text-lg font-bold truncate">{item.gameTitle}</h2>
          </div>
          <StatusBadge status={item.status} />
        </div>
        <p className="text-xs text-slate-400 mt-2 line-clamp-2">{item.sourceDetail}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded bg-white/5 px-2 py-1 text-xs text-slate-300">
            {item.total > 0 ? `${item.total} conquistas` : 'Sem lista local'}
          </span>
          <Link
            to={`/game/${item.gameId}#achievements`}
            className="rounded bg-accent px-3 py-1 text-xs font-semibold text-ink-950 hover:bg-accent/90 inline-flex items-center gap-1.5"
          >
            <Gamepad2 className="w-3 h-3" /> Ver no jogo
          </Link>
          {item.sourceUrl && (
            <button
              type="button"
              onClick={() => window.api.system.openExternal(item.sourceUrl!)}
              className="rounded bg-white/5 px-2 py-1 text-xs text-slate-300 hover:bg-white/10 inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3 h-3" /> Fonte
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: GameAchievementSummary['status'] }): JSX.Element {
  const tone =
    status === 'ready'
      ? 'bg-emerald-400/20 text-emerald-300'
      : status === 'unsupported'
        ? 'bg-slate-400/15 text-slate-400'
        : 'bg-amber-400/20 text-amber-300'
  const label =
    status === 'ready'
      ? 'Identificado'
      : status === 'not-cached'
        ? 'Sem cache'
        : status === 'needs-configuration'
          ? 'Configurar'
          : status === 'unsupported'
            ? 'Sem fonte'
            : 'Erro'
  return <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${tone}`}>{label}</span>
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: number }): JSX.Element {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-accent mb-1">
        {icon} {label}
      </div>
      <div className="text-3xl font-display font-bold">{value}</div>
    </div>
  )
}

function FilterButton({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-semibold ${
        active ? 'bg-accent text-ink-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  )
}

function statusWeight(status: GameAchievementSummary['status']): number {
  if (status === 'ready') return 0
  if (status === 'not-cached') return 1
  if (status === 'needs-configuration') return 2
  if (status === 'error') return 3
  return 4
}

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { BarChart3, Clock, Heart, Image, Play, Trophy } from 'lucide-react'
import { useLibraryStore } from '../store/library'
import { PLATFORMS } from '@shared/platforms'
import type { Game, GameStatus, PlatformId } from '@shared/types'

const STATUS_COLORS: Record<GameStatus, string> = {
  ready: '#34d399',
  installed: '#34d399',
  'not-downloaded': '#64748b',
  corrupted: '#fbbf24',
  'missing-emulator': '#f87171',
  'missing-bios': '#fbbf24',
  unknown: '#64748b'
}

const STATUS_LABELS: Record<GameStatus, string> = {
  ready: 'Pronto',
  installed: 'Instalado',
  'not-downloaded': 'Não baixado',
  corrupted: 'Suspeito',
  'missing-emulator': 'Sem emulador',
  'missing-bios': 'BIOS',
  unknown: 'Desconhecido'
}

/**
 * Library at-a-glance dashboard. Pure CSS/SVG charts to avoid pulling in
 * a charting dependency for what amounts to a few bars and a donut.
 */
export default function Stats(): JSX.Element {
  const games = useLibraryStore((s) => s.games)
  const stats = useMemo(() => computeStats(games), [games])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="px-12 py-12 max-w-5xl"
    >
      <header className="mb-8">
        <h1 className="text-3xl font-display font-bold flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-accent" /> Estatísticas
        </h1>
        <p className="text-slate-400 mt-1">
          Sua biblioteca em números. Atualiza sozinha conforme você joga.
        </p>
      </header>

      {/* Top KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Kpi
          icon={Play}
          label="Total de jogos"
          value={stats.total.toString()}
          accent="text-accent"
        />
        <Kpi
          icon={Trophy}
          label="Prontos para jogar"
          value={stats.ready.toString()}
          accent="text-emerald-300"
        />
        <Kpi
          icon={Clock}
          label="Tempo total jogado"
          value={formatDuration(stats.totalSeconds)}
          accent="text-cyan-300"
        />
        <Kpi
          icon={Heart}
          label="Favoritos"
          value={stats.favorites.toString()}
          accent="text-rose-300"
        />
      </div>

      {stats.total === 0 ? (
        <div className="glass rounded-xl p-12 text-center text-slate-400">
          Sem jogos ainda. <Link to="/library" className="text-accent">Adicione um</Link> ou{' '}
          <Link to="/settings" className="text-accent">configure suas pastas</Link>.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Platform breakdown */}
          <section className="glass rounded-xl p-5">
            <h2 className="font-display font-semibold text-lg mb-4">Por plataforma</h2>
            <ul className="space-y-2.5">
              {stats.byPlatform.map((p) => (
                <li key={p.id}>
                  <div className="flex items-center justify-between text-sm mb-0.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ background: p.color }}
                      />
                      {p.name}
                    </span>
                    <span className="text-slate-400 font-mono text-xs">
                      {p.count} · {Math.round((p.count / stats.total) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(p.count / stats.maxPlatformCount) * 100}%`,
                        background: p.color
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Status donut */}
          <section className="glass rounded-xl p-5 flex flex-col items-center">
            <h2 className="font-display font-semibold text-lg mb-4 self-start">Status</h2>
            <Donut data={stats.byStatus} total={stats.total} />
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs w-full">
              {stats.byStatus.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: s.color }}
                    />
                    <span className="truncate">{s.label}</span>
                  </span>
                  <span className="text-slate-400 font-mono">{s.count}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Top played */}
          <section className="glass rounded-xl p-5 lg:col-span-2">
            <h2 className="font-display font-semibold text-lg mb-4">Mais jogados</h2>
            {stats.topPlayed.length === 0 ? (
              <p className="text-sm text-slate-500">
                Você ainda não jogou nada pelo GameHub. Após uma sessão, o tempo aparece aqui.
              </p>
            ) : (
              <ol className="space-y-2">
                {stats.topPlayed.map((g, i) => (
                  <li key={g.id}>
                    <Link
                      to={`/game/${g.id}`}
                      className="flex items-center gap-3 hover:bg-white/5 rounded-md px-2 py-1.5 -mx-2 transition-colors"
                    >
                      <span className="text-2xl font-display font-bold text-slate-600 w-8">
                        {i + 1}
                      </span>
                      <div
                        className="w-10 h-14 rounded-md shrink-0"
                        style={{
                          background: g.cover
                            ? `url(${g.cover}) center/cover`
                            : `linear-gradient(135deg, ${
                                PLATFORMS[g.platform]?.color ?? '#64748b'
                              }, ${PLATFORMS[g.platform]?.color ?? '#64748b'}55)`
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{g.title}</div>
                        <div className="text-xs text-slate-500">
                          {PLATFORMS[g.platform]?.name}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-accent font-mono text-sm">
                          {formatDuration(g.playTime)}
                        </div>
                        {g.lastPlayedAt && (
                          <div className="text-[10px] text-slate-500">
                            {new Date(g.lastPlayedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Cover hit rate */}
          <section className="glass rounded-xl p-5 lg:col-span-2">
            <h2 className="font-display font-semibold text-lg mb-3 flex items-center gap-2">
              <Image className="w-4 h-4 text-accent" /> Cobertura de capas
            </h2>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="h-3 rounded-full bg-ink-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent to-cyan-400"
                    style={{ width: `${stats.coverHitRate * 100}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {stats.withCovers} de {stats.total} jogos têm capa (
                  {Math.round(stats.coverHitRate * 100)}%)
                </p>
              </div>
              <span className="text-3xl font-display font-bold text-accent">
                {Math.round(stats.coverHitRate * 100)}%
              </span>
            </div>
          </section>
        </div>
      )}
    </motion.div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent
}: {
  icon: typeof Play
  label: string
  value: string
  accent: string
}): JSX.Element {
  return (
    <div className="glass rounded-xl p-4">
      <div className={`flex items-center gap-2 text-xs uppercase tracking-wider ${accent} mb-1`}>
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-3xl font-display font-bold">{value}</div>
    </div>
  )
}

interface DonutSlice {
  id: string
  label: string
  count: number
  color: string
}

function Donut({ data, total }: { data: DonutSlice[]; total: number }): JSX.Element {
  // SVG donut: each slice is a stroke-dasharray arc on a circle. Cheap and
  // works without a charting library.
  const R = 60
  const C = 2 * Math.PI * R
  let acc = 0
  return (
    <svg width={180} height={180} viewBox="-90 -90 180 180" className="my-2">
      <circle r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={18} />
      {data.map((s) => {
        if (s.count === 0) return null
        const frac = s.count / total
        const dash = frac * C
        const offset = -acc * C
        acc += frac
        return (
          <circle
            key={s.id}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={18}
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={offset}
            transform="rotate(-90)"
            strokeLinecap="butt"
          />
        )
      })}
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Rajdhani"
        fontSize={28}
        fontWeight={700}
        fill="currentColor"
      >
        {total}
      </text>
    </svg>
  )
}

interface StatsBundle {
  total: number
  ready: number
  favorites: number
  totalSeconds: number
  withCovers: number
  coverHitRate: number
  byPlatform: Array<{ id: PlatformId; name: string; color: string; count: number }>
  maxPlatformCount: number
  byStatus: DonutSlice[]
  topPlayed: Game[]
}

function computeStats(games: Game[]): StatsBundle {
  const total = games.length
  const ready = games.filter((g) => g.status === 'ready').length
  const favorites = games.filter((g) => g.favorite).length
  const totalSeconds = games.reduce((sum, g) => sum + (g.playTime ?? 0), 0)
  const withCovers = games.filter((g) => g.cover).length

  const platformCounts = new Map<PlatformId, number>()
  for (const g of games) platformCounts.set(g.platform, (platformCounts.get(g.platform) ?? 0) + 1)
  const byPlatform = Array.from(platformCounts.entries())
    .filter(([p]) => p !== 'unknown')
    .map(([p, count]) => ({
      id: p,
      name: PLATFORMS[p]?.name ?? p,
      color: PLATFORMS[p]?.color ?? '#64748b',
      count
    }))
    .sort((a, b) => b.count - a.count)
  const maxPlatformCount = Math.max(1, ...byPlatform.map((p) => p.count))

  const statusCounts = new Map<GameStatus, number>()
  for (const g of games) statusCounts.set(g.status, (statusCounts.get(g.status) ?? 0) + 1)
  const byStatus: DonutSlice[] = Array.from(statusCounts.entries()).map(([id, count]) => ({
    id,
    label: STATUS_LABELS[id] ?? id,
    count,
    color: STATUS_COLORS[id] ?? '#64748b'
  }))

  const topPlayed = [...games]
    .filter((g) => (g.playTime ?? 0) > 0)
    .sort((a, b) => (b.playTime ?? 0) - (a.playTime ?? 0))
    .slice(0, 5)

  return {
    total,
    ready,
    favorites,
    totalSeconds,
    withCovers,
    coverHitRate: total === 0 ? 0 : withCovers / total,
    byPlatform,
    maxPlatformCount,
    byStatus,
    topPlayed
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  if (hours < 24) return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const hRem = hours % 24
  return hRem > 0 ? `${days}d ${hRem}h` : `${days}d`
}

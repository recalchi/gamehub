import { useMemo, useState } from 'react'
import RouteTransition from '../components/RouteTransition'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  FolderPlus,
  Filter,
  Plus,
  RefreshCw,
  Search as SearchIcon,
  Trash2,
  X
} from 'lucide-react'
import GameCard from '../components/GameCard'
import AddGameModal from '../components/AddGameModal'
import { useLibraryStore } from '../store/library'
import { PLATFORMS, PLATFORM_LIST } from '@shared/platforms'
import type { GameStatus, PlatformId } from '@shared/types'

const STATUS_FILTERS: Array<{ id: GameStatus | 'all'; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'ready', label: 'Prontos' },
  { id: 'missing-emulator', label: 'Sem emulador' },
  { id: 'missing-bios', label: 'BIOS' },
  { id: 'corrupted', label: 'Suspeitos' }
]

type SortKey = 'title' | 'playTime' | 'addedAt' | 'lastPlayedAt'

const SORT_OPTIONS: Array<{ id: SortKey; label: string }> = [
  { id: 'title', label: 'Título' },
  { id: 'playTime', label: 'Tempo jogado' },
  { id: 'addedAt', label: 'Adição' },
  { id: 'lastPlayedAt', label: 'Última vez' }
]

export default function Library(): JSX.Element {
  const { platform } = useParams<{ platform?: PlatformId }>()
  const games = useLibraryStore((s) => s.games)
  const settings = useLibraryStore((s) => s.settings)
  const saveSettings = useLibraryStore((s) => s.saveSettings)
  const scan = useLibraryStore((s) => s.scan)
  const progress = useLibraryStore((s) => s.progress)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<GameStatus | 'all'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('title')
  const [sortAsc, setSortAsc] = useState(true)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [pendingRoot, setPendingRoot] = useState('')
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [scanBusy, setScanBusy] = useState(false)

  // All unique tags with counts, restricted to currently-visible platform
  const tagsWithCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of games) {
      if (platform && g.platform !== platform) continue
      for (const t of g.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1)
    }
    return Array.from(m.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
  }, [games, platform])

  const platformsPresent = useMemo(() => {
    const counts = new Map<PlatformId, number>()
    for (const g of games) counts.set(g.platform, (counts.get(g.platform) ?? 0) + 1)
    return PLATFORM_LIST.filter((p) => counts.has(p.id)).map((p) => ({
      ...p,
      count: counts.get(p.id) ?? 0
    }))
  }, [games])

  const filtered = useMemo(() => {
    const out = games
      .filter((g) => (platform ? g.platform === platform : true))
      .filter((g) => (statusFilter === 'all' ? true : g.status === statusFilter))
      .filter((g) => (activeTag ? (g.tags ?? []).includes(activeTag) : true))
      .filter((g) =>
        query.trim() === '' ? true : g.title.toLowerCase().includes(query.toLowerCase())
      )
    const direction = sortAsc ? 1 : -1
    out.sort((a, b) => {
      switch (sortKey) {
        case 'title':
          return direction * a.title.localeCompare(b.title)
        case 'playTime':
          return direction * ((a.playTime ?? 0) - (b.playTime ?? 0))
        case 'addedAt':
          return direction * (a.addedAt ?? '').localeCompare(b.addedAt ?? '')
        case 'lastPlayedAt':
          return direction * (a.lastPlayedAt ?? '').localeCompare(b.lastPlayedAt ?? '')
      }
    })
    return out
  }, [games, platform, statusFilter, activeTag, query, sortKey, sortAsc])

  const currentPlatform = platform ? PLATFORMS[platform] : null
  const normalizedRoots = useMemo(
    () => normalizeRoots(settings?.gameRoots ?? []),
    [settings?.gameRoots]
  )

  async function addPendingRoots(raw: string): Promise<void> {
    if (!settings) return
    const next = normalizeRoots([...settings.gameRoots, ...splitRootInput(raw)])
    if (sameRoots(next, settings.gameRoots)) {
      setPendingRoot('')
      return
    }
    await saveSettings({ gameRoots: next })
    setPendingRoot('')
    setScanMessage(`${next.length} pasta(s) na varredura.`)
  }

  async function pickGameRoot(): Promise<void> {
    const folder = await window.api.system.pickFolder()
    if (folder) await addPendingRoots(folder)
  }

  async function removeGameRoot(path: string): Promise<void> {
    if (!settings) return
    const next = normalizeRoots(settings.gameRoots.filter((root) => root !== path))
    await saveSettings({ gameRoots: next })
    setScanMessage(next.length === 0 ? 'Nenhuma pasta de jogos configurada.' : null)
  }

  async function rescanConfiguredRoots(): Promise<void> {
    let rootCount = normalizedRoots.length
    if (pendingRoot.trim()) {
      const next = settings
        ? normalizeRoots([...settings.gameRoots, ...splitRootInput(pendingRoot)])
        : normalizedRoots
      rootCount = next.length
      await addPendingRoots(pendingRoot)
    }
    setScanBusy(true)
    setScanMessage('Re-escaneando diretórios configurados...')
    try {
      const result = await scan({ fresh: true })
      setScanMessage(`Encontrados ${result.games.length} jogos em ${rootCount} pasta(s).`)
    } catch (err) {
      setScanMessage(`Falha no re-scan: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setScanBusy(false)
    }
  }

  return (
    <RouteTransition className="min-h-full">
      <div className="px-12 pt-12 pb-6 sticky top-0 z-20 backdrop-blur-md bg-ink-950/80 border-b border-white/5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">
              {currentPlatform ? currentPlatform.name : 'Biblioteca completa'}
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              {filtered.length} de {games.length} jogos
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 glass rounded-lg px-3 py-2 w-72">
              <SearchIcon className="w-4 h-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar nesta biblioteca..."
                className="bg-transparent flex-1 outline-none text-sm placeholder:text-slate-500"
              />
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="px-4 py-2 bg-accent text-ink-950 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-accent/90 transition-all shadow-[0_0_24px_-8px_rgba(94,234,212,0.5)]"
            >
              <Plus className="w-4 h-4" /> Adicionar
            </button>
            <button
              onClick={() => setSourcesOpen((open) => !open)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${
                sourcesOpen
                  ? 'bg-white/15 text-white'
                  : 'bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <FolderPlus className="w-4 h-4" /> Diretórios
            </button>
          </div>
        </div>

        {sourcesOpen && (
          <div className="mt-5 rounded-xl border border-white/10 bg-ink-900/90 p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="font-display font-semibold text-base">Fontes da biblioteca</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Adicione pastas onde seus jogos ficam guardados. O re-scan usa todas em conjunto.
                </p>
              </div>
              <button
                onClick={() => setSourcesOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 max-sm:grid-cols-1">
              <input
                value={pendingRoot}
                onChange={(e) => setPendingRoot(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void addPendingRoots(pendingRoot)
                  }
                }}
                placeholder="Ex: D:\\Jogos; E:\\SteamLibrary\\steamapps\\common"
                className="bg-ink-800 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-slate-600"
              />
              <button
                onClick={pickGameRoot}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm flex items-center justify-center gap-2"
              >
                <FolderPlus className="w-4 h-4" /> Procurar
              </button>
              <button
                onClick={() => addPendingRoots(pendingRoot)}
                disabled={!pendingRoot.trim()}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-white/5 rounded-lg text-sm"
              >
                Adicionar
              </button>
            </div>

            <div className="mt-4 space-y-2 max-h-44 overflow-y-auto pr-1">
              {normalizedRoots.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-slate-500">
                  Nenhum diretório configurado.
                </div>
              ) : (
                normalizedRoots.map((root) => (
                  <div
                    key={root}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2"
                  >
                    <code className="min-w-0 truncate text-sm text-slate-300">{root}</code>
                    <button
                      onClick={() => removeGameRoot(root)}
                      className="shrink-0 p-1.5 rounded-md text-rose-300 hover:text-rose-200 hover:bg-rose-400/10"
                      title="Remover diretório"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-slate-400">
                {scanBusy
                  ? `${progress.scanned} arquivos lidos · ${progress.found} jogos`
                  : scanMessage ?? `${normalizedRoots.length} pasta(s) prontas para scan.`}
              </p>
              <button
                onClick={rescanConfiguredRoots}
                disabled={scanBusy || (!pendingRoot.trim() && normalizedRoots.length === 0)}
                className="px-4 py-2 bg-accent text-ink-950 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-accent/90 disabled:opacity-40 disabled:hover:bg-accent"
              >
                <RefreshCw className={`w-4 h-4 ${scanBusy ? 'animate-spin' : ''}`} />
                {scanBusy ? 'Escaneando' : 'Salvar e re-escanear'}
              </button>
            </div>
          </div>
        )}

        {/* Platform chips */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
          <Link
            to="/library"
            className={chipClass(!platform)}
          >
            Todos · {games.length}
          </Link>
          {platformsPresent.map((p) => (
            <Link
              key={p.id}
              to={`/library/${p.id}`}
              className={chipClass(platform === p.id)}
              style={{
                borderColor:
                  platform === p.id ? p.color : 'rgba(255,255,255,0.06)'
              }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-2"
                style={{ background: p.color }}
              />
              {p.shortName} · {p.count}
            </Link>
          ))}
        </div>

        {/* Status filters + sort */}
        <div className="flex items-center gap-2 mt-3 text-xs flex-wrap">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                statusFilter === f.id
                  ? 'bg-accent/20 text-accent'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {f.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-500">Ordenar por:</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-ink-800 border border-white/5 rounded-md px-2 py-1 outline-none focus:border-accent text-xs"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setSortAsc((x) => !x)}
              title={sortAsc ? 'Crescente' : 'Decrescente'}
              className="p-1 rounded hover:bg-white/5 text-slate-300"
            >
              {sortAsc ? (
                <ArrowUpNarrowWide className="w-3.5 h-3.5" />
              ) : (
                <ArrowDownNarrowWide className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Tag filter row (hidden if no tags exist) */}
        {tagsWithCounts.length > 0 && (
          <div className="flex items-center gap-2 mt-3 text-xs flex-wrap">
            <span className="text-slate-500">Tags:</span>
            <button
              onClick={() => setActiveTag(null)}
              className={`px-2.5 py-1 rounded-full transition-colors ${
                !activeTag
                  ? 'bg-accent/20 text-accent'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              todas
            </button>
            {tagsWithCounts.map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`px-2.5 py-1 rounded-full transition-colors ${
                  activeTag === tag
                    ? 'bg-accent/20 text-accent'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                #{tag} <span className="text-slate-500">· {count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-12 py-8">
        {filtered.length === 0 ? (
          <div className="text-center text-slate-500 py-24">Nenhum jogo encontrado.</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-5">
            {filtered.map((g) => (
              <Link to={`/game/${g.id}`} key={g.id}>
                <GameCard game={g} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <AddGameModal open={addOpen} onClose={() => setAddOpen(false)} />
    </RouteTransition>
  )
}

function chipClass(active: boolean): string {
  return [
    'shrink-0 px-3 py-1.5 rounded-full border text-xs whitespace-nowrap transition-all',
    active
      ? 'bg-accent/15 text-accent border-accent'
      : 'bg-white/[0.02] text-slate-300 border-white/5 hover:bg-white/5 hover:text-white'
  ].join(' ')
}

function splitRootInput(value: string): string[] {
  return value
    .split(/[\n;]+/)
    .map((item) => item.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
}

function normalizeRoots(roots: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const root of roots) {
    const clean = root.trim().replace(/^"|"$/g, '').replace(/[\\/]+$/, '')
    if (!clean) continue
    const key = clean.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(clean)
  }
  return normalized
}

function sameRoots(a: string[], b: string[]): boolean {
  const left = normalizeRoots(a)
  const right = normalizeRoots(b)
  return left.length === right.length && left.every((root, index) => root === right[index])
}

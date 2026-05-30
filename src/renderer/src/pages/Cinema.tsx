import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Bookmark,
  BookmarkPlus,
  CheckCircle2,
  Captions,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  Folder,
  Loader2,
  Maximize2,
  MonitorPlay,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  Search,
  SkipBack,
  SkipForward,
  Star,
  Trash2,
  Tv,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import RouteTransition from '../components/RouteTransition'
import { useLibraryStore } from '../store/library'
import type {
  MediaCatalogEntry,
  MediaDownloadProgress,
  MediaItem,
  MediaKind,
  MediaSettings,
  MediaSubtitle,
  MediaWatchRecord,
  MediaStreamingProvider,
  MediaStreamingProviderId
} from '@shared/types'

type Tab = 'library' | 'watched' | 'catalog' | 'streaming'
type CatalogFilter = 'all' | MediaKind

const TRUSTED_STREAMING_HOSTS = new Set(['primevideo.com', 'www.primevideo.com'])

export default function Cinema(): JSX.Element {
  const settings = useLibraryStore((s) => s.settings)
  const saveSettings = useLibraryStore((s) => s.saveSettings)
  const [items, setItems] = useState<MediaItem[]>([])
  const [watched, setWatched] = useState<MediaWatchRecord[]>([])
  const [catalog, setCatalog] = useState<MediaCatalogEntry[]>([])
  const [progress, setProgress] = useState<Map<string, MediaDownloadProgress>>(new Map())
  const [downloadToEntry, setDownloadToEntry] = useState<Map<string, string>>(new Map())
  const [tab, setTab] = useState<Tab>('library')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [featuredId, setFeaturedId] = useState<string | null>(null)
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('all')
  const [playing, setPlaying] = useState<MediaItem | null>(null)

  useEffect(() => {
    void reload()
    void window.api.media.catalog().then(setCatalog)
  }, [])

  useEffect(() => {
    return window.api.media.onProgress((p) => {
      const entryId = downloadToEntry.get(p.id) ?? p.entryId
      setProgress((prev) => new Map(prev).set(entryId, p))
      if (p.state === 'finished') void reload()
    })
  }, [downloadToEntry])

  const media = settings?.media
  const featured = useMemo(() => {
    if (featuredId) return items.find((item) => item.id === featuredId) ?? items[0]
    return items.find((item) => item.cover || item.banner) ?? items[0]
  }, [featuredId, items])

  const downloadedCatalogIds = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      for (const entry of catalog) {
        if (item.sourceUrl === entry.sourceUrl || normalize(item.title) === normalize(entry.title)) {
          set.add(entry.id)
        }
      }
    }
    return set
  }, [catalog, items])

  async function reload(): Promise<void> {
    const [data, watchedData] = await Promise.all([window.api.media.list(), window.api.media.watched()])
    setItems(data.items)
    setWatched(watchedData.records)
  }

  async function scan(): Promise<void> {
    setBusy(true)
    setMessage('Escaneando biblioteca de cinema...')
    const result = await window.api.media.scan({ fresh: true })
    setItems(result.items)
    setMessage(`${result.items.length} midia(s) encontrada(s).`)
    setBusy(false)
  }

  async function refreshArtwork(): Promise<void> {
    setBusy(true)
    setMessage('Atualizando capas e banners da biblioteca...')
    const result = await window.api.media.refreshArtwork()
    await reload()
    setMessage(`${result.updated} capa(s) atualizada(s). ${result.skipped} item(s) sem arte remota confiavel.`)
    setBusy(false)
  }

  async function exportWatched(): Promise<void> {
    const result = await window.api.media.exportWatched()
    setMessage('error' in result ? result.error : `Backup de assistidos salvo em ${result.path}`)
  }

  async function addRoot(): Promise<void> {
    if (!settings) return
    const folder = await window.api.system.pickFolder()
    if (!folder || settings.media.mediaRoots.includes(folder)) return
    await saveSettings({
      media: { ...settings.media, mediaRoots: [...settings.media.mediaRoots, folder] }
    })
  }

  async function removeRoot(path: string): Promise<void> {
    if (!settings) return
    await saveSettings({
      media: {
        ...settings.media,
        mediaRoots: settings.media.mediaRoots.filter((root) => root !== path)
      }
    })
  }

  async function setDownloadRoot(): Promise<void> {
    if (!settings) return
    const folder = await window.api.system.pickFolder()
    if (!folder) return
    await saveSettings({ media: { ...settings.media, downloadRoot: folder } })
  }

  async function play(item: MediaItem): Promise<void> {
    if (media?.playerMode === 'internal') {
      setPlaying(item)
      return
    }
    const result = await window.api.media.open(item.id)
    if ('error' in result) setMessage(result.error)
    else {
      setMessage(`Reproduzindo ${item.title}`)
      void window.api.media.recordWatch({ itemId: item.id })
      void reload()
    }
  }

  async function toggleFavorite(itemId: string): Promise<void> {
    const result = await window.api.media.toggleFavorite(itemId)
    if ('error' in result) {
      setMessage(result.error)
      return
    }
    setItems((prev) => prev.map((item) => (item.id === itemId ? result : item)))
  }

  async function markWatched(itemId: string, completed: boolean): Promise<void> {
    const result = await window.api.media.setWatched(itemId, completed)
    if ('error' in result) {
      setMessage(result.error)
      return
    }
    void reload()
  }

  async function dismissFromContinue(itemId: string): Promise<void> {
    await window.api.media.clearWatch(itemId)
    void reload()
  }

  async function download(entry: MediaCatalogEntry): Promise<void> {
    const result = await window.api.media.download(entry.id)
    if ('error' in result) {
      setProgress((prev) =>
        new Map(prev).set(entry.id, {
          id: 'noop',
          entryId: entry.id,
          title: entry.title,
          state: 'failed',
          received: 0,
          speed: 0,
          error: result.error
        })
      )
      return
    }
    setDownloadToEntry((prev) => new Map(prev).set(result.id, entry.id))
  }

  if (!settings || !media) {
    return <div className="p-12 text-slate-400">Carregando cinema...</div>
  }

  return (
    <RouteTransition className="relative min-h-full overflow-hidden">
      <CinemaBackdrop item={featured} />
      <div className="relative z-10 px-12 py-12 max-w-7xl">
        <PageHeader
          title="Cinema"
          icon={Film}
          subtitle={`${items.length} item(s) na biblioteca. Modo visual para filmes, series e catalogo livre.`}
          actions={
            <>
              <button
                type="button"
                onClick={refreshArtwork}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/15 disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                Atualizar capas
              </button>
              <button
                type="button"
                onClick={scan}
                disabled={busy}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink-950 shadow-glow disabled:opacity-60 inline-flex items-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Re-escanear
              </button>
            </>
          }
          rightSlot={
            <div className="flex flex-wrap items-center gap-2">
              <Segment active={tab === 'library'} label="Biblioteca" onClick={() => setTab('library')} />
              <Segment active={tab === 'watched'} label="Assistidos" onClick={() => setTab('watched')} />
              <Segment active={tab === 'catalog'} label="Livres" onClick={() => setTab('catalog')} />
              <Segment active={tab === 'streaming'} label="Streaming" onClick={() => setTab('streaming')} />
            </div>
          }
        />

        {message && (
          <div className="mb-5 rounded-lg border border-white/10 bg-black/25 px-4 py-2 text-sm text-slate-300">
            {message}
          </div>
        )}

        <SourceBar
          media={media}
          onAddRoot={addRoot}
          onRemoveRoot={removeRoot}
          onSetDownloadRoot={setDownloadRoot}
          onChange={(patch) => saveSettings({ media: { ...media, ...patch } })}
        />

        {tab === 'library' ? (
          <LibraryView
            items={items}
            watched={watched}
            featured={featured}
            onHover={setFeaturedId}
            onPlay={play}
            onToggleFavorite={toggleFavorite}
            onMarkWatched={markWatched}
            onDismissFromContinue={dismissFromContinue}
          />
        ) : tab === 'watched' ? (
          <WatchedView records={watched} onExport={exportWatched} />
        ) : tab === 'catalog' ? (
          <CatalogView
            catalog={catalog}
            filter={catalogFilter}
            onFilterChange={setCatalogFilter}
            downloaded={downloadedCatalogIds}
            progress={progress}
            onDownload={download}
            onHover={(entry) => setFeaturedId(items.find((item) => normalize(item.title) === normalize(entry.title))?.id ?? null)}
          />
        ) : (
          <StreamingView
            providers={media.streamingProviders}
            featuredTitle={featured?.title}
            onProviderChange={(id, patch) =>
              saveSettings({
                media: {
                  ...media,
                  streamingProviders: media.streamingProviders.map((provider) =>
                    provider.id === id ? { ...provider, ...patch } : provider
                  )
                }
              })
            }
          />
        )}
      </div>
      {playing && (
        <CinemaPlayer
          item={playing}
          media={media}
          resumeFromSeconds={(() => {
            const record = watched.find((r) => r.mediaId === playing.id)
            if (!record || record.completed) return 0
            const pos = record.lastPositionSeconds ?? 0
            // Don't bother resuming if you barely watched (< 20s) or you were
            // already at the very end — start over instead.
            return pos > 20 && pos < (record.durationSeconds ?? Infinity) - 30 ? pos : 0
          })()}
          onWatched={() => {
            void reload()
          }}
          onClose={() => {
            setPlaying(null)
            void reload()
          }}
        />
      )}
    </RouteTransition>
  )
}

function CinemaBackdrop({ item }: { item?: MediaItem }): JSX.Element {
  const image = item?.banner ?? item?.cover
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      <AnimatePresence mode="wait">
        <motion.div
          key={item?.id ?? 'cinema-empty'}
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="absolute inset-0"
        >
          {image && (
            <div
              className="absolute inset-0 opacity-45"
              style={{
                backgroundImage: `url(${image})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(42px) saturate(160%)',
                transform: 'scale(1.12)'
              }}
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,10,0.96),rgba(5,6,10,0.48)_45%,rgba(5,6,10,0.9)),linear-gradient(180deg,rgba(5,6,10,0.12),#05060a_76%)]" />
          <div className="absolute inset-0 shadow-[inset_0_0_180px_rgba(0,0,0,0.72)]" />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function SourceBar({
  media,
  onAddRoot,
  onRemoveRoot,
  onSetDownloadRoot,
  onChange
}: {
  media: MediaSettings
  onAddRoot: () => void
  onRemoveRoot: (path: string) => void
  onSetDownloadRoot: () => void
  onChange: (patch: Partial<MediaSettings>) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-black/20 backdrop-blur-md">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Folder className="w-4 h-4 text-accent" />
          Fontes de cinema
        </span>
        <span className="text-xs text-slate-500">{media.mediaRoots.length} pasta(s)</span>
      </button>
      {open && (
        <div className="border-t border-white/10 px-4 py-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {media.mediaRoots.map((root) => (
              <span
                key={root}
                className="inline-flex max-w-full items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5"
              >
                <code className="truncate text-xs text-slate-300">{root}</code>
                <button type="button" onClick={() => onRemoveRoot(root)} className="text-rose-300 hover:text-rose-200">
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onAddRoot} className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/15">
              Adicionar pasta
            </button>
            <button type="button" onClick={onSetDownloadRoot} className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/15">
              Destino: {media.downloadRoot || 'GameHub'}
            </button>
            <button
              type="button"
              data-ui-sound="toggle"
              onClick={() =>
                onChange({
                  playerMode: media.playerMode === 'internal' ? 'external' : 'internal',
                  openInExternalPlayer: media.playerMode === 'internal'
                })
              }
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                media.playerMode === 'internal' ? 'bg-accent text-ink-950' : 'bg-white/10 text-slate-300'
              }`}
            >
              {media.playerMode === 'internal' ? 'Player interno' : 'Player externo'}
            </button>
            <button
              type="button"
              data-ui-sound="toggle"
              onClick={() => onChange({ subtitlesEnabled: !media.subtitlesEnabled })}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                media.subtitlesEnabled ? 'bg-accent text-ink-950' : 'bg-white/10 text-slate-300'
              }`}
            >
              Legendas
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-white/10 pt-4 md:grid-cols-4">
            <label className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Idioma</span>
              <select
                value={media.preferredSubtitleLanguage}
                onChange={(e) => onChange({ preferredSubtitleLanguage: e.currentTarget.value })}
                className="mt-1 w-full bg-ink-900 text-sm text-slate-100 outline-none"
              >
                <option value="">Auto</option>
                <option value="pt-BR">Português BR</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </label>
            <label className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 md:col-span-2">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Tamanho da legenda</span>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={0.75}
                  max={1.6}
                  step={0.05}
                  value={media.subtitleFontScale}
                  onChange={(e) => onChange({ subtitleFontScale: Number(e.currentTarget.value) })}
                  className="min-w-0 flex-1 accent-cyan-300"
                />
                <span className="w-12 text-right text-xs font-mono text-slate-300">
                  {Math.round(media.subtitleFontScale * 100)}%
                </span>
              </div>
            </label>
            <button
              type="button"
              data-ui-sound="toggle"
              onClick={() => onChange({ subtitleBackground: !media.subtitleBackground })}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                media.subtitleBackground ? 'bg-white/15 text-white' : 'bg-white/5 text-slate-300'
              }`}
            >
              Fundo da legenda
            </button>
            {media.streamingProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                data-ui-sound="toggle"
                onClick={() =>
                  onChange({
                    streamingProviders: media.streamingProviders.map((candidate) =>
                      candidate.id === provider.id ? { ...candidate, enabled: !candidate.enabled } : candidate
                    )
                  })
                }
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  provider.enabled ? 'bg-white/15 text-white' : 'bg-white/5 text-slate-300'
                }`}
              >
                {provider.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function StreamingView({
  providers,
  featuredTitle,
  onProviderChange
}: {
  providers: MediaStreamingProvider[]
  featuredTitle?: string
  onProviderChange: (id: MediaStreamingProviderId, patch: Partial<MediaStreamingProvider>) => void
}): JSX.Element {
  const [query, setQuery] = useState(featuredTitle ?? '')
  const enabledProviders = providers.filter((provider) => provider.enabled)

  useEffect(() => {
    if (featuredTitle) setQuery((current) => (current.trim() ? current : featuredTitle))
  }, [featuredTitle])

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-white/10 bg-black/25 p-5 backdrop-blur-md">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-accent">
              <MonitorPlay className="w-4 h-4" /> Streaming oficial
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold">Prime Video no modo Cinema</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Abre o Prime Video pelo site oficial. O login, o DRM e o codigo de registro ficam no fluxo da Amazon.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row md:w-[440px]">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Buscar filme ou serie"
                className="h-11 w-full rounded-md border border-white/10 bg-white/[0.06] pl-9 pr-3 text-sm text-white outline-none focus:border-accent/60"
              />
            </label>
            {featuredTitle && (
              <button
                type="button"
                onClick={() => setQuery(featuredTitle)}
                className="h-11 rounded-md bg-white/10 px-3 text-xs font-semibold text-slate-200 hover:bg-white/15"
              >
                Usar destaque
              </button>
            )}
          </div>
        </div>
      </section>

      {enabledProviders.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center text-slate-400">
          Nenhuma fonte de streaming ativa. Ative o Prime Video em Fontes de cinema.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {enabledProviders.map((provider) => (
            <StreamingProviderCard
              key={provider.id}
              provider={provider}
              query={query}
              onToggle={() => onProviderChange(provider.id, { enabled: !provider.enabled })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StreamingProviderCard({
  provider,
  query,
  onToggle
}: {
  provider: MediaStreamingProvider
  query: string
  onToggle: () => void
}): JSX.Element {
  const searchUrl = provider.searchUrl.replace('{query}', encodeURIComponent(query.trim()))
  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-black/30 backdrop-blur-md">
      <div className="relative min-h-[220px] p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(0,168,225,0.26),transparent_30%),radial-gradient(circle_at_85%_20%,rgba(255,255,255,0.12),transparent_24%),linear-gradient(135deg,rgba(0,0,0,0.2),rgba(0,0,0,0.86))]" />
        <div className="relative flex h-full min-h-[180px] flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-100">
              <MonitorPlay className="h-3.5 w-3.5" /> Conta externa
            </div>
            <h3 className="mt-5 font-display text-4xl font-bold">{provider.name}</h3>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              Use sua assinatura no ambiente oficial. O GameHub apenas abre a pagina, sem capturar credenciais.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openTrustedStreamingUrl(provider.baseUrl)}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink-950 shadow-glow"
            >
              <ExternalLink className="w-4 h-4" /> Abrir
            </button>
            <button
              type="button"
              disabled={!query.trim()}
              onClick={() => openTrustedStreamingUrl(searchUrl)}
              className="inline-flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/15 disabled:opacity-45"
            >
              <Search className="w-4 h-4" /> Buscar titulo
            </button>
            <button
              type="button"
              onClick={() => openTrustedStreamingUrl(provider.activationUrl)}
              className="inline-flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/15"
            >
              <ExternalLink className="w-4 h-4" /> Registrar dispositivo
            </button>
            <button
              type="button"
              data-ui-sound="toggle"
              onClick={onToggle}
              className="rounded-md bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10"
            >
              Ocultar
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function LibraryView({
  items,
  watched,
  featured,
  onHover,
  onPlay,
  onToggleFavorite,
  onMarkWatched,
  onDismissFromContinue
}: {
  items: MediaItem[]
  watched: MediaWatchRecord[]
  featured?: MediaItem
  onHover: (id: string) => void
  onPlay: (item: MediaItem) => void
  onToggleFavorite: (id: string) => void
  onMarkWatched: (id: string, completed: boolean) => void
  onDismissFromContinue: (id: string) => void
}): JSX.Element {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-10 text-center text-slate-400">
        Nenhum filme encontrado ainda.
      </div>
    )
  }
  // Build an id → progress map so cards can render a Netflix-style red bar
  // and a "Continuar assistindo" shelf can surface in-progress items on top.
  const watchedById = useMemo(() => {
    const map = new Map<string, MediaWatchRecord>()
    for (const record of watched) map.set(record.mediaId, record)
    return map
  }, [watched])
  const continueWatching = useMemo(() => {
    return items
      .map((item) => ({ item, record: watchedById.get(item.id) }))
      .filter(({ record }) => record && !record.completed && (record.progressPercent ?? 0) > 3)
      .sort((a, b) =>
        (b.record?.lastWatchedAt ?? '').localeCompare(a.record?.lastWatchedAt ?? '')
      )
      .slice(0, 12)
      .map(({ item }) => item)
  }, [items, watchedById])
  const myList = useMemo(
    () =>
      items
        .filter((item) => item.favorite)
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, 18),
    [items]
  )
  const series = groupSeries(items)
  const groupedIds = new Set(series.flatMap((group) => group.items.map((item) => item.id)))
  const standalone = items.filter((item) => !groupedIds.has(item.id))

  // Hero pool — recently watched + favorites + items with rich artwork, max 5.
  const heroPool = useMemo(() => {
    const withArt = items.filter((item) => item.banner || item.cover)
    const recent = watched
      .map((r) => withArt.find((item) => item.id === r.mediaId))
      .filter((item): item is MediaItem => Boolean(item))
      .slice(0, 2)
    const favs = withArt.filter((item) => item.favorite).slice(0, 2)
    const fillers = withArt
      .filter((item) => item.banner)
      .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))
    const seen = new Set<string>()
    const out: MediaItem[] = []
    for (const item of [...recent, ...favs, ...fillers]) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
      if (out.length >= 5) break
    }
    if (out.length === 0 && featured) out.push(featured)
    return out
  }, [items, watched, featured])

  // Group standalone items by genre so the user gets Netflix-style genre rows.
  const standaloneByGenre = useMemo(() => {
    const map = new Map<string, MediaItem[]>()
    for (const item of items) {
      if (!item.genre) continue
      // First-genre split (most files have a single genre or comma-separated list).
      const primary = item.genre.split(/[,/|]/)[0].trim()
      if (!primary) continue
      const bucket = map.get(primary) ?? []
      bucket.push(item)
      map.set(primary, bucket)
    }
    return Array.from(map.entries())
      .filter(([, list]) => list.length >= 2)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, list]) => ({ label, items: list }))
  }, [items])

  // Card render with full action wiring — used by every row to avoid duplication.
  const renderCard = useCallback(
    (item: MediaItem, opts?: { showDismiss?: boolean }): JSX.Element => (
      <MediaCard
        key={item.id}
        item={item}
        record={watchedById.get(item.id)}
        onHover={() => onHover(item.id)}
        onPlay={() => onPlay(item)}
        onToggleFavorite={() => onToggleFavorite(item.id)}
        onMarkWatched={(completed) => onMarkWatched(item.id, completed)}
        onDismissFromContinue={() => onDismissFromContinue(item.id)}
        showDismiss={opts?.showDismiss}
      />
    ),
    [watchedById, onHover, onPlay, onToggleFavorite, onMarkWatched, onDismissFromContinue]
  )

  return (
    <>
      {heroPool.length > 0 && (
        <NetflixHero
          items={heroPool}
          onPlay={onPlay}
          onToggleFavorite={onToggleFavorite}
          onHover={onHover}
        />
      )}

      <div className="space-y-10 relative z-10">
        {continueWatching.length > 0 && (
          <MediaRow
            title="Continuar assistindo"
            icon={<Play className="h-4 w-4 fill-accent text-accent" />}
            count={continueWatching.length}
          >
            {continueWatching.map((item) => renderCard(item, { showDismiss: true }))}
          </MediaRow>
        )}

        {myList.length > 0 && (
          <MediaRow
            title="Minha lista"
            icon={<Bookmark className="h-4 w-4 fill-amber-300 text-amber-300" />}
            count={myList.length}
          >
            {myList.map((item) => renderCard(item))}
          </MediaRow>
        )}

        {standaloneByGenre.map((bucket) => (
          <MediaRow
            key={bucket.label}
            title={bucket.label}
            icon={<Film className="h-4 w-4 text-accent" />}
            count={bucket.items.length}
          >
            {bucket.items.map((item) => renderCard(item))}
          </MediaRow>
        ))}

        {standalone.length > 0 && (
          <MediaRow
            title="Filmes e documentários"
            icon={<Film className="h-4 w-4 text-accent" />}
            count={standalone.length}
          >
            {standalone.map((item) => renderCard(item))}
          </MediaRow>
        )}

        {series.length > 0 && (
          <section>
            <div className="mb-4 flex items-center gap-2 px-1">
              <Tv className="h-4 w-4 text-accent" />
              <h3 className="font-display text-2xl font-bold">Séries</h3>
              <span className="text-xs text-slate-500">{series.length}</span>
            </div>
            <div className="space-y-6">
              {series.map((group) => (
                <SeriesCollectionCard
                  key={group.key}
                  group={group}
                  onHover={() => onHover(group.items[0].id)}
                  onPlay={(item) => onPlay(item)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}

/**
 * Netflix-style rotating hero. Big banner background, title meta CTA over a
 * darkened gradient, auto-cycles every 9 s. Pauses when the user hovers
 * (so they can read the description). Dots indicator at the bottom.
 */
function NetflixHero({
  items,
  onPlay,
  onToggleFavorite,
  onHover
}: {
  items: MediaItem[]
  onPlay: (item: MediaItem) => void
  onToggleFavorite: (id: string) => void
  onHover: (id: string) => void
}): JSX.Element {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || items.length <= 1) return
    const handle = window.setInterval(() => {
      setIndex((current) => (current + 1) % items.length)
    }, 9000)
    return () => window.clearInterval(handle)
  }, [paused, items.length])

  // Notify the parent backdrop component about the focused item so its blurred
  // background tracks with the hero (otherwise it stays on the first item).
  useEffect(() => {
    if (items[index]) onHover(items[index].id)
  }, [index, items, onHover])

  if (items.length === 0) return <></>
  const current = items[Math.min(index, items.length - 1)]
  const image = current.banner ?? current.cover

  return (
    <section
      className="relative mb-10 overflow-hidden rounded-2xl border border-white/10"
      style={{ height: 'clamp(360px, 52vh, 540px)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="absolute inset-0"
        >
          {image && (
            <img
              src={image}
              alt={current.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,10,0.95)_0%,rgba(5,6,10,0.65)_30%,rgba(5,6,10,0.18)_55%,rgba(5,6,10,0.12)_75%,rgba(5,6,10,0.85)_100%),linear-gradient(180deg,rgba(5,6,10,0.05)_55%,rgba(5,6,10,0.92)_100%)]" />
        </motion.div>
      </AnimatePresence>

      {/* Content layer */}
      <div className="relative z-10 flex h-full flex-col justify-end p-8 lg:p-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={`content-${current.id}`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.42, ease: 'easeOut' }}
            className="max-w-3xl"
          >
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-accent">
              <Film className="h-3 w-3" /> Em destaque
            </div>
            <h2 className="font-display text-4xl font-bold leading-tight text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.85)] lg:text-6xl">
              {current.title}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-200">
              <span className="rounded-md bg-white/15 px-2 py-0.5 uppercase tracking-wider">
                {kindLabel(current.kind)}
              </span>
              {current.year && <span>{current.year}</span>}
              {current.genre && <span>{current.genre}</span>}
              <span>{formatSize(current.sizeBytes)}</span>
            </div>
            {current.description && (
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-200 line-clamp-3 lg:text-base">
                {current.description}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onPlay(current)}
                className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-sm font-bold text-ink-950 transition hover:bg-slate-200"
              >
                <Play className="h-4 w-4 fill-current" /> Assistir
              </button>
              <button
                type="button"
                onClick={() => onToggleFavorite(current.id)}
                className={`inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold backdrop-blur transition ${
                  current.favorite
                    ? 'bg-amber-300 text-ink-950'
                    : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                {current.favorite ? (
                  <>
                    <Bookmark className="h-4 w-4 fill-current" /> Na minha lista
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> Minha lista
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots indicator */}
      {items.length > 1 && (
        <div className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Ir para destaque ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index
                  ? 'w-8 bg-white shadow-[0_0_12px_rgba(255,255,255,0.45)]'
                  : 'w-3 bg-white/30 hover:bg-white/55'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Horizontal Netflix-style scroller. Mouse-wheel/drag-friendly, with chevron
 * buttons that fade in on hover when there's content to scroll.
 */
function MediaRow({
  title,
  icon,
  count,
  children
}: {
  title: string
  icon?: React.ReactNode
  count?: number
  children: React.ReactNode
}): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const recompute = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 8)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }, [])

  useEffect(() => {
    recompute()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener('scroll', recompute, { passive: true })
    const obs = new ResizeObserver(recompute)
    obs.observe(el)
    return () => {
      el.removeEventListener('scroll', recompute)
      obs.disconnect()
    }
  }, [recompute, children])

  const scrollBy = (delta: number): void => {
    scrollerRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <section className="group/row">
      <div className="mb-3 flex items-center gap-2 px-1">
        {icon}
        <h3 className="font-display text-xl font-bold lg:text-2xl">{title}</h3>
        {count != null && <span className="text-xs text-slate-500">{count}</span>}
      </div>
      <div className="relative">
        {/* Left chevron */}
        <button
          type="button"
          onClick={() => scrollBy(-scrollerRef.current!.clientWidth * 0.8)}
          aria-label="Rolar para a esquerda"
          className={`absolute left-0 top-0 z-20 hidden h-full w-10 items-center justify-center rounded-l-xl bg-gradient-to-r from-ink-950/90 to-transparent text-white opacity-0 transition-opacity duration-200 hover:from-ink-950 group-hover/row:opacity-100 disabled:pointer-events-none disabled:opacity-0 sm:flex`}
          disabled={!canLeft}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        {/* Right chevron */}
        <button
          type="button"
          onClick={() => scrollBy(scrollerRef.current!.clientWidth * 0.8)}
          aria-label="Rolar para a direita"
          className={`absolute right-0 top-0 z-20 hidden h-full w-10 items-center justify-center rounded-r-xl bg-gradient-to-l from-ink-950/90 to-transparent text-white opacity-0 transition-opacity duration-200 hover:from-ink-950 group-hover/row:opacity-100 disabled:pointer-events-none disabled:opacity-0 sm:flex`}
          disabled={!canRight}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
        <div
          ref={scrollerRef}
          className="flex gap-3 overflow-x-auto scroll-smooth pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ scrollSnapType: 'x proximity' }}
        >
          {/* Render children inside a fixed-width grid-card wrapper so each
              card has a consistent width regardless of MediaCard internals. */}
          {Array.isArray(children)
            ? (children as React.ReactNode[]).map((child, i) => (
                <div
                  key={i}
                  className="shrink-0 [scroll-snap-align:start]"
                  style={{ width: 'clamp(150px, 13vw, 200px)' }}
                >
                  {child}
                </div>
              ))
            : (
                <div className="shrink-0" style={{ width: 'clamp(150px, 13vw, 200px)' }}>
                  {children}
                </div>
              )}
        </div>
      </div>
    </section>
  )
}

interface SeriesGroup {
  key: string
  title: string
  items: MediaItem[]
  seasons: number
  seasonSplits: Array<{ season: number; items: MediaItem[] }>
  cover?: string
  banner?: string
}

function SeriesCollectionCard({
  group,
  onHover,
  onPlay
}: {
  group: SeriesGroup
  onHover: () => void
  onPlay: (item: MediaItem) => void
}): JSX.Element {
  const first = group.items[0]
  const initialSeason = group.seasonSplits[0]?.season ?? 0
  const [selectedSeason, setSelectedSeason] = useState<number>(initialSeason)
  useEffect(() => {
    if (!group.seasonSplits.some((season) => season.season === selectedSeason)) {
      setSelectedSeason(group.seasonSplits[0]?.season ?? 0)
    }
  }, [group.seasonSplits, selectedSeason])
  const selectedSeasonItems =
    group.seasonSplits.find((season) => season.season === selectedSeason)?.items ?? group.items
  const selectedSeasonLabel =
    selectedSeason > 0 ? `Temporada ${String(selectedSeason).padStart(2, '0')}` : 'Especiais'
  return (
    <motion.article
      onMouseEnter={onHover}
      onFocus={onHover}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-left shadow-2xl backdrop-blur-md transition hover:border-accent/50"
    >
      <div className="relative h-[clamp(210px,29vw,300px)] overflow-hidden bg-white/[0.04]">
        {(group.banner ?? group.cover) ? (
          <img
            src={group.banner ?? group.cover}
            alt={group.title}
            className="absolute inset-0 h-full w-full object-cover opacity-88 transition duration-700 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-5 font-display text-2xl font-bold text-slate-300">
            {group.title}
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(1,4,10,0.94)_0%,rgba(1,4,10,0.74)_42%,rgba(1,4,10,0.22)_70%,rgba(1,4,10,0.55)_100%)]" />
        <div className="absolute left-0 top-0 p-5 lg:p-6">
          <div className="text-[10px] uppercase tracking-[0.26em] text-accent/90">
            {group.seasons} temporada(s) - {group.items.length} episodio(s)
          </div>
          <h3 className="mt-2 max-w-2xl text-2xl font-display font-bold text-white lg:text-3xl">{group.title}</h3>
          <p className="mt-1 max-w-2xl text-xs text-slate-200 lg:text-sm">
            {selectedSeasonLabel} - {selectedSeasonItems.length} episodio(s)
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onPlay(selectedSeasonItems[0] ?? first)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-xs font-semibold text-ink-950 shadow-glow lg:text-sm"
            >
              <Play className="h-4 w-4 fill-current" />
              Assistir temporada
            </button>
            <button
              type="button"
              onClick={() => onPlay(first)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-white/10 px-3.5 text-xs font-semibold text-slate-100 hover:bg-white/15 lg:text-sm"
            >
              Continuar serie
            </button>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 p-4">
        <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-slate-400">Temporadas</div>
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {group.seasonSplits.map((season) => {
            const firstEpisode = season.items[0]
            const label = season.season > 0 ? `T${String(season.season).padStart(2, '0')}` : 'Especiais'
            const active = season.season === selectedSeason
            return (
              <button
                key={`${group.key}-${season.season}`}
                type="button"
                onClick={() => setSelectedSeason(season.season)}
                onDoubleClick={() => onPlay(firstEpisode)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition ${
                  active
                    ? 'border-accent/60 bg-accent/20 text-white'
                    : 'border-white/12 bg-white/8 text-slate-200 hover:border-accent/50 hover:bg-white/12'
                }`}
              >
                <span>{label}</span>
                <span className="text-slate-400">{season.items.length}</span>
              </button>
            )
          })}
        </div>
        <div className="grid grid-flow-col auto-cols-[190px] gap-2.5 overflow-x-auto pb-1 lg:auto-cols-[210px]">
          {selectedSeasonItems.map((episode) => (
            <button
              key={episode.id}
              type="button"
              onClick={() => onPlay(episode)}
              className="group/ep overflow-hidden rounded-lg border border-white/12 bg-black/25 text-left hover:border-accent/50 hover:bg-white/8"
            >
              <div className="aspect-video bg-white/5">
                {(episode.banner ?? group.banner ?? group.cover) ? (
                  <img
                    src={episode.banner ?? group.banner ?? group.cover}
                    alt={episode.title}
                    className="h-full w-full object-cover opacity-85 transition duration-500 group-hover/ep:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">{episodeCode(episode)}</div>
                )}
              </div>
              <div className="p-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-accent">{episodeCode(episode)}</div>
                <div className="mt-1 line-clamp-2 text-[11px] font-semibold text-slate-100 lg:text-xs">
                  {episodeDisplayTitle(episode)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </motion.article>
  )
}

function WatchedView({
  records,
  onExport
}: {
  records: MediaWatchRecord[]
  onExport: () => void
}): JSX.Element {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-10 text-center text-slate-400">
        Nada assistido ainda. Quando voce reproduzir um filme ou episodio, o GameHub vai guardar aqui.
      </div>
    )
  }
  const completed = records.filter((record) => record.completed).length
  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-xl border border-white/10 bg-black/24 p-5 backdrop-blur-md md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.32em] text-accent">Historico preservado</div>
          <h2 className="mt-2 font-display text-3xl font-bold">Lista de assistidos</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
            Guarda capa, progresso e dados principais em uma base separada da biblioteca local.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200">
            {completed}/{records.length} concluidos
          </span>
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink-950 shadow-glow"
          >
            <Download className="h-4 w-4" /> Backup
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {records.map((record) => (
          <article key={record.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/25 backdrop-blur-md">
            <div className="grid grid-cols-[92px_1fr] gap-4 p-4">
              <div className="aspect-[2/3] overflow-hidden rounded-lg bg-white/5">
                {record.cover ? (
                  <img src={record.cover} alt={record.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center p-3 text-center text-xs font-bold text-slate-300">
                    {record.title}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-accent">{kindLabel(record.kind)}</div>
                <h3 className="mt-1 line-clamp-2 font-display text-xl font-bold">{record.title}</h3>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                  {record.year && <span>{record.year}</span>}
                  {record.genre && <span>{record.genre}</span>}
                  <span>{new Date(record.lastWatchedAt).toLocaleDateString()}</span>
                </div>
                <div className="mt-4">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${record.completed ? 100 : record.progressPercent ?? 0}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                    <span>{record.completed ? 'Concluido' : `${record.progressPercent ?? 0}% visto`}</span>
                    <span>{record.watchCount} vez(es)</span>
                  </div>
                </div>
                {record.archivedBecauseMissing && (
                  <div className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[11px] text-amber-100">
                    Arquivo nao encontrado, historico preservado.
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function CatalogView({
  catalog,
  filter,
  onFilterChange,
  downloaded,
  progress,
  onDownload,
  onHover
}: {
  catalog: MediaCatalogEntry[]
  filter: CatalogFilter
  onFilterChange: (filter: CatalogFilter) => void
  downloaded: Set<string>
  progress: Map<string, MediaDownloadProgress>
  onDownload: (entry: MediaCatalogEntry) => void
  onHover: (entry: MediaCatalogEntry) => void
}): JSX.Element {
  const visible = catalog.filter((entry) => filter === 'all' || entry.kind === filter)
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segment active={filter === 'all'} label="Todos" onClick={() => onFilterChange('all')} />
        <Segment active={filter === 'movie'} label="Filmes" onClick={() => onFilterChange('movie')} />
        <Segment active={filter === 'episode'} label="Séries" onClick={() => onFilterChange('episode')} />
        <Segment active={filter === 'documentary'} label="Docs" onClick={() => onFilterChange('documentary')} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((entry) => (
          <CatalogCard
            key={entry.id}
            entry={entry}
            installed={downloaded.has(entry.id)}
            progress={progress.get(entry.id)}
            onDownload={() => onDownload(entry)}
            onHover={() => onHover(entry)}
          />
        ))}
      </div>
    </>
  )
}

function MediaCard({
  item,
  record,
  onHover,
  onPlay,
  onToggleFavorite,
  onMarkWatched,
  onDismissFromContinue,
  showDismiss = false
}: {
  item: MediaItem
  record?: MediaWatchRecord
  onHover: () => void
  onPlay: () => void
  onToggleFavorite?: () => void
  onMarkWatched?: (completed: boolean) => void
  onDismissFromContinue?: () => void
  showDismiss?: boolean
}): JSX.Element {
  const completed = record?.completed === true
  const progressPct = completed ? 100 : record?.progressPercent ?? 0
  const hasProgress = progressPct > 0

  // Stop propagation on the quick-action buttons so clicking them doesn't
  // also trigger the card's onPlay handler.
  const stopAnd = (fn?: () => void) => (event: React.MouseEvent): void => {
    event.stopPropagation()
    event.preventDefault()
    fn?.()
  }

  return (
    <motion.div
      layout
      onMouseEnter={onHover}
      onFocus={onHover}
      className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] transition hover:-translate-y-1 hover:border-accent/50"
    >
      {/* Outer clickable area is a div, not a button, so the absolute-positioned
          quick-action buttons aren't nested inside a button (invalid HTML and
          source of the validateDOMNesting React warning). */}
      <div
        role="button"
        tabIndex={0}
        onClick={onPlay}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onPlay()
          }
        }}
        className="block w-full cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="relative aspect-[2/3] bg-gradient-to-br from-slate-800 to-ink-950">
          {item.cover ? (
            <img src={item.cover} alt={item.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center font-display text-lg font-bold text-slate-300">
              {item.title}
            </div>
          )}
          {/* Watched badge (top-left) */}
          {completed && (
            <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-emerald-500/85 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-50 shadow">
              <CheckCircle2 className="h-3 w-3" /> Visto
            </div>
          )}
          {/* Quick actions overlay — appears on hover */}
          <div className="pointer-events-none absolute inset-0 flex items-end justify-end gap-1.5 bg-gradient-to-t from-black/60 via-transparent to-black/30 p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <div className="pointer-events-auto flex flex-wrap gap-1.5">
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={stopAnd(onToggleFavorite)}
                  title={item.favorite ? 'Remover da Minha lista' : 'Adicionar à Minha lista'}
                  className={`rounded-md p-1.5 backdrop-blur-md transition ${
                    item.favorite
                      ? 'bg-amber-300 text-ink-950'
                      : 'bg-black/70 text-slate-100 hover:bg-black/85'
                  }`}
                >
                  {item.favorite ? (
                    <Bookmark className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <BookmarkPlus className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              {onMarkWatched && (
                <button
                  type="button"
                  onClick={stopAnd(() => onMarkWatched(!completed))}
                  title={completed ? 'Marcar como não visto' : 'Marcar como visto'}
                  className={`rounded-md p-1.5 backdrop-blur-md transition ${
                    completed
                      ? 'bg-emerald-400 text-ink-950'
                      : 'bg-black/70 text-slate-100 hover:bg-black/85'
                  }`}
                >
                  {completed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
              {showDismiss && onDismissFromContinue && (
                <button
                  type="button"
                  onClick={stopAnd(onDismissFromContinue)}
                  title="Remover de continuar assistindo"
                  className="rounded-md bg-black/70 p-1.5 text-slate-100 backdrop-blur-md transition hover:bg-rose-500/85"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 pb-2">
            <div className="line-clamp-2 text-sm font-bold text-white">{item.title}</div>
          </div>
          {/* In-progress bar */}
          {hasProgress && !completed && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/55">
              <div
                className="h-full bg-rose-500"
                style={{ width: `${Math.min(100, Math.max(2, progressPct))}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            {kindLabel(item.kind)}
            {(item.subtitles?.length ?? 0) > 0 && <Captions className="w-3 h-3 text-accent" />}
          </span>
          <span className="inline-flex items-center gap-1.5">
            {hasProgress && !completed && (
              <span className="font-mono text-[10px] text-rose-300/90">
                {Math.round(progressPct)}%
              </span>
            )}
            {item.favorite && <Star className="w-3 h-3 fill-amber-300 text-amber-300" />}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

function CatalogCard({
  entry,
  installed,
  progress,
  onDownload,
  onHover
}: {
  entry: MediaCatalogEntry
  installed: boolean
  progress?: MediaDownloadProgress
  onDownload: () => void
  onHover: () => void
}): JSX.Element {
  const downloading = progress?.state === 'starting' || progress?.state === 'downloading'
  const failed = progress?.state === 'failed'
  const pct = progress?.total ? Math.round((progress.received / progress.total) * 100) : null
  return (
    <motion.article
      layout
      onMouseEnter={onHover}
      className="overflow-hidden rounded-xl border border-white/10 bg-black/25 backdrop-blur-md"
    >
      <div className="grid grid-cols-[116px_1fr] gap-4 p-4">
        <div className="aspect-[2/3] overflow-hidden rounded-lg bg-white/5">
          {entry.cover ? (
            <img src={entry.cover} alt={entry.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Film className="w-8 h-8 text-accent" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-accent">
            {kindLabel(entry.kind)} · {entry.genre}
          </div>
          <h3 className="mt-1 line-clamp-2 font-display text-xl font-bold leading-tight">{entry.title}</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
            {entry.year && <span>{entry.year}</span>}
            {entry.runtimeMinutes && <span>{entry.runtimeMinutes} min</span>}
            <span>{entry.license}</span>
          </div>
          <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-400">{entry.description}</p>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-3">
        {downloading && (
          <div className="mb-3">
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full bg-accent" animate={{ width: pct ? `${pct}%` : '35%' }} />
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              {formatSize(progress?.received ?? 0)}
              {progress?.total ? ` / ${formatSize(progress.total)}` : ''}
            </div>
          </div>
        )}
        {failed && <div className="mb-2 text-xs text-rose-300">{progress?.error}</div>}
        <div className="flex items-center gap-2">
          {installed ? (
            <button disabled className="flex-1 rounded-md bg-emerald-400/20 px-3 py-2 text-xs font-semibold text-emerald-300 inline-flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Na biblioteca
            </button>
          ) : downloading ? (
            <button disabled className="flex-1 rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-slate-300 inline-flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Baixando
            </button>
          ) : (
            <button
              type="button"
              onClick={onDownload}
              className="flex-1 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-ink-950 inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Baixar
              {entry.approxSizeMb && <span className="opacity-70">~{entry.approxSizeMb}MB</span>}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.api.system.openExternal(entry.sourceUrl)}
            title="Abrir origem"
            className="rounded-md bg-white/10 p-2 text-slate-300 hover:bg-white/15 hover:text-white"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.article>
  )
}

function Segment({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider ${
        active ? 'bg-accent text-ink-950' : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  )
}

function CinemaPlayer({
  item,
  media,
  resumeFromSeconds,
  onWatched,
  onClose
}: {
  item: MediaItem
  media: MediaSettings
  resumeFromSeconds: number
  onWatched: () => void
  onClose: () => void
}): JSX.Element {
  const [localItem, setLocalItem] = useState(item)
  const activeItem = localItem.id === item.id ? localItem : item
  const subtitleTracks = media.subtitlesEnabled ? activeItem.subtitles ?? [] : []
  const cueBackground = media.subtitleBackground ? 'rgba(0,0,0,0.72)' : 'transparent'
  const fontSize = `${Math.round(28 * media.subtitleFontScale)}px`
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hudTimerRef = useRef<number | null>(null)
  const audioProbeTimerRef = useRef<number | null>(null)
  const lastWatchSyncRef = useRef(0)
  const [hudVisible, setHudVisible] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(0.86)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [centerHint, setCenterHint] = useState<string | null>(null)
  const [subtitleBusy, setSubtitleBusy] = useState(false)
  const [subtitleMessage, setSubtitleMessage] = useState<string | null>(null)
  const [audioWarning, setAudioWarning] = useState<string | null>(null)
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>(() => defaultSubtitleId(subtitleTracks))

  function revealHud(persist = false): void {
    setHudVisible(true)
    if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current)
    if (!persist && !paused && !error) {
      hudTimerRef.current = window.setTimeout(() => setHudVisible(false), 2600)
    }
  }

  function clearAudioProbe(): void {
    if (audioProbeTimerRef.current) {
      window.clearTimeout(audioProbeTimerRef.current)
      audioProbeTimerRef.current = null
    }
  }

  function probeAudioCompatibility(): void {
    clearAudioProbe()
    const sourcePath = activeItem.path.toLowerCase()
    const maybeLegacyCodec = /\.(mkv|avi|wmv|mpg|mpeg)$/.test(sourcePath)
    audioProbeTimerRef.current = window.setTimeout(() => {
      const video = videoRef.current as (HTMLVideoElement & {
        audioTracks?: { length: number }
        webkitAudioDecodedByteCount?: number
      }) | null
      if (!video || video.paused || video.muted || video.volume <= 0) return
      const trackCount = video.audioTracks?.length
      const decodedBytes = video.webkitAudioDecodedByteCount
      const noTracks = typeof trackCount === 'number' && trackCount === 0
      const noDecodedAudio = typeof decodedBytes === 'number' && decodedBytes === 0 && video.currentTime >= 2
      if (noTracks || noDecodedAudio || (maybeLegacyCodec && noDecodedAudio)) {
        setAudioWarning('Codec de audio pode nao ser suportado no player interno para este arquivo.')
        revealHud(true)
      } else {
        setAudioWarning(null)
      }
    }, 3200)
  }

  function requestFullscreen(): void {
    const target = videoRef.current
    void target?.requestFullscreen?.()
  }

  async function togglePictureInPicture(): Promise<void> {
    const video = videoRef.current
    if (!video) return
    try {
      // Chromium-only API; not in @types/lib.dom for every TS lib target.
      const doc = document as Document & { pictureInPictureElement?: Element | null; exitPictureInPicture?: () => Promise<void> }
      if (doc.pictureInPictureElement) {
        await doc.exitPictureInPicture?.()
        showCenterHint('PiP desligado')
      } else {
        const v = video as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }
        await v.requestPictureInPicture?.()
        showCenterHint('Picture-in-picture')
      }
    } catch {
      showCenterHint('PiP indisponivel')
    }
  }

  function togglePlayback(): void {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
    showCenterHint(video.paused ? 'Pausado' : 'Reproduzindo')
  }

  function seekBy(seconds: number): void {
    const video = videoRef.current
    if (!video) return
    const next = Math.min(Math.max(video.currentTime + seconds, 0), video.duration || Number.MAX_SAFE_INTEGER)
    video.currentTime = next
    setCurrentTime(next)
    showCenterHint(seconds > 0 ? '+10s' : '-10s')
  }

  function seekTo(value: number): void {
    const video = videoRef.current
    if (!video) return
    video.currentTime = value
    setCurrentTime(value)
    revealHud(true)
  }

  function changeVolume(value: number): void {
    const video = videoRef.current
    const next = Math.min(Math.max(value, 0), 1)
    setVolume(next)
    setMuted(next === 0)
    if (video) {
      video.volume = next
      video.muted = next === 0
    }
  }

  function toggleMute(): void {
    const video = videoRef.current
    const next = !muted
    setMuted(next)
    if (video) video.muted = next
    showCenterHint(next ? 'Sem som' : 'Som ativo')
  }

  function showCenterHint(label: string): void {
    setCenterHint(label)
    window.setTimeout(() => setCenterHint((current) => (current === label ? null : current)), 760)
  }

  async function launchExternalPlayer(closeAfterOpen = false): Promise<void> {
    revealHud(true)
    const result = await window.api.media.open(activeItem.id)
    if ('error' in result) {
      setError(result.error)
      return
    }
    if (closeAfterOpen) {
      await syncWatch()
      onClose()
    }
  }

  function openExternalPlayer(): void {
    void launchExternalPlayer(false)
  }

  async function syncWatch(completedOverride?: boolean): Promise<void> {
    const video = videoRef.current
    const positionSeconds = video?.currentTime ?? currentTime
    const durationSeconds = Number.isFinite(video?.duration) ? video?.duration : duration
    const completed =
      completedOverride ??
      (Number.isFinite(durationSeconds ?? 0) &&
        Boolean(durationSeconds) &&
        positionSeconds / Number(durationSeconds) >= 0.88)
    const result = await window.api.media.recordWatch({
      itemId: activeItem.id,
      positionSeconds,
      durationSeconds,
      completed
    })
    if (!('error' in result)) onWatched()
  }

  function closePlayer(): void {
    void syncWatch()
    onClose()
  }

  async function generateSubtitles(): Promise<void> {
    setSubtitleBusy(true)
    setSubtitleMessage('Gerando legendas PT-BR e English...')
    revealHud(true)
    const result = await window.api.media.generateSubtitles({
      itemId: activeItem.id,
      languages: ['pt-BR', 'en']
    })
    setSubtitleBusy(false)
    if (result.item) {
      setLocalItem(result.item)
      setSelectedSubtitle(defaultSubtitleId(result.item.subtitles ?? []))
    }
    if (result.ok) {
      setSubtitleMessage(`Legendas criadas: ${result.generated.map((entry) => entry.label).join(', ')}`)
      showCenterHint('Legendas prontas')
    } else {
      setSubtitleMessage(result.installHint ?? result.errors[0] ?? 'Nao foi possivel gerar legendas.')
      showCenterHint('Autolegenda indisponivel')
    }
  }

  function applySubtitleSelection(id: string): void {
    const video = videoRef.current
    if (!video) return
    Array.from(video.textTracks).forEach((track, index) => {
      track.mode = id !== 'off' && subtitleTracks[index]?.id === id ? 'showing' : 'disabled'
    })
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    setPaused(false)
    setCurrentTime(0)
    setDuration(0)
    setLocalItem(item)
    setSubtitleMessage(null)
    setAudioWarning(null)
    clearAudioProbe()
    setSelectedSubtitle(defaultSubtitleId(subtitleTracks))
    revealHud(true)
    return () => {
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current)
      clearAudioProbe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  useEffect(() => {
    applySubtitleSelection(selectedSubtitle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubtitle, subtitleTracks.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closePlayer()
      if (event.key.toLowerCase() === 'f') requestFullscreen()
      if (event.key.toLowerCase() === 'm') toggleMute()
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        seekBy(-10)
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        seekBy(10)
      }
      if (event.key === ' ') {
        event.preventDefault()
        togglePlayback()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black text-white"
      onMouseMove={() => revealHud()}
      onFocus={() => revealHud(true)}
    >
      <style>
        {`video::cue { font-size: ${fontSize}; color: white; background: ${cueBackground}; text-shadow: 0 2px 8px rgba(0,0,0,0.9); }`}
      </style>
      {(activeItem.banner || activeItem.cover) && (
        <div
          className="absolute inset-0 opacity-35 blur-3xl scale-110"
          style={{
            backgroundImage: `url(${activeItem.banner ?? activeItem.cover})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.08),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.78),rgba(0,0,0,0.12)_34%,rgba(0,0,0,0.82))]" />

      <AnimatePresence>
        {(hudVisible || paused || loading || error) && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute left-0 right-0 top-0 z-20 bg-gradient-to-b from-black/85 to-transparent px-4 py-4 sm:px-6"
          >
            <div className="pointer-events-auto flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={closePlayer}
                  className="rounded-md bg-white/10 p-2 text-slate-100 hover:bg-white/15"
                  title="Voltar"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-accent">
                    <Film className="h-3.5 w-3.5" /> Assistindo
                  </div>
                  <h2 className="mt-1 truncate font-display text-xl font-bold sm:text-2xl">{activeItem.title}</h2>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={openExternalPlayer}
                  className="hidden rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/15 md:inline-flex"
                >
                  Player externo
                </button>
                <button
                  type="button"
                  onClick={() => void togglePictureInPicture()}
                  className="rounded-md bg-white/10 p-2 text-slate-100 hover:bg-white/15"
                  title="Picture-in-Picture"
                >
                  <PictureInPicture2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={requestFullscreen}
                  className="rounded-md bg-white/10 p-2 text-slate-100 hover:bg-white/15"
                  title="Tela cheia"
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={closePlayer}
                  className="rounded-md bg-white/10 p-2 text-slate-100 hover:bg-white/15"
                  title="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <video
        ref={videoRef}
        data-cinema-video
        src={`gh-media://item/${encodeURIComponent(activeItem.id)}`}
        autoPlay
        poster={activeItem.banner ?? activeItem.cover}
        muted={muted}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget
          video.volume = volume
          video.muted = muted
          setAudioWarning(null)
          setDuration(Number.isFinite(video.duration) ? video.duration : 0)
          // Resume from the last known position if there was one and it's not
          // basically the end of the file. We do it here (instead of inside an
          // effect) so the seek happens before the first paint frame.
          if (resumeFromSeconds > 0 && Number.isFinite(video.duration)) {
            if (resumeFromSeconds < video.duration - 30) {
              video.currentTime = resumeFromSeconds
              setCurrentTime(resumeFromSeconds)
              showCenterHint(`Continuando em ${formatDuration(resumeFromSeconds)}`)
            }
          }
        }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget
          setCurrentTime(video.currentTime)
          if (video.currentTime > 20 && Date.now() - lastWatchSyncRef.current > 15000) {
            lastWatchSyncRef.current = Date.now()
            void syncWatch()
          }
        }}
        onCanPlay={() => {
          setLoading(false)
          applySubtitleSelection(selectedSubtitle)
          revealHud()
        }}
        onWaiting={() => setLoading(true)}
        onPlaying={() => {
          setLoading(false)
          setPaused(false)
          probeAudioCompatibility()
          revealHud()
        }}
        onPause={() => {
          setPaused(true)
          clearAudioProbe()
          void syncWatch()
          revealHud(true)
        }}
        onEnded={() => {
          clearAudioProbe()
          void syncWatch(true)
          revealHud(true)
        }}
        onError={() => {
          setLoading(false)
          setError('Nao foi possivel reproduzir este arquivo no player interno.')
          revealHud(true)
        }}
        onClick={togglePlayback}
        className="relative z-10 h-full w-full object-contain"
      >
        {subtitleTracks.map((subtitle) => (
          <track
            key={subtitle.id}
            kind="subtitles"
            src={`gh-subtitle://item/${encodeURIComponent(activeItem.id)}/${encodeURIComponent(subtitle.id)}.vtt`}
            srcLang={subtitle.language}
            label={subtitle.label}
            default={subtitle.isDefault}
          />
        ))}
      </video>

      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="rounded-full border border-white/10 bg-black/65 px-4 py-2 text-sm text-slate-200 backdrop-blur-md inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-accent" /> Carregando video
          </div>
        </div>
      )}

      <AnimatePresence>
        {centerHint && !error && (
          <motion.div
            key={centerHint}
            initial={{ opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.08 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          >
            <div className="rounded-full border border-white/10 bg-black/58 px-5 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-md">
              {centerHint}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-white/10 bg-black/80 p-5 text-center backdrop-blur-xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-400/15 text-rose-200">
              <X className="h-6 w-6" />
            </div>
            <h3 className="font-display text-2xl font-bold">Formato nao suportado</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{error}</p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={openExternalPlayer}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink-950"
              >
                Abrir no player externo
              </button>
              <button type="button" onClick={closePlayer} className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-slate-200">
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {(hudVisible || paused || loading || error) && !error && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 to-transparent px-4 pb-6 pt-16 sm:px-6"
          >
            <div className="pointer-events-auto rounded-lg border border-white/10 bg-black/42 px-4 py-3 backdrop-blur-md">
              <div className="mb-3 flex items-center gap-3 text-xs font-mono text-slate-300">
                <span className="w-12 text-right">{formatDuration(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={Math.min(currentTime, duration || currentTime)}
                  onChange={(event) => seekTo(Number(event.currentTarget.value))}
                  className="cinema-range min-w-0 flex-1"
                  aria-label="Progresso do video"
                />
                <span className="w-12">{formatDuration(duration)}</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <span>{kindLabel(activeItem.kind)}</span>
                    {activeItem.year && <span>{activeItem.year}</span>}
                    {activeItem.genre && <span>{activeItem.genre}</span>}
                    <span>{formatSize(activeItem.sizeBytes)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Espaco pausa/continua / setas pulam 10s / F tela cheia / M som / Esc voltar
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => seekBy(-10)}
                    className="rounded-md bg-white/10 p-2 text-slate-200 hover:bg-white/15"
                    title="Voltar 10s"
                  >
                    <SkipBack className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={togglePlayback}
                    className="rounded-md bg-accent p-2 text-ink-950 shadow-glow"
                    title={paused ? 'Continuar' : 'Pausar'}
                  >
                    {paused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => seekBy(10)}
                    className="rounded-md bg-white/10 p-2 text-slate-200 hover:bg-white/15"
                    title="Avancar 10s"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="rounded-md bg-white/10 p-2 text-slate-200 hover:bg-white/15"
                    title={muted ? 'Ativar som' : 'Silenciar'}
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={muted ? 0 : volume}
                    onChange={(event) => changeVolume(Number(event.currentTarget.value))}
                    className="cinema-range w-20"
                    aria-label="Volume"
                  />
                  <label className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-xs text-slate-200">
                    <Captions className="h-4 w-4 text-accent" />
                    <select
                      value={selectedSubtitle}
                      onChange={(event) => setSelectedSubtitle(event.currentTarget.value)}
                      className="max-w-[180px] bg-transparent text-xs outline-none"
                    >
                      <option value="off">Sem legenda</option>
                      {subtitleTracks.map((subtitle) => (
                        <option key={subtitle.id} value={subtitle.id}>
                          {subtitle.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {subtitleTracks.length === 0 && (
                    <button
                      type="button"
                      onClick={generateSubtitles}
                      disabled={subtitleBusy}
                      className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/15 disabled:opacity-60"
                    >
                      {subtitleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Captions className="h-4 w-4 text-accent" />}
                      Autolegenda
                    </button>
                  )}
                </div>
              </div>
              {subtitleMessage && (
                <div className="mt-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                  {subtitleMessage}
                </div>
              )}
              {audioWarning && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                  <span>{audioWarning}</span>
                  <button
                    type="button"
                    onClick={openExternalPlayer}
                    className="rounded-md bg-amber-200 px-2.5 py-1 text-[11px] font-semibold text-amber-950"
                  >
                    Abrir no player externo
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function kindLabel(kind: MediaKind): string {
  if (kind === 'documentary') return 'Documentario'
  if (kind === 'episode') return 'Episodio'
  if (kind === 'series') return 'Serie'
  return 'Filme'
}

function groupSeries(items: MediaItem[]): SeriesGroup[] {
  const groups = new Map<string, SeriesGroup>()
  for (const item of items) {
    const title = seriesTitle(item)
    if (!title) continue
    const key = normalizeSeriesKey(title)
    const group = groups.get(key) ?? {
      key,
      title,
      items: [],
      seasons: 0,
      seasonSplits: [],
      cover: item.cover,
      banner: item.banner
    }
    group.items.push(item)
    group.cover = group.cover ?? item.cover
    group.banner = group.banner ?? item.banner
    groups.set(key, group)
  }
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => episodeSortKey(a).localeCompare(episodeSortKey(b))),
      seasons: new Set(group.items.map(seasonNumber).filter((season) => season > 0)).size || 1,
      seasonSplits: splitSeriesBySeason(group.items)
    }))
    .filter((group) => group.items.length > 1 || group.items.some((item) => item.kind === 'episode' || item.kind === 'series'))
    .sort((a, b) => a.title.localeCompare(b.title))
}

function splitSeriesBySeason(items: MediaItem[]): Array<{ season: number; items: MediaItem[] }> {
  const bySeason = new Map<number, MediaItem[]>()
  for (const item of items) {
    const season = seasonNumber(item)
    const bucket = bySeason.get(season) ?? []
    bucket.push(item)
    bySeason.set(season, bucket)
  }
  return Array.from(bySeason.entries())
    .map(([season, seasonItems]) => ({
      season,
      items: seasonItems.sort((a, b) => episodeSortKey(a).localeCompare(episodeSortKey(b)))
    }))
    .sort((a, b) => a.season - b.season)
}

function seriesTitle(item: MediaItem): string | null {
  if (item.kind !== 'episode' && item.kind !== 'series' && !/[Ss]\d{1,2}[Ee]\d{1,2}/.test(item.path)) {
    return null
  }
  const titleWithoutEpisode = item.title.replace(/\bS\d{1,2}E\d{1,2}\b.*$/i, '').trim()
  if (titleWithoutEpisode && titleWithoutEpisode !== item.title) return cleanSeriesLabel(titleWithoutEpisode)
  const parts = item.path.split(/[\\/]+/).filter(Boolean)
  const file = parts.at(-1) ?? item.title
  const parent = parts.at(-2) ?? ''
  const grandParent = parts.at(-3) ?? ''
  if (/^(season|temporada|s\d{1,2})\b/i.test(parent) && grandParent) return cleanSeriesLabel(grandParent)
  if (parent && parent !== file) return cleanSeriesLabel(parent)
  return cleanSeriesLabel(item.title.replace(/\bS\d{1,2}E\d{1,2}\b.*$/i, ''))
}

function cleanSeriesLabel(value: string): string {
  return value
    .replace(/\.[^.]+$/g, '')
    .replace(/[._]+/g, ' ')
    .replace(/\b(19\d{2}|20\d{2})\b/g, '')
    .replace(/\b(480p|720p|1080p|2160p|4k|web-dl|webrip|bluray|x264|x265|h264|h265)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSeriesKey(value: string): string {
  return cleanSeriesLabel(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(and|e)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function episodeSortKey(item: MediaItem): string {
  const match = item.path.match(/[Ss](\d{1,2})[Ee](\d{1,2})/)
  if (!match) return item.title
  return `${match[1].padStart(2, '0')}-${match[2].padStart(3, '0')}-${item.title}`
}

function episodeCode(item: MediaItem): string {
  const match = item.path.match(/[Ss](\d{1,2})[Ee](\d{1,2})/)
  if (!match) return 'EP'
  return `S${match[1].padStart(2, '0')}E${match[2].padStart(2, '0')}`
}

function episodeDisplayTitle(item: MediaItem): string {
  return item.title
    .replace(/\bS\d{1,2}E\d{1,2}\b/gi, '')
    .replace(/\b(480p|720p|1080p|2160p|4k|web-dl|webrip|bluray|x264|x265|h264|h265|ddp?5\.1|5\.1|2\.0)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function seasonNumber(item: MediaItem): number {
  const match = item.path.match(/[Ss](\d{1,2})[Ee]\d{1,2}/)
  return match ? Number(match[1]) : 0
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[index]}`
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function canPlayInternally(path: string): boolean {
  return /\.(mp4|m4v|webm|mov)$/i.test(path)
}

function defaultSubtitleId(subtitleTracks: MediaSubtitle[]): string {
  return subtitleTracks.find((subtitle) => subtitle.isDefault)?.id ?? subtitleTracks[0]?.id ?? 'off'
}

function openTrustedStreamingUrl(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !TRUSTED_STREAMING_HOSTS.has(parsed.hostname.toLowerCase())) {
      return
    }
    void window.api.system.openExternal(parsed.toString())
  } catch {
    // Ignore malformed local settings instead of opening an unsafe external URL.
  }
}

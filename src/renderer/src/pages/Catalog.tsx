import { forwardRef, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Archive,
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  ImageOff,
  Loader2,
  Package,
  Puzzle,
  Scale,
  Settings2,
  Star,
  X
} from 'lucide-react'
import { CURATED_CATALOG, MOD_RECOMMENDATIONS, type CuratedEntry } from '@shared/curated'
import { SYSTEM_REQUIREMENTS, normalizeReqsKey } from '@shared/systemRequirements'
import { MINECRAFT_VERSION_OPTIONS } from '@shared/modCatalog'
import { PLATFORMS } from '@shared/platforms'
import { useLibraryStore } from '../store/library'
import PageHeader from '../components/PageHeader'
import RouteTransition from '../components/RouteTransition'
import type {
  DownloadProgress,
  Game,
  AppSettings,
  MinecraftModLoader,
  ModCatalogEntry,
  ModCatalogSettings,
  ModDownloadProgress,
  ModInstallRecord,
  ModInstallTarget,
  PlatformId,
  GameJourneyRecord
} from '@shared/types'

type MyCatalogEntry = {
  id: string
  title: string
  platform: PlatformId
  cover?: string
  sizeBytes: number
  redownloadUrl?: string
  status: 'instalado' | 'arquivado'
}

/**
 * Visual catalog of legally-redistributable games.
 *
 * Grid of cover-driven cards by default; can be filtered by platform via chips
 * at the top. A "Baixar tudo faltante" button kicks off all downloads in
 * sequence — same outcome as the `--seed-catalog` CLI but from the UI.
 *
 * State per entry: not-downloaded | downloading | failed | installed. We match
 * installed by comparing each library entry's (title, platform) against the
 * curated entries.
 */
export default function Catalog(): JSX.Element {
  const games = useLibraryStore((s) => s.games)
  const settings = useLibraryStore((s) => s.settings)
  const saveSettings = useLibraryStore((s) => s.saveSettings)
  const [progress, setProgress] = useState<Map<string, DownloadProgress>>(new Map())
  const [downloadIdToEntry, setDownloadIdToEntry] = useState<Map<string, string>>(new Map())
  const [activePlatform, setActivePlatform] = useState<PlatformId | 'all'>('all')
  const [bulkRunning, setBulkRunning] = useState(false)
  const [section, setSection] = useState<'games' | 'mine' | 'mods'>('games')
  const [journey, setJourney] = useState<GameJourneyRecord[]>([])
  const [mods, setMods] = useState<ModCatalogEntry[]>([])
  const [modInstalls, setModInstalls] = useState<ModInstallRecord[]>([])
  const [modProgress, setModProgress] = useState<Map<string, ModDownloadProgress>>(new Map())
  const [modDownloadToEntry, setModDownloadToEntry] = useState<Map<string, string>>(new Map())
  const [activeModCategory, setActiveModCategory] = useState<string>('all')
  const [modsLoading, setModsLoading] = useState(false)

  useEffect(() => {
    return window.api.downloads.onProgress((p) => {
      setProgress((prev) => {
        const next = new Map(prev)
        const entryId = downloadIdToEntry.get(p.id)
        if (entryId) next.set(entryId, p)
        return next
      })
      if (p.state === 'finished') {
        void window.api.library.list().then((list) =>
          useLibraryStore.setState({ games: list.games, emulators: list.emulators })
        )
      }
    })
  }, [downloadIdToEntry])

  useEffect(() => {
    setModsLoading(true)
    void Promise.all([window.api.mods.catalog(), window.api.mods.installed()])
      .then(([catalog, installed]) => {
        setMods(catalog)
        setModInstalls(installed)
      })
      .finally(() => setModsLoading(false))
  }, [])

  useEffect(() => {
    void window.api.journey.list().then(setJourney)
  }, [])

  useEffect(() => {
    return window.api.mods.onProgress((p) => {
      const entryId = modDownloadToEntry.get(p.id) ?? p.entryId
      setModProgress((prev) => {
        const next = new Map(prev)
        next.set(entryId, p)
        return next
      })
      if (p.state === 'finished') {
        void window.api.mods.installed().then(setModInstalls)
        if (settings?.mods.openFolderAfterDownload && p.filePath) {
          void window.api.launch.folder(dirname(p.filePath))
        }
      }
    })
  }, [modDownloadToEntry, settings?.mods.openFolderAfterDownload])

  const installedById = useMemo(() => {
    const map = new Map<string, Game>()
    for (const entry of CURATED_CATALOG) {
      const match = games.find(
        (g) => g.title === entry.title && g.platform === entry.platform
      )
      if (match) map.set(entry.id, match)
    }
    return map
  }, [games])

  // Filter chips — only show platforms that actually have entries
  const availablePlatforms = useMemo(() => {
    const set = new Set<PlatformId>()
    for (const e of CURATED_CATALOG) {
      if (e.id === 'tinyfugue-readme') continue
      set.add(e.platform)
    }
    return Array.from(set)
  }, [])

  const visible = useMemo(() => {
    return CURATED_CATALOG.filter((e) => {
      if (e.id === 'tinyfugue-readme') return false
      if (activePlatform !== 'all' && e.platform !== activePlatform) return false
      return true
    })
  }, [activePlatform])

  const missingCount = visible.filter((e) => !installedById.has(e.id)).length
  const missingApproxMb = visible.reduce((total, e) => {
    if (installedById.has(e.id)) return total
    return total + (e.approxSizeMb ?? 0)
  }, 0)

  const myCatalog = useMemo(() => {
    const byId = new Map<string, MyCatalogEntry>()

    for (const game of games) {
      const link =
        game.path.startsWith('steam://') || game.path.startsWith('com.epicgames.launcher://')
          ? game.path
          : undefined
      byId.set(game.id, {
        id: game.id,
        title: game.title,
        platform: game.platform,
        cover: game.cover,
        sizeBytes: game.sizeBytes,
        redownloadUrl: link,
        status: 'instalado'
      })
    }

    for (const record of journey) {
      const current = byId.get(record.gameId)
      if (current) {
        byId.set(record.gameId, {
          ...current,
          redownloadUrl: current.redownloadUrl ?? record.redownloadUrl,
          cover: current.cover ?? record.cover
        })
        continue
      }
      byId.set(record.gameId, {
        id: record.gameId,
        title: record.title,
        platform: record.platform,
        cover: record.cover,
        sizeBytes: 0,
        redownloadUrl: record.redownloadUrl,
        status: 'arquivado'
      })
    }

    return Array.from(byId.values()).sort((a, b) => a.title.localeCompare(b.title))
  }, [games, journey])

  async function install(entry: CuratedEntry): Promise<void> {
    const r = await window.api.downloads.start({
      url: entry.url,
      title: entry.title,
      platform: entry.platform
    })
    if ('error' in r) {
      setProgress((p) => {
        const next = new Map(p)
        next.set(entry.id, {
          id: 'noop',
          url: entry.url,
          title: entry.title,
          state: 'failed',
          received: 0,
          speed: 0,
          error: r.error
        })
        return next
      })
      return
    }
    setDownloadIdToEntry((m) => new Map(m).set(r.id, entry.id))
  }

  async function bulkDownload(): Promise<void> {
    setBulkRunning(true)
    for (const entry of visible) {
      if (installedById.has(entry.id)) continue
      const cur = progress.get(entry.id)
      if (cur?.state === 'downloading' || cur?.state === 'starting') continue
      await install(entry)
      // Tiny breath so the progress UI can update between starts
      await new Promise((r) => setTimeout(r, 200))
    }
    setBulkRunning(false)
  }

  async function installMod(entry: ModCatalogEntry): Promise<void> {
    if (!settings) return
    const r = await window.api.mods.download({
      entryId: entry.id,
      loader: settings.mods.minecraftLoader,
      gameVersion: settings.mods.minecraftVersion,
      installTarget: settings.mods.installTarget,
      customInstallRoot: settings.mods.customInstallRoot
    })
    if ('error' in r) {
      setModProgress((prev) => {
        const next = new Map(prev)
        next.set(entry.id, {
          id: 'noop',
          entryId: entry.id,
          title: entry.title,
          state: 'failed',
          received: 0,
          speed: 0,
          error: r.error
        })
        return next
      })
      return
    }
    setModDownloadToEntry((m) => new Map(m).set(r.id, entry.id))
  }

  return (
    <RouteTransition className="px-12 py-12 max-w-7xl">
      <PageHeader
        title="Catálogo"
        icon={Package}
        subtitle={
          section === 'games'
            ? `${visible.length} jogos homebrew, open-source e demos com licença para redistribuição. Click para baixar e adicionar à biblioteca.`
            : `${mods.length} mods, shaders e modpacks curados para Minecraft com capas e resolução automática pela Modrinth.`
        }
        actions={
          section === 'games' && missingCount > 0 ? (
            <button
              onClick={bulkDownload}
              disabled={bulkRunning}
              className="px-4 py-2 bg-accent text-ink-950 font-semibold rounded-md text-sm flex items-center gap-2 hover:bg-accent/90 disabled:opacity-60 shadow-glow"
            >
              {bulkRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Baixar {missingCount} faltante{missingCount === 1 ? '' : 's'}
              {missingApproxMb > 0 && (
                <span className="opacity-70">~{formatApproxMb(missingApproxMb)}</span>
              )}
            </button>
          ) : undefined
        }
      />

      <div className="mb-6">
        <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
          <Scale className="w-3 h-3 mt-0.5 shrink-0" />
          GameHub apenas linka URLs públicas — não hospeda binários. Adicione suas próprias
          fontes via <Link to="/library" className="text-accent">Biblioteca → Adicionar → Baixar de URL</Link>.
        </p>

        <div className="mt-5 inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
          <SegmentButton
            active={section === 'games'}
            icon={<Package className="w-4 h-4" />}
            label="Jogos"
            onClick={() => setSection('games')}
          />
          <SegmentButton
            active={section === 'mods'}
            icon={<Puzzle className="w-4 h-4" />}
            label="Mods"
            onClick={() => setSection('mods')}
          />
          <SegmentButton
            active={section === 'mine'}
            icon={<Archive className="w-4 h-4" />}
            label="Biblioteca GameHub"
            onClick={() => setSection('mine')}
          />
        </div>

        {/* Platform filter chips */}
        {section === 'games' && (
          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <FilterChip
              label="Todos"
              active={activePlatform === 'all'}
              onClick={() => setActivePlatform('all')}
            />
            {availablePlatforms.map((p) => {
              const def = PLATFORMS[p]
              return (
                <FilterChip
                  key={p}
                  label={def.shortName}
                  color={def.color}
                  active={activePlatform === p}
                  onClick={() => setActivePlatform(p)}
                />
              )
            })}
          </div>
        )}
      </div>

      {section === 'games' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {visible.map((entry) => {
              const installed = installedById.get(entry.id)
              const prog = progress.get(entry.id)
              return (
                <CatalogCard
                  key={entry.id}
                  entry={entry}
                  installed={installed}
                  progress={prog}
                  onInstall={() => install(entry)}
                />
              )
            })}
          </AnimatePresence>
        </div>
      ) : section === 'mine' ? (
        <div className="space-y-3">
          <div className="text-xs text-slate-400">
            Catálogo leve gerado a partir da biblioteca + jornada (zerados/platinados), sem subir binários.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {myCatalog.map((entry) => (
              <MyCatalogCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      ) : (
        <ModCatalogView
          entries={mods}
          installs={modInstalls}
          progress={modProgress}
          loading={modsLoading}
          activeCategory={activeModCategory}
          onCategoryChange={setActiveModCategory}
          onInstall={installMod}
          settings={settings}
          onSettingsChange={(patch) => {
            if (!settings) return
            void saveSettings({ mods: { ...settings.mods, ...patch } })
          }}
        />
      )}

      {section === 'games' && visible.length === 0 && (
        <div className="text-center text-slate-500 py-16">
          Nenhum jogo neste filtro ainda.
        </div>
      )}
      {section === 'mine' && myCatalog.length === 0 && (
        <div className="text-center text-slate-500 py-16">
          Nenhum item ainda. Marque jogos em Conquistas para manter histórico com link e capa.
        </div>
      )}
    </RouteTransition>
  )
}

function SegmentButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-accent text-ink-950 shadow-glow' : 'text-slate-300 hover:bg-white/10'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function MyCatalogCard({ entry }: { entry: MyCatalogEntry }): JSX.Element {
  const platform = PLATFORMS[entry.platform]
  const titleKey = normalizeReqsKey(entry.title)
  const mods = entry.platform === 'pc' ? MOD_RECOMMENDATIONS[titleKey] : undefined
  const reqs = entry.platform === 'pc' ? SYSTEM_REQUIREMENTS[titleKey] : undefined
  const [showReqs, setShowReqs] = useState(false)
  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-white/[0.03]">
      <div
        className="h-36"
        style={{
          background: entry.cover
            ? `url(${entry.cover}) center/cover`
            : `linear-gradient(150deg, ${platform?.color ?? '#64748b'}, rgba(10,12,20,.92))`
        }}
      />
      <div className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-accent">
          {platform?.shortName ?? entry.platform} • {entry.status}
        </div>
        <h3 className="mt-1 font-display font-semibold line-clamp-2">{entry.title}</h3>
        <div className="mt-2 text-xs text-slate-400">
          {entry.sizeBytes > 0 ? formatSize(entry.sizeBytes) : 'Tamanho não medido ainda'}
        </div>
        {reqs && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowReqs((current) => !current)}
              className="text-[11px] inline-flex items-center gap-1 text-accent hover:text-accent/80"
            >
              {showReqs ? 'Ocultar requisitos' : 'Ver requisitos do sistema'}
            </button>
            {showReqs && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <RequirementsBlock label="Mínimo" tone="slate" spec={reqs.minimum} />
                <RequirementsBlock label="Recomendado" tone="emerald" spec={reqs.recommended} />
              </div>
            )}
          </div>
        )}
        {mods && mods.length > 0 && (
          <div className="mt-3 rounded-lg border border-white/5 bg-black/30 p-2">
            <div className="text-[10px] uppercase tracking-wider text-amber-300 mb-1.5 flex items-center gap-1">
              <Puzzle className="w-3 h-3" /> Mods recomendados
            </div>
            <ul className="space-y-1">
              {mods.slice(0, 3).map((mod) => (
                <li key={mod.url}>
                  <button
                    type="button"
                    onClick={() => window.api.system.openExternal(mod.url)}
                    className="text-left w-full text-[11px] text-slate-200 hover:text-accent inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{mod.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          {entry.redownloadUrl ? (
            <button
              type="button"
              onClick={() => window.api.system.openExternal(entry.redownloadUrl!)}
              className="rounded bg-accent px-3 py-1 text-xs font-semibold text-ink-950 hover:bg-accent/90 inline-flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              Baixar
            </button>
          ) : (
            entry.status === 'instalado' ? (
              <Link
                to={`/game/${entry.id}#journey-archive`}
                className="rounded bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/15"
              >
                Definir link
              </Link>
            ) : (
              <span className="text-[11px] text-slate-500">Sem link salvo</span>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function ModCatalogView({
  entries,
  installs,
  progress,
  loading,
  activeCategory,
  onCategoryChange,
  onInstall,
  settings,
  onSettingsChange
}: {
  entries: ModCatalogEntry[]
  installs: ModInstallRecord[]
  progress: Map<string, ModDownloadProgress>
  loading: boolean
  activeCategory: string
  onCategoryChange: (category: string) => void
  onInstall: (entry: ModCatalogEntry) => void
  settings: AppSettings | null
  onSettingsChange: (patch: Partial<ModCatalogSettings>) => void
}): JSX.Element {
  const categories = useMemo(
    () => ['all', ...Array.from(new Set(entries.map((entry) => entry.category))).sort()],
    [entries]
  )
  const visible = useMemo(() => {
    return entries.filter((entry) => activeCategory === 'all' || entry.category === activeCategory)
  }, [activeCategory, entries])
  const installedByEntry = useMemo(() => {
    const map = new Map<string, ModInstallRecord>()
    for (const install of installs) {
      if (!map.has(install.entryId)) map.set(install.entryId, install)
    }
    return map
  }, [installs])

  if (!settings) {
    return <div className="py-16 text-center text-slate-500">Carregando configuracao...</div>
  }

  return (
    <div>
      <section className="glass rounded-xl p-4 mb-5 border border-amber-400/20 bg-amber-400/5">
        <div className="flex items-start gap-2">
          <Puzzle className="w-4 h-4 mt-0.5 text-amber-300" />
          <div>
            <h2 className="font-display font-semibold text-sm">Mods para Minecraft</h2>
            <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
              Estes mods são exclusivos do <strong>Minecraft (Java Edition)</strong> via Modrinth.
              Para mods de outros jogos PC (Skyrim, Elden Ring, Cyberpunk, etc.), abra a aba
              <strong> Biblioteca GameHub</strong> — cada jogo lista mods recomendados na sua ficha.
            </p>
          </div>
        </div>
      </section>
      <section className="glass rounded-xl p-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Settings2 className="w-4 h-4 text-accent" />
          <h2 className="font-display font-semibold">Auto-configuracao de mods (Minecraft)</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SelectSetting
            label="Loader"
            value={settings.mods.minecraftLoader}
            onChange={(v) => onSettingsChange({ minecraftLoader: v as MinecraftModLoader })}
            options={[
              ['fabric', 'Fabric'],
              ['forge', 'Forge'],
              ['neoforge', 'NeoForge'],
              ['quilt', 'Quilt']
            ]}
          />
          <SelectSetting
            label="Versao"
            value={settings.mods.minecraftVersion}
            onChange={(v) => onSettingsChange({ minecraftVersion: v })}
            options={MINECRAFT_VERSION_OPTIONS.map((v) => [
              v,
              v === 'auto' ? 'Auto mais recente' : v
            ])}
          />
          <SelectSetting
            label="Destino"
            value={settings.mods.installTarget}
            onChange={(v) => onSettingsChange({ installTarget: v as ModInstallTarget })}
            options={[
              ['gamehub', 'Pasta GameHub'],
              ['minecraft', '.minecraft real'],
              ['custom', 'Pasta custom']
            ]}
          />
          <label className="rounded-lg bg-white/[0.04] border border-white/5 px-3 py-2">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">
              Abrir pasta
            </span>
            <button
              type="button"
              data-ui-sound="toggle"
              onClick={() =>
                onSettingsChange({
                  openFolderAfterDownload: !settings.mods.openFolderAfterDownload
                })
              }
              className={`mt-1 w-full rounded-md px-3 py-1.5 text-xs font-semibold ${
                settings.mods.openFolderAfterDownload
                  ? 'bg-accent text-ink-950'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {settings.mods.openFolderAfterDownload ? 'Ligado' : 'Desligado'}
            </button>
          </label>
        </div>
        {settings.mods.installTarget === 'custom' && (
          <label className="mt-3 block rounded-lg bg-white/[0.04] border border-white/5 px-3 py-2">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">
              Pasta customizada
            </span>
            <input
              value={settings.mods.customInstallRoot}
              onChange={(e) => onSettingsChange({ customInstallRoot: e.currentTarget.value })}
              placeholder="Ex: D:\\Jogos\\Minecraft\\mods"
              className="mt-1 w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
            />
          </label>
        )}
        <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
          Auto resolve o arquivo compativel pela Modrinth. Para evitar conflito, confira se seu launcher usa o mesmo loader e versao.
        </p>
      </section>

      <div className="mb-5 flex items-center gap-2 flex-wrap">
        {categories.map((category) => (
          <FilterChip
            key={category}
            label={category === 'all' ? 'Todos' : category}
            active={activeCategory === category}
            onClick={() => onCategoryChange(category)}
          />
        ))}
      </div>

      {loading && (
        <div className="py-12 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Atualizando catalogo de mods...
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="py-16 text-center text-slate-500">Nenhum mod neste filtro.</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {visible.map((entry) => (
            <ModCard
              key={entry.id}
              entry={entry}
              install={installedByEntry.get(entry.id)}
              progress={progress.get(entry.id)}
              onInstall={() => onInstall(entry)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

function SelectSetting({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: Array<[string, string]>
  onChange: (value: string) => void
}): JSX.Element {
  return (
    <label className="rounded-lg bg-white/[0.04] border border-white/5 px-3 py-2">
      <span className="text-[10px] uppercase tracking-widest text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="mt-1 w-full bg-ink-900 text-sm text-slate-100 outline-none"
      >
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
}

function ModCard({
  entry,
  install,
  progress,
  onInstall
}: {
  entry: ModCatalogEntry
  install?: ModInstallRecord
  progress?: ModDownloadProgress
  onInstall: () => void
}): JSX.Element {
  const downloading = progress?.state === 'resolving' || progress?.state === 'downloading'
  const failed = progress?.state === 'failed'
  const pct = progress?.total ? Math.round((progress.received / progress.total) * 100) : null
  const [imageOk, setImageOk] = useState(true)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="glass rounded-xl overflow-hidden"
    >
      <div className="p-4 flex gap-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-white/5">
          {entry.iconUrl && imageOk ? (
            <img
              src={entry.iconUrl}
              alt={entry.title}
              onError={() => setImageOk(false)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-accent">
              <Puzzle className="w-9 h-9" />
            </div>
          )}
          {entry.featured && (
            <div className="absolute top-1 left-1 rounded bg-amber-400/90 p-1 text-ink-950">
              <Star className="w-3 h-3 fill-current" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-accent">
                #{entry.rank} · {entry.category}
              </div>
              <h3 className="font-display text-lg font-bold leading-tight line-clamp-2">
                {entry.title}
              </h3>
            </div>
            <span className="rounded bg-white/10 px-2 py-1 text-[10px] uppercase text-slate-300">
              {projectTypeLabel(entry.projectType)}
            </span>
          </div>
          <p className="mt-2 min-h-[3.3em] text-xs leading-snug text-slate-400 line-clamp-3">
            {entry.description}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {entry.loaders.slice(0, 4).map((loader) => (
              <span key={loader} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
                {loader}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 px-4 py-3">
        <div className="mb-3 flex items-center justify-between text-[11px] text-slate-500">
          <span>{entry.downloads ? `${formatNumber(entry.downloads)} downloads` : 'Modrinth'}</span>
          <span>{entry.license ?? 'Licenca no projeto'}</span>
        </div>

        {downloading && (
          <div className="mb-3">
            <div className="h-1 bg-ink-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-accent to-cyan-400"
                animate={{ width: pct ? `${pct}%` : '35%' }}
                transition={{ duration: 0.35 }}
              />
            </div>
            <div className="mt-1 text-[10px] text-slate-500 font-mono">
              {progress?.state === 'resolving'
                ? 'resolvendo versao compativel...'
                : `${formatSize(progress?.received ?? 0)}${progress?.total ? ` / ${formatSize(progress.total)}` : ''}`}
            </div>
          </div>
        )}

        {failed && (
          <div className="mb-3 text-[11px] text-rose-300 flex gap-1">
            <X className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{progress?.error}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {install ? (
            <button
              type="button"
              onClick={() => window.api.launch.folder(dirname(install.filePath))}
              className="flex-1 px-2 py-1.5 bg-emerald-500/20 text-emerald-300 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-emerald-500/30"
            >
              <FolderOpen className="w-3.5 h-3.5" /> Abrir pasta
            </button>
          ) : downloading ? (
            <button
              disabled
              className="flex-1 px-2 py-1.5 bg-white/5 rounded-md text-xs flex items-center justify-center gap-1.5"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Baixando
            </button>
          ) : (
            <button
              type="button"
              onClick={onInstall}
              className="flex-1 px-2 py-1.5 bg-accent text-ink-950 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-accent/90"
            >
              <Download className="w-3.5 h-3.5" /> Baixar mod
            </button>
          )}
          <button
            type="button"
            onClick={() => window.api.system.openExternal(entry.sourceUrl)}
            title="Abrir na Modrinth"
            className="px-2 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-slate-300 hover:text-white"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function FilterChip({
  label,
  active,
  color,
  onClick
}: {
  label: string
  active: boolean
  color?: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={
        active && color
          ? {
              background: `${color}33`,
              borderColor: `${color}66`,
              color: '#fff'
            }
          : undefined
      }
      className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors ${
        active
          ? 'bg-accent/20 border-accent/50 text-white'
          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

interface CatalogCardProps {
  entry: CuratedEntry
  installed?: Game
  progress?: DownloadProgress
  onInstall: () => void
}

// forwardRef so framer-motion's PopChild (used by AnimatePresence mode="popLayout"
// on the grid) can attach the measurement ref without React warning.
const CatalogCard = forwardRef<HTMLDivElement, CatalogCardProps>(function CatalogCard(
  { entry, installed, progress, onInstall },
  ref
): JSX.Element {
  const platform = PLATFORMS[entry.platform]
  const downloading =
    progress?.state === 'starting' || progress?.state === 'downloading'
  const failed = progress?.state === 'failed'
  const pct =
    progress?.total && progress.received
      ? Math.round((progress.received / progress.total) * 100)
      : null
  const [imageOk, setImageOk] = useState(true)

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="glass rounded-xl overflow-hidden flex flex-col group"
    >
      {/* Cover area */}
      <div
        className="relative aspect-[3/4] overflow-hidden"
        style={{
          background: `linear-gradient(160deg, ${platform.color}44 0%, rgba(10,12,20,0.85) 90%)`
        }}
      >
        {entry.cover && imageOk ? (
          <img
            src={entry.cover}
            alt={entry.title}
            onError={() => setImageOk(false)}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center px-4">
              <div
                className="text-xs font-mono uppercase tracking-widest mb-2"
                style={{ color: `${platform.color}` }}
              >
                {platform.shortName}
              </div>
              <div className="text-white font-display font-bold text-lg leading-tight text-balance">
                {entry.title}
              </div>
              {!entry.cover && (
                <div className="text-[10px] text-white/30 mt-2 flex items-center gap-1 justify-center">
                  <ImageOff className="w-2.5 h-2.5" /> sem capa
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status badge over cover */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold backdrop-blur-md"
            style={{
              background: `${platform.color}33`,
              color: '#fff'
            }}
          >
            {platform.shortName}
          </span>
          {installed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold bg-emerald-500/30 text-emerald-200 backdrop-blur-md flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" /> Instalado
            </span>
          )}
        </div>

        {/* Bottom dark overlay with title for cover-having entries */}
        {entry.cover && imageOk && (
          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
            <div className="text-sm font-bold text-white line-clamp-2 leading-tight">
              {entry.title}
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-[12px] text-slate-400 line-clamp-3 leading-snug min-h-[3.4em]">
          {entry.description}
        </p>

        <div className="flex items-center gap-1 text-[10px] text-emerald-300/80">
          <Scale className="w-2.5 h-2.5" /> {entry.license}
        </div>

        {downloading && (
          <div>
            <div className="h-1 bg-ink-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-accent to-cyan-400"
                animate={{ width: pct ? `${pct}%` : '40%' }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-1 truncate">
              {formatSize(progress!.received)}
              {progress!.total ? ` / ${formatSize(progress!.total)}` : ''}
            </div>
          </div>
        )}

        {failed && (
          <div className="text-[11px] text-rose-300 flex items-start gap-1">
            <X className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{progress!.error}</span>
          </div>
        )}

        <div className="mt-auto pt-1 flex items-center gap-2">
          {installed ? (
            <Link
              to={`/game/${installed.id}`}
              className="flex-1 px-2 py-1.5 bg-emerald-500/20 text-emerald-300 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-emerald-500/30"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Jogar
            </Link>
          ) : downloading ? (
            <button
              disabled
              className="flex-1 px-2 py-1.5 bg-white/5 rounded-md text-xs flex items-center justify-center gap-1.5"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Baixando
            </button>
          ) : (
            <button
              onClick={onInstall}
              className="flex-1 px-2 py-1.5 bg-accent text-ink-950 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-accent/90"
            >
              <Download className="w-3.5 h-3.5" /> Baixar
              {entry.approxSizeMb !== undefined && (
                <span className="opacity-70">{entry.approxSizeMb}MB</span>
              )}
            </button>
          )}
          {entry.homepage && (
            <button
              onClick={() => window.api.system.openExternal(entry.homepage!)}
              title="Site oficial"
              className="px-2 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-slate-300 hover:text-white"
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
})

function RequirementsBlock({
  label,
  tone,
  spec
}: {
  label: string
  tone: 'slate' | 'emerald'
  spec: { os: string; cpu: string; gpu: string; ramGb: number; storageGb: number; notes?: string }
}): JSX.Element {
  const ring = tone === 'emerald' ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-white/10 bg-black/20'
  const labelTone = tone === 'emerald' ? 'text-emerald-300' : 'text-slate-300'
  return (
    <div className={`rounded-md border ${ring} p-2`}>
      <div className={`text-[10px] uppercase tracking-wider ${labelTone} mb-1`}>{label}</div>
      <ul className="text-[11px] text-slate-300 space-y-0.5">
        <li>
          <span className="text-slate-500">OS:</span> {spec.os}
        </li>
        <li>
          <span className="text-slate-500">CPU:</span> {spec.cpu}
        </li>
        <li>
          <span className="text-slate-500">GPU:</span> {spec.gpu}
        </li>
        <li>
          <span className="text-slate-500">RAM:</span> {spec.ramGb} GB
        </li>
        <li>
          <span className="text-slate-500">Disco:</span> {spec.storageGb} GB
        </li>
        {spec.notes && (
          <li className="text-[10px] text-amber-300 mt-1">{spec.notes}</li>
        )}
      </ul>
    </div>
  )
}

function normalizeTitleForMods(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`
}

function formatApproxMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`
  return `${Math.round(mb)}MB`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function projectTypeLabel(type: ModCatalogEntry['projectType']): string {
  if (type === 'shader') return 'Shader'
  if (type === 'modpack') return 'Modpack'
  if (type === 'resourcepack') return 'Resource'
  return 'Mod'
}

function dirname(path: string): string {
  const normalized = path.replace(/\//g, '\\')
  const idx = normalized.lastIndexOf('\\')
  return idx >= 0 ? normalized.slice(0, idx) : normalized
}

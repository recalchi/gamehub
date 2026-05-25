import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Package,
  Play,
  Scale
} from 'lucide-react'
import { CURATED_CATALOG, type CuratedEntry } from '@shared/curated'
import { PLATFORMS } from '@shared/platforms'
import { useLibraryStore } from '../store/library'
import type { DownloadProgress, Game } from '@shared/types'

/**
 * Browse + install a curated selection of legitimate free games.
 *
 * Each entry tracks one of: not-downloaded | downloading | installed. We
 * detect "installed" by matching the entry's expected destination path
 * against the games already in the library. Once installed, a "Jogar"
 * button routes to the game detail screen.
 */
export default function Catalog(): JSX.Element {
  const games = useLibraryStore((s) => s.games)
  const [progress, setProgress] = useState<Map<string, DownloadProgress>>(new Map())
  const [downloadIdToEntry, setDownloadIdToEntry] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    return window.api.downloads.onProgress((p) => {
      setProgress((prev) => {
        const next = new Map(prev)
        // Find the entry id by looking up the downloadId mapping
        const entryId = downloadIdToEntry.get(p.id)
        if (entryId) next.set(entryId, p)
        return next
      })
      if (p.state === 'finished') {
        // Force library refresh so the catalog flips to "Installed"
        void window.api.library.list().then((list) =>
          useLibraryStore.setState({ games: list.games, emulators: list.emulators })
        )
      }
    })
  }, [downloadIdToEntry])

  /** Match catalog entries to games already in the library by title + platform */
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="px-12 py-12 max-w-5xl"
    >
      <header className="mb-8">
        <h1 className="text-3xl font-display font-bold flex items-center gap-3">
          <Package className="w-8 h-8 text-accent" /> Catálogo
        </h1>
        <p className="text-slate-400 mt-1 max-w-2xl">
          Jogos homebrew, open-source e demos com licença para redistribuição. Click para
          baixar e adicionar à biblioteca automaticamente.
        </p>
        <p className="text-[11px] text-slate-500 mt-2 flex items-start gap-1.5">
          <Scale className="w-3 h-3 mt-0.5 shrink-0" />
          GameHub apenas linka URLs públicas — não hospeda binários. Adicione suas próprias
          fontes via <Link to="/library" className="text-accent">Biblioteca → Adicionar → Baixar de URL</Link>.
        </p>
      </header>

      <ul className="space-y-3">
        {CURATED_CATALOG.map((entry) => {
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
      </ul>
    </motion.div>
  )
}

function CatalogCard({
  entry,
  installed,
  progress,
  onInstall
}: {
  entry: CuratedEntry
  installed?: Game
  progress?: DownloadProgress
  onInstall: () => void
}): JSX.Element {
  const platform = PLATFORMS[entry.platform]
  const downloading =
    progress?.state === 'starting' || progress?.state === 'downloading'
  const failed = progress?.state === 'failed'
  const pct =
    progress?.total && progress.received
      ? Math.round((progress.received / progress.total) * 100)
      : null

  return (
    <li className="glass rounded-xl p-4 flex items-start gap-4">
      <div
        className="shrink-0 w-16 h-20 rounded-md flex items-center justify-center"
        style={{
          background: `linear-gradient(150deg, ${platform.color}88, ${platform.color}22)`
        }}
      >
        <span className="font-display font-bold text-xs text-white tracking-wider">
          {platform.shortName}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h3 className="text-base font-semibold text-white">{entry.title}</h3>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            {platform.name}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-emerald-300/80 inline-flex items-center gap-0.5">
            <Scale className="w-2.5 h-2.5" /> {entry.license}
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">{entry.description}</p>

        {downloading && (
          <div className="mt-2">
            <div className="h-1 bg-ink-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-accent to-cyan-400"
                animate={{ width: pct ? `${pct}%` : '40%' }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-1">
              {formatSize(progress!.received)}
              {progress!.total ? ` / ${formatSize(progress!.total)}` : ''} ·{' '}
              {formatSize(progress!.speed)}/s
            </div>
          </div>
        )}
        {failed && (
          <div className="text-xs text-rose-300 mt-1">Falhou: {progress!.error}</div>
        )}
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0">
        {installed ? (
          <Link
            to={`/game/${installed.id}`}
            className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 rounded-md text-xs font-semibold flex items-center gap-1.5 hover:bg-emerald-500/30"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Instalado · Jogar
          </Link>
        ) : downloading ? (
          <button
            disabled
            className="px-3 py-1.5 bg-white/5 rounded-md text-xs flex items-center gap-1.5 cursor-not-allowed"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Baixando…
          </button>
        ) : (
          <button
            onClick={onInstall}
            className="px-3 py-1.5 bg-accent text-ink-950 rounded-md text-xs font-semibold flex items-center gap-1.5 hover:bg-accent/90"
          >
            <Download className="w-3.5 h-3.5" />
            Baixar
            {entry.approxSizeMb !== undefined && (
              <span className="opacity-70">· ~{entry.approxSizeMb}MB</span>
            )}
          </button>
        )}
        {entry.homepage && (
          <button
            onClick={() => window.api.system.openExternal(entry.homepage!)}
            className="text-[11px] text-slate-500 hover:text-accent flex items-center gap-1"
          >
            Site <ExternalLink className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
    </li>
  )
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

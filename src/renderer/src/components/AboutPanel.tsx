import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  FolderOpen,
  Info,
  Loader2,
  RefreshCw
} from 'lucide-react'
import type { AppInfo, UpdateInfo } from '@shared/types'

/**
 * Top-of-Settings diagnostic + update card.
 *
 * Update check is non-blocking: app opens normally, updater runs in the
 * background, and this panel only reflects state/progress.
 */
export default function AboutPanel(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    void window.api.system.about().then(setInfo)
    void window.api.system.updateState().then(setUpdate)
    const off = window.api.system.onUpdateStatus(setUpdate)
    return off
  }, [])

  async function check(): Promise<void> {
    setChecking(true)
    setUpdate(await window.api.system.checkUpdate())
    setChecking(false)
  }

  async function installNow(): Promise<void> {
    setInstalling(true)
    const result = await window.api.system.installUpdate()
    if ('error' in result) {
      setUpdate((prev) => (prev ? { ...prev, phase: 'error', error: result.error } : prev))
      setInstalling(false)
      return
    }
  }

  if (!info) return <div className="text-slate-500 text-sm">Carregando informacoes...</div>

  return (
    <section className="glass rounded-2xl p-6 mb-6">
      <header className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-display font-semibold text-lg flex items-center gap-2">
            <Info className="w-5 h-5 text-accent" /> GameHub v{info.version}
          </h2>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
            Electron {info.versions.electron} · Chromium {info.versions.chrome} · Node{' '}
            {info.versions.node}
          </p>
        </div>
        <button
          onClick={check}
          disabled={checking}
          className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded-md flex items-center gap-1.5 disabled:opacity-50"
        >
          {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Checar atualizacao
        </button>
      </header>

      {update && <UpdateRow info={update} onInstall={installNow} installing={installing} />}

      <dl className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
        <Stat label="Jogos" value={info.stats.games} />
        <Stat label="Prontos" value={info.stats.readyGames} tone="ok" />
        <Stat label="Emuladores" value={info.stats.emulators} />
        <Stat label="Capas em cache" value={info.stats.coversCached} />
        <Stat label="Snapshots de save" value={info.stats.saveSnapshots} />
      </dl>

      <div className="mt-5 border-t border-white/5 pt-4 space-y-1.5">
        {Object.entries(info.paths).map(([k, v]) => (
          <PathRow key={k} label={k} path={v} />
        ))}
      </div>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' }): JSX.Element {
  return (
    <div className="glass rounded-lg px-3 py-2.5">
      <div className={`text-2xl font-bold font-display ${tone === 'ok' ? 'text-emerald-300' : 'text-white'}`}>
        {value}
      </div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wider">{label}</div>
    </div>
  )
}

function PathRow({ label, path }: { label: string; path: string }): JSX.Element {
  return (
    <div className="flex items-center gap-3 text-[11px] font-mono">
      <span className="w-20 text-slate-500 uppercase">{label}</span>
      <code className="flex-1 text-slate-400 truncate">{path}</code>
      <button
        onClick={() => window.api.launch.folder(path)}
        className="text-slate-500 hover:text-accent"
        title="Abrir no Explorer"
      >
        <FolderOpen className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function UpdateRow({
  info,
  onInstall,
  installing
}: {
  info: UpdateInfo
  onInstall: () => void
  installing: boolean
}): JSX.Element {
  if (info.phase === 'disabled') {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 bg-ink-800/60 px-3 py-2 rounded-md">
        <CloudOff className="w-3.5 h-3.5" />
        Updater desabilitado neste modo (dev/build local).
      </div>
    )
  }

  if (info.error) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-200 bg-rose-500/10 border border-rose-500/25 px-3 py-2 rounded-md">
        <AlertCircle className="w-3.5 h-3.5 text-rose-300" />
        <span>
          Nao foi possivel atualizar agora: <code className="text-slate-400">{info.error}</code>
        </span>
      </div>
    )
  }

  if (info.phase === 'checking') {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-300 bg-white/5 px-3 py-2 rounded-md">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Verificando atualizacoes em segundo plano...
      </div>
    )
  }

  if (info.phase === 'downloading') {
    return (
      <div className="flex items-center justify-between gap-3 text-xs bg-sky-500/10 border border-sky-400/30 px-3 py-2 rounded-md">
        <div className="flex items-center gap-2">
          <Download className="w-3.5 h-3.5 text-sky-300" />
          <span>
            Baixando atualizacao{info.latest ? ` v${info.latest}` : ''}: {Math.round(info.percent ?? 0)}%
          </span>
        </div>
        <span className="text-slate-400">
          {formatBytes(info.downloadedBytes)} / {formatBytes(info.totalBytes)}
        </span>
      </div>
    )
  }

  if (info.phase === 'downloaded' && info.latest) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm bg-emerald-500/12 border border-emerald-400/35 px-3 py-2 rounded-md">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>
            Atualizacao pronta: <strong>v{info.latest}</strong>
          </span>
        </div>
        <button
          onClick={onInstall}
          disabled={installing}
          className="text-xs px-2.5 py-1.5 rounded-md bg-emerald-400/20 hover:bg-emerald-400/30 disabled:opacity-60"
        >
          {installing ? 'Instalando...' : 'Instalar e reiniciar'}
        </button>
      </div>
    )
  }

  if (info.newer && info.latest) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm bg-accent/15 border border-accent/40 px-3 py-2 rounded-md">
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-accent" />
          <span>
            Nova versao disponivel: <strong>v{info.latest}</strong>
          </span>
        </div>
        {info.releaseUrl && (
          <button
            onClick={() => info.releaseUrl && window.api.system.openExternal(info.releaseUrl)}
            className="text-xs text-accent hover:underline flex items-center gap-1"
          >
            Ver release <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs text-emerald-300">
      <CheckCircle2 className="w-3.5 h-3.5" /> Voce esta na versao mais recente (v{info.current}).
    </div>
  )
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = value
  let idx = 0
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024
    idx += 1
  }
  return `${n.toFixed(n >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`
}

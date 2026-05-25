import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Cloud,
  CloudOff,
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
 * The card is intentionally dense — it's the place we point users to when
 * something is wrong ("paste the diagnostic block from here"). Update check
 * is opt-in via the button; we don't auto-check on every Settings open to
 * keep things offline-friendly.
 */
export default function AboutPanel(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    void window.api.system.about().then(setInfo)
  }, [])

  async function check(): Promise<void> {
    setChecking(true)
    setUpdate(await window.api.system.checkUpdate())
    setChecking(false)
  }

  if (!info) return <div className="text-slate-500 text-sm">Carregando informações…</div>

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
          Checar atualização
        </button>
      </header>

      {/* Update banner */}
      {update && <UpdateRow info={update} />}

      {/* Stats grid */}
      <dl className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
        <Stat label="Jogos" value={info.stats.games} />
        <Stat label="Prontos" value={info.stats.readyGames} tone="ok" />
        <Stat label="Emuladores" value={info.stats.emulators} />
        <Stat label="Capas em cache" value={info.stats.coversCached} />
        <Stat label="Snapshots de save" value={info.stats.saveSnapshots} />
      </dl>

      {/* Path table */}
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

function UpdateRow({ info }: { info: UpdateInfo }): JSX.Element {
  if (info.error) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 bg-ink-800/60 px-3 py-2 rounded-md">
        <CloudOff className="w-3.5 h-3.5" />
        <span>
          Não foi possível checar agora: <code className="text-slate-500">{info.error}</code>
        </span>
      </div>
    )
  }
  if (info.newer && info.latest) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm bg-accent/15 border border-accent/40 px-3 py-2 rounded-md">
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-accent" />
          <span>
            Nova versão disponível: <strong>v{info.latest}</strong>
          </span>
        </div>
        {info.releaseUrl && (
          <button
            onClick={() => window.api.system.openExternal(info.releaseUrl!)}
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
      <CheckCircle2 className="w-3.5 h-3.5" /> Você está na versão mais recente (v{info.current}).
    </div>
  )
}

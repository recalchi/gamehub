import { useEffect, useState } from 'react'
import RouteTransition from '../components/RouteTransition'
import {
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  HelpCircle,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wrench
} from 'lucide-react'
import { useLibraryStore } from '../store/library'
import { EMULATOR_LIST, EMULATORS } from '@shared/emulators'
import type { BiosCheck, DetectedEmulator, EmulatorId } from '@shared/types'
import { PLATFORMS } from '@shared/platforms'
import PageHeader from '../components/PageHeader'

/**
 * Emulators we know how to download and install automatically.
 * Keep in sync with the SPECS map in `core/autoInstall.ts`.
 */
const AUTO_INSTALLABLE: ReadonlySet<EmulatorId> = new Set([
  'duckstation',
  'ppsspp',
  'desmume',
  'mesen',
  'mgba',
  'shadps4',
  'fpps4',
  'xenia',
  'dolphin'
])

/**
 * Per-emulator setup screen.
 *
 * Lists every emulator we know about, detected or not. For detected ones we
 * also surface the live BIOS check + actions to open the bios folder and
 * re-check after the user drops in files.
 */
export default function Emulators(): JSX.Element {
  const emulators = useLibraryStore((s) => s.emulators)
  const scan = useLibraryStore((s) => s.scan)
  const reload = useLibraryStore((s) => s.reload)
  const [busy, setBusy] = useState(false)
  const [bulkInstalling, setBulkInstalling] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; current: string } | null>(null)

  async function rescan(): Promise<void> {
    setBusy(true)
    await scan({ fresh: false })
    setBusy(false)
  }

  // List of emulators we could install in bulk (auto-installable AND not yet detected)
  const installable = EMULATOR_LIST.filter(
    (def) => AUTO_INSTALLABLE.has(def.id) && !emulators.some((e) => e.id === def.id)
  )

  async function installAll(): Promise<void> {
    if (installable.length === 0) return
    setBulkInstalling(true)
    setBulkProgress({ done: 0, total: installable.length, current: installable[0].name })
    for (let i = 0; i < installable.length; i++) {
      const def = installable[i]
      setBulkProgress({ done: i, total: installable.length, current: def.name })
      await window.api.system.autoInstallEmulator(def.id, def.name)
    }
    setBulkProgress({ done: installable.length, total: installable.length, current: 'concluído' })
    await reload()
    setTimeout(() => {
      setBulkInstalling(false)
      setBulkProgress(null)
    }, 1800)
  }

  return (
    <RouteTransition className="px-12 py-12 max-w-5xl">
      <PageHeader
        title="Emuladores"
        icon={Cpu}
        subtitle="Status de cada emulador e da BIOS que ele precisa para funcionar."
        actions={
          <>
            {installable.length > 0 && (
              <button
                onClick={installAll}
                disabled={bulkInstalling}
                title={`Instala em sequência: ${installable.map((d) => d.name).join(', ')}`}
                className="px-3 py-2 bg-accent text-ink-950 text-xs rounded-md flex items-center gap-1.5 font-semibold hover:bg-accent/90 disabled:opacity-60 shadow-glow"
              >
                {bulkInstalling ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
                Instalar {installable.length} faltantes em lote
              </button>
            )}
            <button
              onClick={rescan}
              disabled={busy}
              className="px-3 py-2 bg-white/5 hover:bg-white/10 text-xs rounded-md flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} /> Re-checar tudo
            </button>
          </>
        }
      />

      {bulkProgress && (
        <div className="glass rounded-lg p-3 mb-4 border border-accent/40 bg-accent/5">
          <div className="text-xs text-slate-200 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
            <span className="font-semibold">{bulkProgress.current}</span>
            <span className="text-slate-400">
              ({bulkProgress.done + 1}/{bulkProgress.total})
            </span>
          </div>
          <div className="mt-2 h-1 bg-ink-800 rounded overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width: `${(bulkProgress.done / Math.max(bulkProgress.total, 1)) * 100}%`
              }}
            />
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-500 mb-8">
        GameHub apenas <strong>detecta</strong> BIOS e firmware que você já obteve legalmente —
        nunca baixa arquivos proprietários. <strong>Emuladores</strong> open-source podem ser
        baixados automaticamente das releases oficiais.
      </p>

      <ul className="space-y-3">
        {EMULATOR_LIST.map((def) => {
          if (def.id === 'native' || def.id === 'unknown') return null
          const detected = emulators.find((e) => e.id === def.id)
          return <EmulatorCard key={def.id} defId={def.id} detected={detected} />
        })}
      </ul>
    </RouteTransition>
  )
}

function EmulatorCard({
  defId,
  detected
}: {
  defId: EmulatorId
  detected?: DetectedEmulator
}): JSX.Element {
  const def = EMULATORS[defId]
  const [bios, setBios] = useState<BiosCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (!detected) {
      setBios(null)
      return
    }
    void window.api.emulator.checkBios(defId).then(setBios)
  }, [defId, detected])

  async function recheck(): Promise<void> {
    if (!detected) return
    setChecking(true)
    const r = await window.api.emulator.checkBios(defId)
    setBios(r)
    setChecking(false)
  }

  async function pickExe(): Promise<void> {
    const exe = await window.api.system.pickFile([
      { name: 'Executável', extensions: ['exe'] }
    ])
    if (!exe) return
    await window.api.emulator.setOverride(defId, exe)
    // Force re-detect to refresh detected list + library statuses
    await window.api.emulator.detect()
    location.reload()
  }

  async function autoInstall(): Promise<void> {
    setInstalling(true)
    await window.api.system.autoInstallEmulator(defId, def.name)
    setInstalling(false)
    // Force a fresh read so the card re-renders as "detected"
    location.reload()
  }

  const platformNames = def.platforms
    .map((p) => PLATFORMS[p]?.shortName)
    .filter(Boolean)
    .join(', ')

  return (
    <li className="glass rounded-2xl p-5">
      <header className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-lg flex items-center gap-2">
            {def.name}
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">
              {platformNames}
            </span>
          </h3>
          {detected ? (
            <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
              {detected.executable}
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 mt-0.5">
              Não detectado em nenhuma pasta configurada.
            </div>
          )}
        </div>
        {detected ? (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider ${
              detected.source === 'manual'
                ? 'bg-cyan-400/20 text-cyan-300'
                : 'bg-emerald-400/20 text-emerald-300'
            }`}
          >
            {detected.source}
          </span>
        ) : (
          <div className="flex flex-col gap-1 items-end">
            {AUTO_INSTALLABLE.has(defId) && (
              <button
                onClick={autoInstall}
                disabled={installing}
                className="text-[11px] px-2.5 py-1 bg-accent text-ink-950 font-semibold rounded-md flex items-center gap-1 disabled:opacity-60"
              >
                {installing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
                {installing ? 'Instalando…' : 'Instalar'}
              </button>
            )}
            <button
              onClick={pickExe}
              className="text-[11px] px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-md flex items-center gap-1"
            >
              <Wrench className="w-3 h-3" /> Localizar…
            </button>
          </div>
        )}
      </header>

      {/* BIOS section */}
      {detected && bios && (
        <div className="mt-3 border-t border-white/5 pt-3">
          {!bios.required ? (
            <div className="text-xs text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Não precisa de BIOS.
            </div>
          ) : bios.found ? (
            <div className="space-y-1">
              <div className="text-xs text-emerald-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> BIOS encontrada.
              </div>
              {bios.matchedPath && (
                <div className="text-[11px] text-slate-500 font-mono truncate">
                  {bios.matchedPath}
                </div>
              )}
            </div>
          ) : (
            <BiosMissing bios={bios} />
          )}

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {bios.required && bios.triedLocations[0] && (
              <button
                onClick={() => window.api.launch.folder(bios.triedLocations[0])}
                className="text-[11px] px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-md flex items-center gap-1"
              >
                <FolderOpen className="w-3 h-3" /> Abrir pasta BIOS
              </button>
            )}
            <button
              onClick={recheck}
              disabled={checking}
              className="text-[11px] px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-md flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} /> Re-checar
            </button>
            {def.website && (
              <button
                onClick={() => window.api.system.openExternal(def.website!)}
                className="text-[11px] px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-md flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> Site oficial
              </button>
            )}
          </div>

          {def.setupHelp && (
            <p className="text-[11px] text-slate-500 mt-3 flex items-start gap-1.5 leading-relaxed">
              <HelpCircle className="w-3 h-3 mt-0.5 shrink-0" /> {def.setupHelp}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

function BiosMissing({ bios }: { bios: BiosCheck }): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="text-xs text-amber-300 flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5" /> BIOS não encontrada nas pastas verificadas.
      </div>
      <div className="text-[11px] text-slate-500">
        Coloque um destes arquivos em uma das pastas listadas abaixo e clique{' '}
        <strong>Re-checar</strong>:
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-mono">
        <div>
          <div className="text-slate-400 mb-1">Arquivos esperados</div>
          <ul className="space-y-0.5 text-slate-500">
            {bios.expected.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-slate-400 mb-1">Pastas verificadas</div>
          <ul className="space-y-0.5 text-slate-500">
            {bios.triedLocations.map((p) => (
              <li key={p} className="truncate" title={p}>
                • {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

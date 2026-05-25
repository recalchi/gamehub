import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Cpu,
  ExternalLink,
  FolderOpen,
  HelpCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wrench
} from 'lucide-react'
import { useLibraryStore } from '../store/library'
import { EMULATOR_LIST, EMULATORS } from '@shared/emulators'
import type { BiosCheck, DetectedEmulator, EmulatorId } from '@shared/types'
import { PLATFORMS } from '@shared/platforms'

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
  const [busy, setBusy] = useState(false)

  async function rescan(): Promise<void> {
    setBusy(true)
    await scan({ fresh: false })
    setBusy(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="px-12 py-12 max-w-5xl"
    >
      <header className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <Cpu className="w-8 h-8 text-accent" /> Emuladores
          </h1>
          <p className="text-slate-400 mt-1">
            Status de cada emulador e da BIOS que ele precisa para funcionar.
          </p>
        </div>
        <button
          onClick={rescan}
          disabled={busy}
          className="px-3 py-2 bg-white/5 hover:bg-white/10 text-xs rounded-md flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} /> Re-checar tudo
        </button>
      </header>

      <p className="text-[11px] text-slate-500 mb-8">
        GameHub apenas <strong>detecta</strong> BIOS e firmware que você já obteve legalmente —
        nunca baixa arquivos proprietários.
      </p>

      <ul className="space-y-3">
        {EMULATOR_LIST.map((def) => {
          if (def.id === 'native' || def.id === 'unknown') return null
          const detected = emulators.find((e) => e.id === def.id)
          return <EmulatorCard key={def.id} defId={def.id} detected={detected} />
        })}
      </ul>
    </motion.div>
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
          <button
            onClick={pickExe}
            className="text-[11px] px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-md flex items-center gap-1"
          >
            <Wrench className="w-3 h-3" /> Localizar…
          </button>
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

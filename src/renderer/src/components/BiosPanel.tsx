import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  FileQuestion,
  FilePlus,
  Loader2,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react'
import { EMULATORS } from '@shared/emulators'
import type { BiosCheck, EmulatorId } from '@shared/types'

interface Props {
  emulatorId?: EmulatorId
  /** Optional callback so parent can refresh game status after a successful BIOS install. */
  onBiosInstalled?: () => void
}

/**
 * Tiny status pill + expandable details for BIOS state of the game's emulator.
 *
 * We re-check on mount: BIOS files may appear/disappear between scans (user
 * dropping in a file from Explorer is very common).
 */
export default function BiosPanel({ emulatorId, onBiosInstalled }: Props): JSX.Element {
  const [check, setCheck] = useState<BiosCheck | null>(null)
  const [open, setOpen] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [installingFw, setInstallingFw] = useState(false)
  const emuDef = emulatorId ? EMULATORS[emulatorId] : undefined

  useEffect(() => {
    if (!emulatorId) return
    void window.api.emulator.checkBios(emulatorId).then(setCheck)
  }, [emulatorId])

  async function pickAndInstall(): Promise<void> {
    if (!emulatorId) return
    setInstallError(null)
    const filePath = await window.api.system.pickFile([
      { name: 'Arquivos BIOS', extensions: ['bin', 'rom', 'pup', 'BIN', 'ROM', 'PUP'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ])
    if (!filePath) return
    setInstalling(true)
    const r = await window.api.emulator.installBios(emulatorId, filePath)
    setInstalling(false)
    if ('ok' in r) {
      // Re-check + notify parent so the game status flips ready
      const next = await window.api.emulator.checkBios(emulatorId)
      setCheck(next)
      onBiosInstalled?.()
    } else {
      setInstallError(r.error)
    }
  }

  if (!emulatorId) {
    return (
      <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
        <FileQuestion className="w-3 h-3" /> Sem emulador associado
      </span>
    )
  }
  if (!check) {
    return <span className="text-xs text-slate-500">Verificando BIOS…</span>
  }

  if (!check.required) {
    return (
      <span className="text-xs text-emerald-300 inline-flex items-center gap-1.5">
        <CheckCircle2 className="w-3 h-3" /> Não precisa de BIOS
      </span>
    )
  }

  if (check.found) {
    return (
      <div className="space-y-1">
        <span className="text-xs text-emerald-300 inline-flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3" /> BIOS encontrada
        </span>
        {check.matchedPath && (
          <div className="text-[11px] text-slate-500 font-mono truncate max-w-md">
            {check.matchedPath}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen((x) => !x)}
        className="text-xs text-amber-300 inline-flex items-center gap-1.5 hover:text-amber-200"
      >
        <ShieldAlert className="w-3 h-3" /> BIOS não encontrada · clique para detalhes
      </button>
      {open && (
        <div className="text-[11px] text-slate-400 space-y-3 glass rounded-lg p-3 max-w-md">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={pickAndInstall}
              disabled={installing}
              className="text-[11px] bg-accent/90 hover:bg-accent disabled:opacity-50 text-ink-950 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded font-semibold"
            >
              {installing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <FilePlus className="w-3 h-3" />
              )}
              {installing ? 'Copiando…' : 'Apontar arquivo BIOS'}
            </button>
            {emulatorId === 'rpcs3' && (
              <button
                onClick={async () => {
                  setInstallError(null)
                  setInstallingFw(true)
                  const r = await window.api.emulator.installPs3Firmware()
                  setInstallingFw(false)
                  if ('ok' in r) {
                    setInstallError(null)
                    onBiosInstalled?.()
                  } else {
                    setInstallError(r.error)
                  }
                }}
                disabled={installingFw}
                className="text-[11px] bg-indigo-500/90 hover:bg-indigo-400 disabled:opacity-50 text-white inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded font-semibold"
              >
                {installingFw ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <FilePlus className="w-3 h-3" />
                )}
                {installingFw ? 'Abrindo RPCS3…' : 'Instalar firmware PS3'}
              </button>
            )}
            {emuDef?.website && (
              <button
                onClick={() => window.api.system.openExternal(emuDef.website!)}
                className="text-[11px] text-slate-200 hover:text-white inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-white/5"
              >
                <ExternalLink className="w-3 h-3" /> Guia oficial de BIOS
              </button>
            )}
          </div>
          {installError && (
            <div className="text-[11px] text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded px-2 py-1">
              {installError}
            </div>
          )}
          <div>
            <div className="text-slate-300 font-semibold mb-0.5">Arquivos esperados:</div>
            <ul className="font-mono text-slate-500 list-disc ml-4 space-y-0.5">
              {check.expected.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-slate-300 font-semibold mb-0.5">Locais verificados:</div>
            <ul className="font-mono text-slate-500 list-disc ml-4 space-y-0.5">
              {check.triedLocations.map((p) => (
                <li key={p} className="truncate">
                  {p}
                </li>
              ))}
            </ul>
          </div>
          {emuDef?.setupHelp && (
            <p className="text-slate-400 leading-relaxed">{emuDef.setupHelp}</p>
          )}
          <p className="text-slate-500 leading-relaxed">
            GameHub copia automaticamente BIOS que você já tem entre emuladores compatíveis.
            Não baixamos BIOS proprietária — você precisa fornecer arquivo dumped do seu console
            (ou apontar pra arquivo que já está no disco).
          </p>
        </div>
      )}
    </div>
  )
}

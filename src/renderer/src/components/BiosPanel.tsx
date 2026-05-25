import { useEffect, useState } from 'react'
import { CheckCircle2, FileQuestion, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { BiosCheck, EmulatorId } from '@shared/types'

interface Props {
  emulatorId?: EmulatorId
}

/**
 * Tiny status pill + expandable details for BIOS state of the game's emulator.
 *
 * We re-check on mount: BIOS files may appear/disappear between scans (user
 * dropping in a file from Explorer is very common).
 */
export default function BiosPanel({ emulatorId }: Props): JSX.Element {
  const [check, setCheck] = useState<BiosCheck | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!emulatorId) return
    void window.api.emulator.checkBios(emulatorId).then(setCheck)
  }, [emulatorId])

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
        <div className="text-[11px] text-slate-400 space-y-2 glass rounded-lg p-3 max-w-md">
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
          <p className="text-slate-500 leading-relaxed">
            Coloque a BIOS em uma das pastas acima e clique em <strong>Re-escanear</strong>.
            GameHub apenas detecta arquivos que você já possui — nunca baixa BIOS proprietária.
          </p>
        </div>
      )}
    </div>
  )
}

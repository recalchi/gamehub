import { useState } from 'react'
import { Cpu, Check, AlertCircle } from 'lucide-react'
import type { EmulatorId, Game } from '@shared/types'
import { EMULATORS } from '@shared/emulators'
import { PLATFORMS } from '@shared/platforms'
import { useLibraryStore } from '../store/library'

/**
 * Per-game emulator preset. Lets the user lock a specific emulator to this
 * game record — overrides any platform-level default and (in manual mode)
 * prevents the launcher from silently switching to a fallback.
 *
 * Shows the platform's known emulators with their detection status:
 *   ✓ detected and installed
 *   ⚠ not installed locally (still selectable so the user sees what's missing)
 */
export default function EmulatorPicker({
  game,
  onChanged
}: {
  game: Game
  onChanged?: () => void
}): JSX.Element | null {
  const detected = useLibraryStore((s) => s.emulators)
  const [busy, setBusy] = useState(false)
  const platformDef = PLATFORMS[game.platform]
  if (!platformDef || platformDef.emulators.length === 0) return null
  if (game.emulator === 'native') return null

  async function pick(id: EmulatorId): Promise<void> {
    if (busy || id === game.emulator) return
    setBusy(true)
    try {
      await window.api.library.update(game.id, { emulator: id, status: 'ready' })
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 mb-2">
        <Cpu className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs uppercase tracking-wider text-slate-400">
          Emulador deste jogo
        </span>
        <span className="text-[10px] text-slate-600">
          (override por jogo — vence padrão de plataforma)
        </span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {platformDef.emulators.map((id) => {
          const def = EMULATORS[id]
          if (!def) return null
          const isSelected = game.emulator === id
          const isInstalled = detected.some((e) => e.id === id)
          return (
            <button
              key={id}
              type="button"
              disabled={busy}
              onClick={() => void pick(id)}
              className={`text-xs px-2.5 py-1.5 rounded-md border flex items-center gap-1.5 transition-colors ${
                isSelected
                  ? 'border-accent bg-accent/20 text-white'
                  : isInstalled
                    ? 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10'
                    : 'border-amber-500/20 bg-amber-400/[0.06] text-amber-300/80 hover:bg-amber-400/10'
              }`}
              title={
                isInstalled
                  ? `${def.name} — instalado`
                  : `${def.name} — não detectado (instale ou aponte o caminho em Configurações)`
              }
            >
              {isSelected ? (
                <Check className="w-3 h-3" />
              ) : !isInstalled ? (
                <AlertCircle className="w-3 h-3" />
              ) : null}
              {def.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

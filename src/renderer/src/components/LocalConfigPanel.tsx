import { FolderOpen, Settings as SettingsIcon } from 'lucide-react'
import type { Game } from '@shared/types'

interface Props {
  game: Game
}

/**
 * Replaces BiosPanel for PC / native games. PC titles don't have BIOS; what's
 * useful here is jumping to the install folder where local .ini / .cfg files
 * live (Elden Ring's GraphicsConfig.xml, Cyberpunk's UserSettings.json, etc.).
 *
 * A richer editor (preset picker, in-app .ini diff) is tracked for Parte 5.
 */
export default function LocalConfigPanel({ game }: Props): JSX.Element {
  const folder = deriveFolder(game.path)
  return (
    <div className="space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-accent">
        <SettingsIcon className="w-3.5 h-3.5" /> Configurações locais
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">
        Jogos de PC não usam BIOS. Configurações ficam em arquivos locais do próprio jogo
        (ex.: <span className="font-mono">GraphicsConfig.xml</span>, <span className="font-mono">UserSettings.ini</span>).
      </p>
      {folder && (
        <button
          type="button"
          onClick={() => void window.api.system.openExternal(`file:///${folder.replace(/\\/g, '/')}`)}
          className="text-[11px] bg-white/5 hover:bg-white/10 text-slate-200 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded font-semibold"
        >
          <FolderOpen className="w-3 h-3" /> Abrir pasta do jogo
        </button>
      )}
      {!folder && (
        <p className="text-[11px] text-slate-500">
          Pasta do jogo indisponível (entrada da loja sem caminho local).
        </p>
      )}
    </div>
  )
}

function deriveFolder(p: string): string | null {
  if (!p || p.startsWith('steam://') || p.startsWith('epic://') || p.startsWith('riot://')) {
    return null
  }
  // Strip filename to keep folder
  const norm = p.replace(/\//g, '\\')
  const idx = norm.lastIndexOf('\\')
  return idx > 0 ? norm.slice(0, idx) : norm
}

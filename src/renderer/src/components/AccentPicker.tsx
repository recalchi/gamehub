import { useState } from 'react'
import { Check, Palette } from 'lucide-react'
import { useLibraryStore } from '../store/library'

/**
 * Accent color picker.
 *
 * Six curated presets that pair well with the dark theme, plus a freeform
 * hex input for the diehards. The selection writes to settings.accentColor
 * via the store; App.tsx watches that and updates the `--accent` CSS var,
 * which Tailwind reads from `accent` color utilities.
 */
const PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Mint', hex: '#5eead4' },
  { name: 'Cyan', hex: '#22d3ee' },
  { name: 'Violet', hex: '#a78bfa' },
  { name: 'Rose', hex: '#fb7185' },
  { name: 'Amber', hex: '#fbbf24' },
  { name: 'Emerald', hex: '#34d399' }
]

export default function AccentPicker(): JSX.Element {
  const settings = useLibraryStore((s) => s.settings)
  const save = useLibraryStore((s) => s.saveSettings)
  const current = settings?.accentColor ?? '#5eead4'
  const [custom, setCustom] = useState(current)

  function pick(hex: string): void {
    void save({ accentColor: hex })
    setCustom(hex)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <Palette className="w-4 h-4 text-accent" /> Cor de destaque
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const selected = p.hex.toLowerCase() === current.toLowerCase()
          return (
            <button
              key={p.hex}
              type="button"
              onClick={() => pick(p.hex)}
              className="relative w-9 h-9 rounded-full border-2 transition-all"
              style={{
                background: p.hex,
                borderColor: selected ? '#fff' : 'rgba(255,255,255,0.08)',
                boxShadow: selected ? `0 0 20px ${p.hex}` : undefined
              }}
              title={p.name}
            >
              {selected && <Check className="w-4 h-4 mx-auto text-ink-950" strokeWidth={3} />}
            </button>
          )
        })}
        <div className="flex items-center gap-2 ml-2">
          <input
            type="color"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="w-9 h-9 rounded-full bg-transparent border border-white/10 cursor-pointer"
          />
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onBlur={() => /^#[0-9a-f]{6}$/i.test(custom) && pick(custom)}
            placeholder="#5eead4"
            className="w-24 bg-ink-800 border border-white/5 rounded-md px-2 py-1.5 text-xs font-mono outline-none focus:border-accent"
          />
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronDown, ChevronUp, Edit3 } from 'lucide-react'
import type { Game } from '@shared/types'
import { useLibraryStore } from '../store/library'

interface Props {
  game: Game
}

/**
 * Lightweight metadata editor for fields the auto-scanner doesn't know about
 * (genre, developer, year, description). Persists via library.update and
 * mirrors the change into the zustand store so the rest of the UI updates
 * without a refetch.
 *
 * Closed by default — taps "Editar metadados" to expand. We keep edits in
 * local state and only commit on "Salvar" to avoid spamming writes on every
 * keystroke.
 */
export default function MetadataEditor({ game }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({
    genre: game.genre ?? '',
    developer: game.developer ?? '',
    year: game.year ?? undefined,
    description: game.description ?? ''
  })
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  // Reset draft whenever the underlying game changes (after a save round-trip
  // or when the user navigates to a different game with this component cached)
  useEffect(() => {
    setDraft({
      genre: game.genre ?? '',
      developer: game.developer ?? '',
      year: game.year ?? undefined,
      description: game.description ?? ''
    })
  }, [game.id, game.genre, game.developer, game.year, game.description])

  async function save(): Promise<void> {
    setSaving(true)
    const patch = {
      genre: draft.genre.trim() || undefined,
      developer: draft.developer.trim() || undefined,
      year: draft.year || undefined,
      description: draft.description.trim() || undefined
    }
    const updated = await window.api.library.update(game.id, patch)
    setSaving(false)
    if (updated) {
      useLibraryStore.setState((s) => ({
        games: s.games.map((g) => (g.id === game.id ? { ...g, ...patch } : g))
      }))
      setFlash('Salvo.')
      setTimeout(() => setFlash(null), 2000)
    }
  }

  // What we render when collapsed — small status row with current values
  const summary: string[] = []
  if (game.genre) summary.push(game.genre)
  if (game.developer) summary.push(game.developer)
  if (game.year) summary.push(String(game.year))
  const summaryText = summary.length > 0 ? summary.join(' · ') : 'Sem metadados extras ainda'

  return (
    <section className="mt-6">
      <button
        onClick={() => setOpen((x) => !x)}
        className="flex items-center gap-2 text-sm text-slate-300 hover:text-accent transition-colors"
      >
        <Edit3 className="w-4 h-4" />
        Editar metadados
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <span className="text-xs text-slate-500 ml-2 truncate max-w-xs">· {summaryText}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 glass rounded-lg p-4 space-y-3 max-w-2xl">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Gênero">
                  <input
                    value={draft.genre}
                    onChange={(e) => setDraft({ ...draft, genre: e.target.value })}
                    placeholder="Ação, RPG, Plataforma..."
                    className="w-full bg-ink-800 border border-white/5 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                  />
                </Field>
                <Field label="Desenvolvedora">
                  <input
                    value={draft.developer}
                    onChange={(e) => setDraft({ ...draft, developer: e.target.value })}
                    placeholder="SCE Santa Monica..."
                    className="w-full bg-ink-800 border border-white/5 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                  />
                </Field>
                <Field label="Ano">
                  <input
                    type="number"
                    min={1970}
                    max={2099}
                    value={draft.year ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        year: e.target.value ? parseInt(e.target.value, 10) : undefined
                      })
                    }
                    placeholder="2005"
                    className="w-full bg-ink-800 border border-white/5 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                  />
                </Field>
              </div>

              <Field label="Descrição">
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={3}
                  placeholder="Resumo do jogo, notas pessoais, mods instalados..."
                  className="w-full bg-ink-800 border border-white/5 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-accent resize-y"
                />
              </Field>

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-1.5 bg-accent text-ink-950 text-sm font-semibold rounded-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" /> {saving ? 'Salvando…' : 'Salvar'}
                </button>
                {flash && <span className="text-xs text-accent">{flash}</span>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Always show the description below the title area if set, even when collapsed */}
      {game.description && !open && (
        <p className="text-sm text-slate-300 mt-3 max-w-2xl leading-relaxed">{game.description}</p>
      )}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">{label}</div>
      {children}
    </label>
  )
}

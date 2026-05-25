import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Tag, X } from 'lucide-react'
import type { Game } from '@shared/types'
import { useLibraryStore } from '../store/library'

interface Props {
  game: Game
}

/**
 * Tag editor for a single game.
 *
 * Tags are free-form strings; we suggest from the union of existing tags in
 * the library so the user can quickly add `multiplayer`, `speedrun`, etc.
 * without retyping. Tags persist via library.update and feed the global
 * search + the Library page's tag filter.
 */
export default function TagEditor({ game }: Props): JSX.Element {
  const games = useLibraryStore((s) => s.games)
  const [draft, setDraft] = useState('')
  const tags = game.tags ?? []

  const suggestions = useMemo(() => {
    const all = new Set<string>()
    for (const g of games) for (const t of g.tags ?? []) all.add(t)
    for (const t of tags) all.delete(t)
    const draftLower = draft.toLowerCase()
    return Array.from(all)
      .filter((t) => (draftLower ? t.toLowerCase().includes(draftLower) : true))
      .sort()
      .slice(0, 8)
  }, [games, tags, draft])

  async function commit(tag: string): Promise<void> {
    const clean = normalizeTag(tag)
    if (!clean || tags.includes(clean)) {
      setDraft('')
      return
    }
    const next = [...tags, clean]
    await window.api.library.update(game.id, { tags: next })
    useLibraryStore.setState((s) => ({
      games: s.games.map((g) => (g.id === game.id ? { ...g, tags: next } : g))
    }))
    setDraft('')
  }

  async function remove(tag: string): Promise<void> {
    const next = tags.filter((t) => t !== tag)
    await window.api.library.update(game.id, { tags: next })
    useLibraryStore.setState((s) => ({
      games: s.games.map((g) => (g.id === game.id ? { ...g, tags: next } : g))
    }))
  }

  return (
    <section className="mt-4">
      <div className="flex items-center gap-2 text-sm text-slate-300 mb-2">
        <Tag className="w-4 h-4 text-accent" /> Tags
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <AnimatePresence>
          {tags.map((t) => (
            <motion.span
              key={t}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="text-xs px-2.5 py-1 rounded-full bg-accent/15 text-accent border border-accent/30 inline-flex items-center gap-1.5"
            >
              {t}
              <button onClick={() => remove(t)} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void commit(draft)
          }}
          className="inline-flex items-center gap-1"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="adicionar tag…"
            className="bg-ink-800 border border-white/5 rounded-full px-3 py-1 text-xs outline-none focus:border-accent w-32"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="text-slate-400 hover:text-accent disabled:opacity-40"
            title="Adicionar"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => commit(s)}
              className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function normalizeTag(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .slice(0, 24)
}

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import Fuse from 'fuse.js'
import { Search as SearchIcon } from 'lucide-react'
import GameCard from '../components/GameCard'
import { useLibraryStore } from '../store/library'

export default function SearchPage(): JSX.Element {
  const games = useLibraryStore((s) => s.games)
  const [q, setQ] = useState('')

  const fuse = useMemo(
    () =>
      new Fuse(games, {
        keys: [
          { name: 'title', weight: 0.45 },
          { name: 'platform', weight: 0.12 },
          { name: 'developer', weight: 0.13 },
          { name: 'genre', weight: 0.1 },
          { name: 'description', weight: 0.08 },
          { name: 'tags', weight: 0.12 }
        ],
        threshold: 0.4,
        ignoreLocation: true
      }),
    [games]
  )

  const results = q.trim() === '' ? games.slice(0, 30) : fuse.search(q).map((r) => r.item)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="px-12 py-12"
    >
      <div className="glass rounded-2xl p-4 flex items-center gap-3 max-w-3xl mx-auto">
        <SearchIcon className="w-5 h-5 text-accent" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar em toda a biblioteca..."
          className="flex-1 bg-transparent outline-none text-lg placeholder:text-slate-500"
        />
        <span className="text-xs text-slate-500 font-mono">{results.length} resultado(s)</span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-5 mt-10">
        {results.map((g) => (
          <Link to={`/game/${g.id}`} key={g.id}>
            <GameCard game={g} />
          </Link>
        ))}
      </div>
    </motion.div>
  )
}

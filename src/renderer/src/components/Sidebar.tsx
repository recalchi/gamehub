import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3,
  Cpu,
  Gamepad,
  Gamepad2,
  Home,
  Library,
  Package,
  Play,
  Search,
  Settings as SettingsIcon,
  Zap
} from 'lucide-react'
import { useLibraryStore } from '../store/library'
import type { ActiveLaunch } from '@shared/types'

const items = [
  { to: '/home', icon: Home, label: 'Início' },
  { to: '/library', icon: Library, label: 'Biblioteca' },
  { to: '/catalog', icon: Package, label: 'Catálogo' },
  { to: '/search', icon: Search, label: 'Buscar' },
  { to: '/stats', icon: BarChart3, label: 'Estatísticas' },
  { to: '/emulators', icon: Cpu, label: 'Emuladores' },
  { to: '/controllers', icon: Gamepad, label: 'Controles' },
  { to: '/settings', icon: SettingsIcon, label: 'Configurações' }
]

export default function Sidebar(): JSX.Element {
  const games = useLibraryStore((s) => s.games)
  const emulators = useLibraryStore((s) => s.emulators)
  const [active, setActive] = useState<ActiveLaunch[]>([])

  useEffect(() => {
    // Hydrate current state on mount in case an emulator was already running
    void window.api.launch.active().then(setActive)
    const offS = window.api.launch.onStarted((evt) =>
      setActive((cur) => [...cur.filter((c) => c.gameId !== evt.gameId), evt])
    )
    const offE = window.api.launch.onEnded((evt) =>
      setActive((cur) => cur.filter((c) => c.gameId !== evt.gameId))
    )
    return () => {
      offS()
      offE()
    }
  }, [])

  return (
    <aside className="w-64 shrink-0 h-full glass border-r border-white/5 flex flex-col">
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-center gap-2 text-lg font-display">
          <Gamepad2 className="w-7 h-7 text-accent" />
          <span className="logo-gradient font-bold tracking-wider">GAMEHUB</span>
        </div>
        <p className="text-xs text-slate-400 mt-1 font-light">v0.1 · MVP</p>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all',
                isActive
                  ? 'bg-accent/20 text-accent shadow-[0_0_30px_-10px_rgba(94,234,212,0.6)]'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              ].join(' ')
            }
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Now Playing — appears only while an emulator is running */}
      <AnimatePresence>
        {active.map((a) => (
          <motion.div
            key={a.gameId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-2 mx-2 mb-2 rounded-lg bg-accent/15 border border-accent/40 overflow-hidden"
          >
            <div className="flex items-center gap-2 text-[11px] text-accent uppercase tracking-widest">
              <motion.span
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
                className="inline-block w-1.5 h-1.5 rounded-full bg-accent"
              />
              Jogando
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Play className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="text-sm font-semibold text-white truncate">{a.gameTitle}</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              {a.emulatorName}
              {a.pid ? ` · pid ${a.pid}` : ''}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="px-4 py-4 border-t border-white/5 text-xs text-slate-400 space-y-1.5">
        <div className="flex items-center justify-between">
          <span>Jogos</span>
          <span className="text-slate-200 font-mono">{games.length}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Emuladores</span>
          <span className="text-slate-200 font-mono">{emulators.length}</span>
        </div>
        <div className="flex items-center gap-1 pt-2 text-accent/80">
          <Zap className="w-3 h-3" />
          <span>{active.length > 0 ? `${active.length} ativo(s)` : 'Pronto'}</span>
        </div>
      </div>
    </aside>
  )
}

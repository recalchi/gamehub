import { NavLink } from 'react-router-dom'
import {
  Cpu,
  Gamepad,
  Gamepad2,
  Home,
  Library,
  Search,
  Settings as SettingsIcon,
  Zap
} from 'lucide-react'
import { useLibraryStore } from '../store/library'

const items = [
  { to: '/home', icon: Home, label: 'Início' },
  { to: '/library', icon: Library, label: 'Biblioteca' },
  { to: '/search', icon: Search, label: 'Buscar' },
  { to: '/emulators', icon: Cpu, label: 'Emuladores' },
  { to: '/controllers', icon: Gamepad, label: 'Controles' },
  { to: '/settings', icon: SettingsIcon, label: 'Configurações' }
]

export default function Sidebar(): JSX.Element {
  const games = useLibraryStore((s) => s.games)
  const emulators = useLibraryStore((s) => s.emulators)

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
          <span>Pronto</span>
        </div>
      </div>
    </aside>
  )
}

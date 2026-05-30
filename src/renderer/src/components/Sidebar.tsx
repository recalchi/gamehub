import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { M, layoutSpring } from '../motion/tokens'
import {
  BarChart3,
  Award,
  Cpu,
  Gamepad,
  Gamepad2,
  Home,
  Library,
  Film,
  Package,
  Pin,
  PinOff,
  Play,
  Square,
  Search,
  Settings as SettingsIcon,
  Zap
} from 'lucide-react'
import { useLibraryStore } from '../store/library'
import type { ActiveLaunch } from '@shared/types'

/**
 * Sidebar items + lazy-import hook for hover prefetch.
 *
 * `prefetch` returns the same dynamic-import promise React.lazy uses to
 * resolve the page on click. Vite resolves it once and caches the chunk —
 * so a hover ~80ms before click means the JS is already parsed when the
 * user actually navigates. Zero-cost when the user never hovers.
 */
const items: Array<{
  to: string
  icon: typeof Home
  label: string
  prefetch: () => Promise<unknown>
}> = [
  { to: '/home', icon: Home, label: 'Inicio', prefetch: () => import('../pages/Home') },
  { to: '/library', icon: Library, label: 'Biblioteca', prefetch: () => import('../pages/Library') },
  { to: '/cinema', icon: Film, label: 'Cinema', prefetch: () => import('../pages/Cinema') },
  { to: '/catalog', icon: Package, label: 'Catalogo', prefetch: () => import('../pages/Catalog') },
  { to: '/achievements', icon: Award, label: 'Conquistas', prefetch: () => import('../pages/Achievements') },
  { to: '/search', icon: Search, label: 'Buscar', prefetch: () => import('../pages/Search') },
  { to: '/stats', icon: BarChart3, label: 'Estatisticas', prefetch: () => import('../pages/Stats') },
  { to: '/emulators', icon: Cpu, label: 'Emuladores', prefetch: () => import('../pages/Emulators') },
  { to: '/controllers', icon: Gamepad, label: 'Controles', prefetch: () => import('../pages/Controllers') },
  { to: '/settings', icon: SettingsIcon, label: 'Configuracoes', prefetch: () => import('../pages/Settings') }
]

const prefetched = new Set<string>()

export default function Sidebar(): JSX.Element {
  const games = useLibraryStore((s) => s.games)
  const emulators = useLibraryStore((s) => s.emulators)
  const settings = useLibraryStore((s) => s.settings)
  const saveSettings = useLibraryStore((s) => s.saveSettings)
  const terminate = useLibraryStore((s) => s.terminate)
  const [active, setActive] = useState<ActiveLaunch[]>([])
  const [stopping, setStopping] = useState<Record<string, boolean>>({})
  const [hovered, setHovered] = useState(false)
  const pinned = settings?.appearance.sidebarPinned ?? false
  const expanded = pinned || hovered
  const location = useLocation()
  // Pick the top-level path so /library/:platform still highlights "Biblioteca".
  const activeTopSegment = '/' + (location.pathname.split('/')[1] || 'home')

  useEffect(() => {
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

  async function togglePinned(): Promise<void> {
    if (!settings) return
    await saveSettings({
      appearance: { ...settings.appearance, sidebarPinned: !pinned }
    })
  }

  async function stopLaunch(gameId: string): Promise<void> {
    setStopping((cur) => ({ ...cur, [gameId]: true }))
    const r = await terminate(gameId)
    setStopping((cur) => ({ ...cur, [gameId]: false }))
    if (!r.ok && r.error) {
      await window.api.system.log('warn', 'sidebar', `terminate failed for ${gameId}`, {
        error: r.error
      })
    }
  }

  return (
    <motion.aside
      animate={{ width: expanded ? 256 : 72 }}
      transition={M.sidebar}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false)
      }}
      className="relative z-20 shrink-0 h-full flex flex-col bg-transparent overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/35 via-black/12 to-transparent" />
      <div className="absolute inset-y-0 right-0 w-12 pointer-events-none bg-gradient-to-r from-transparent to-black/10" />
      <div className="absolute inset-y-0 left-0 w-px bg-white/5" />

      <button
        type="button"
        onClick={() => void togglePinned()}
        className="absolute right-2 top-2 z-30 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white backdrop-blur-md"
        title={pinned ? 'Desafixar menu' : 'Fixar menu expandido'}
      >
        {pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
      </button>

      <div className={`relative z-10 pt-8 pb-6 ${expanded ? 'px-6' : 'px-4'}`}>
        <div
          className={`flex items-center gap-2 text-lg font-display ${expanded ? '' : 'justify-center'}`}
        >
          <Gamepad2 className="w-7 h-7 text-accent shrink-0" />
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="logo-gradient font-bold tracking-wider whitespace-nowrap"
              >
                GAMEHUB
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        {expanded && <p className="text-xs text-slate-400 mt-1 font-light">v0.1 - MVP</p>}
      </div>

      <nav className="relative z-10 flex-1 px-3 space-y-1">
        <LayoutGroup id="sidebar-rail-group">
          {items.map(({ to, icon: Icon, label, prefetch }) => {
            const isActive = activeTopSegment === to
            return (
              <NavLink
                key={to}
                title={label}
                to={to}
                onMouseEnter={() => {
                  // Prefetch the page chunk once per session. Vite caches the
                  // dynamic import so the second navigate is instant.
                  if (!prefetched.has(to)) {
                    prefetched.add(to)
                    void prefetch().catch(() => prefetched.delete(to))
                  }
                }}
                className={[
                  'relative flex items-center rounded-lg text-sm transition-colors',
                  expanded ? 'gap-3 px-4 py-2.5' : 'justify-center px-0 py-3',
                  isActive ? 'text-accent' : 'text-slate-300 hover:text-white'
                ].join(' ')}
              >
                {/* Sliding rail — single element shared across items via layoutId,
                    so Framer animates its position from old item to new one. */}
                {isActive && (
                  <motion.span
                    layoutId="sidebar-rail"
                    transition={layoutSpring}
                    className="absolute inset-0 rounded-lg bg-accent/20 shadow-[0_0_30px_-10px_rgba(94,234,212,0.6)]"
                  />
                )}
                {/* Hover bg sits underneath the rail so they don't double up. */}
                {!isActive && (
                  <span className="absolute inset-0 rounded-lg opacity-0 hover:opacity-100 bg-white/5 transition-opacity" />
                )}
                <Icon className="relative z-10 w-4 h-4 shrink-0" />
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.span
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={M.micro}
                      className="relative z-10 whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </NavLink>
            )
          })}
        </LayoutGroup>
      </nav>

      <AnimatePresence>
        {active.map((a) => (
          <motion.div
            key={a.gameId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`relative z-10 py-2 mx-2 mb-2 rounded-lg bg-accent/15 border border-accent/40 overflow-hidden ${expanded ? 'px-4' : 'px-2'}`}
          >
            <div
              className={`flex items-center gap-2 text-[11px] text-accent uppercase tracking-widest ${expanded ? '' : 'justify-center'}`}
            >
              <motion.span
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
                className="inline-block w-1.5 h-1.5 rounded-full bg-accent"
              />
              {expanded && 'Jogando'}
            </div>
            <div className={`flex items-center gap-2 mt-1 ${expanded ? '' : 'justify-center'}`}>
              <Play className="w-3.5 h-3.5 text-accent shrink-0" />
              {expanded && (
                <span className="text-sm font-semibold text-white truncate">{a.gameTitle}</span>
              )}
            </div>
            {expanded && (
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <div className="text-[10px] text-slate-400 font-mono">
                  {a.emulatorName}
                  {a.pid ? ` - pid ${a.pid}` : ''}
                </div>
                <button
                  type="button"
                  onClick={() => void stopLaunch(a.gameId)}
                  disabled={stopping[a.gameId]}
                  className="rounded bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 px-1.5 py-0.5 text-[10px] inline-flex items-center gap-1 disabled:opacity-60"
                  title="Encerrar jogo"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  {stopping[a.gameId] ? '...' : 'Parar'}
                </button>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      <div
        className={`relative z-10 px-4 py-4 border-t border-white/5 text-xs text-slate-400 space-y-1.5 ${expanded ? '' : 'text-center'}`}
      >
        {expanded ? (
          <>
            <div className="flex items-center justify-between">
              <span>Jogos</span>
              <span className="text-slate-200 font-mono">{games.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Emuladores</span>
              <span className="text-slate-200 font-mono">{emulators.length}</span>
            </div>
          </>
        ) : (
          <div className="text-slate-200 font-mono">{games.length}</div>
        )}
        <div
          className={`flex items-center gap-1 pt-2 text-accent/80 ${expanded ? '' : 'justify-center'}`}
        >
          <Zap className="w-3 h-3" />
          {expanded && <span>{active.length > 0 ? `${active.length} ativo(s)` : 'Pronto'}</span>}
        </div>
      </div>
    </motion.aside>
  )
}

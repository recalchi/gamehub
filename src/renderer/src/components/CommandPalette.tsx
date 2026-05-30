import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'
import {
  ArrowRight,
  Award,
  BarChart3,
  Command as CommandIcon,
  Cpu,
  Disc,
  Download,
  FolderOpen,
  Gamepad,
  Gamepad2,
  Home,
  Library,
  Package,
  Play,
  Plug,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Sparkles
} from 'lucide-react'
import { useLibraryStore } from '../store/library'
import { PLATFORMS } from '@shared/platforms'
import { M, easings } from '../motion/tokens'
import type { Game } from '@shared/types'

/**
 * Spotlight / Linear-style command palette.
 *
 * Ctrl+K (or Cmd+K) opens it from anywhere. Fuzzy-searches across:
 *   - Every game in the library (run, jump to detail)
 *   - Static actions (rescan, import Steam, install PS3 firmware, etc)
 *   - Navigation shortcuts (Home, Library, every Settings section)
 *
 * Items have a `score` field that biases ordering — games > actions > nav
 * — so typing "set" surfaces "Settings" before "settings file".
 *
 * Keyboard model: ↑/↓ to move, Enter to confirm, Esc to dismiss. Mouse
 * works too; hover updates selectedIndex to keep both inputs coherent.
 */

type CommandItem =
  | { kind: 'game'; id: string; label: string; subtitle: string; game: Game }
  | { kind: 'action'; id: string; label: string; subtitle: string; icon: typeof Play; run: () => void; group: string }
  | { kind: 'nav'; id: string; label: string; subtitle: string; icon: typeof Play; to: string }

export default function CommandPalette(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const games = useLibraryStore((s) => s.games)
  const scan = useLibraryStore((s) => s.scan)
  const launch = useLibraryStore((s) => s.launch)
  const reload = useLibraryStore((s) => s.reload)
  const navigate = useNavigate()

  // Global Ctrl/Cmd+K toggles open. Esc closes. We swallow the event so
  // browser/electron defaults don't fight us.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((cur) => !cur)
        return
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Reset state every time it opens — clean slate, focus input next frame.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  // Build the full item set every render — cheap because Fuse re-indexes
  // only the unfiltered list, not the filtered one.
  const allItems: CommandItem[] = useMemo(() => {
    const gameItems: CommandItem[] = games.map((g) => ({
      kind: 'game',
      id: `game-${g.id}`,
      label: g.title,
      subtitle: PLATFORMS[g.platform]?.name ?? g.platform,
      game: g
    }))

    const actions: CommandItem[] = [
      {
        kind: 'action',
        id: 'action-rescan',
        label: 'Re-escanear biblioteca',
        subtitle: 'Varre as pastas configuradas em busca de jogos novos',
        icon: RefreshCw,
        group: 'Biblioteca',
        run: async () => {
          await scan({ fresh: false })
        }
      },
      {
        kind: 'action',
        id: 'action-validate-covers',
        label: 'Validar e preencher capas',
        subtitle: 'Confere capas quebradas e gera capa local automática quando faltar',
        icon: Sparkles,
        group: 'Biblioteca',
        run: async () => {
          await window.api.library.enrich()
          await reload()
        }
      },
      {
        kind: 'action',
        id: 'action-import-steam',
        label: 'Importar biblioteca Steam',
        subtitle: 'Lê libraryfolders.vdf local — sem credenciais',
        icon: Download,
        group: 'Integrações',
        run: async () => {
          await window.api.system.importSteam()
          await reload()
        }
      },
      {
        kind: 'action',
        id: 'action-import-epic',
        label: 'Importar biblioteca Epic Games',
        subtitle: 'Lê manifestos locais + .egstore — sem login',
        icon: Download,
        group: 'Integrações',
        run: async () => {
          await window.api.system.importEpic()
          await reload()
        }
      },
      {
        kind: 'action',
        id: 'action-install-ps3fw',
        label: 'Instalar firmware PS3 (RPCS3)',
        subtitle: 'Procura PS3UPDAT.PUP e abre o instalador do RPCS3',
        icon: Disc,
        group: 'Integrações',
        run: async () => {
          await window.api.emulator.installPs3Firmware()
        }
      },
      {
        kind: 'action',
        id: 'action-install-shadps4-qt',
        label: 'Instalar shadPS4 v0.12.0 Qt',
        subtitle: 'Última build oficial com File → Install Packages funcionando',
        icon: Download,
        group: 'Integrações',
        run: async () => {
          await window.api.system.autoInstallEmulator('shadps4', 'shadPS4 Qt v0.12.0')
        }
      },
      {
        kind: 'action',
        id: 'action-open-pkgextract',
        label: 'Abrir guia: extrair PS4 PKG com pkgextract',
        subtitle: 'Ferramenta CLI open-source confirmada funcional',
        icon: Disc,
        group: 'Integrações',
        run: async () => {
          await window.api.system.openExternal(
            'https://github.com/paulomanrique/ps4-pkg-extractor/releases'
          )
        }
      },
      {
        kind: 'action',
        id: 'action-shadps4-ue4-profile',
        label: 'shadPS4: aplicar config UE4 (Elden Ring, Days Gone)',
        subtitle: 'Liga readbacks + patchShaders + 1080p — necessário pra jogos Unreal Engine 4',
        icon: Disc,
        group: 'Integrações',
        run: async () => {
          await window.api.system.applyShadPs4Profile('ue4')
        }
      },
      {
        kind: 'action',
        id: 'action-shadps4-default-profile',
        label: 'shadPS4: voltar pro config padrão',
        subtitle: 'Restaura defaults (readbacks off, etc.) — usar se UE4 settings causarem regressão',
        icon: Disc,
        group: 'Integrações',
        run: async () => {
          await window.api.system.applyShadPs4Profile('default')
        }
      },
      {
        kind: 'action',
        id: 'action-discord-test',
        label: 'Testar Discord Rich Presence',
        subtitle: 'Tenta conectar no pipe IPC e fazer handshake',
        icon: Plug,
        group: 'Integrações',
        run: async () => {
          await window.api.discord.validate()
        }
      }
    ]

    const nav: CommandItem[] = [
      { kind: 'nav', id: 'nav-home', label: 'Início', subtitle: 'Tela inicial', icon: Home, to: '/home' },
      { kind: 'nav', id: 'nav-library', label: 'Biblioteca', subtitle: 'Todos os jogos', icon: Library, to: '/library' },
      { kind: 'nav', id: 'nav-catalog', label: 'Catálogo', subtitle: 'Jogos disponíveis pra baixar', icon: Package, to: '/catalog' },
      { kind: 'nav', id: 'nav-achievements', label: 'Conquistas', subtitle: 'Achievements de cada jogo', icon: Award, to: '/achievements' },
      { kind: 'nav', id: 'nav-stats', label: 'Estatísticas', subtitle: 'Tempo jogado, gráficos', icon: BarChart3, to: '/stats' },
      { kind: 'nav', id: 'nav-emulators', label: 'Emuladores', subtitle: 'Status e instalação', icon: Cpu, to: '/emulators' },
      { kind: 'nav', id: 'nav-controllers', label: 'Controles', subtitle: 'Configuração de gamepad', icon: Gamepad, to: '/controllers' },
      { kind: 'nav', id: 'nav-search', label: 'Buscar', subtitle: 'Página de busca completa', icon: Search, to: '/search' },
      { kind: 'nav', id: 'nav-settings', label: 'Configurações', subtitle: 'Tudo', icon: SettingsIcon, to: '/settings' },
      { kind: 'nav', id: 'nav-settings-int', label: 'Configurações → Integrações', subtitle: 'Steam, Discord, PS3 firmware', icon: Plug, to: '/settings#integrations' },
      { kind: 'nav', id: 'nav-settings-folders', label: 'Configurações → Pastas', subtitle: 'gameRoots, emulatorRoots', icon: FolderOpen, to: '/settings#folders' },
      { kind: 'nav', id: 'nav-settings-launch', label: 'Configurações → Abertura', subtitle: 'Preset de tela cheia, monitor', icon: Gamepad2, to: '/settings#launch' }
    ]

    return [...gameItems, ...actions, ...nav]
  }, [games, scan, launch, reload])

  // Fuse search. When query empty we surface a curated welcome list.
  const fuse = useMemo(
    () =>
      new Fuse(allItems, {
        keys: [
          { name: 'label', weight: 0.7 },
          { name: 'subtitle', weight: 0.2 },
          { name: 'group', weight: 0.1 }
        ],
        threshold: 0.4,
        ignoreLocation: true
      }),
    [allItems]
  )

  const filtered = useMemo<CommandItem[]>(() => {
    if (!query.trim()) {
      // Empty state: top 4 actions + 4 most recent games. Surfaces "what's
      // possible" instead of an intimidating wall of nothing.
      const recents = [...games]
        .filter((g) => g.lastPlayedAt)
        .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))
        .slice(0, 4)
      const recentItems: CommandItem[] = recents.map((g) => ({
        kind: 'game',
        id: `game-${g.id}`,
        label: g.title,
        subtitle: PLATFORMS[g.platform]?.name ?? g.platform,
        game: g
      }))
      const actions = allItems.filter((i) => i.kind === 'action').slice(0, 4)
      return [...recentItems, ...actions]
    }
    return fuse.search(query).slice(0, 30).map((r) => r.item)
  }, [query, fuse, allItems, games])

  // Clamp selection when the list shrinks.
  useEffect(() => {
    if (selectedIndex >= filtered.length) setSelectedIndex(Math.max(0, filtered.length - 1))
  }, [filtered.length, selectedIndex])

  function executeItem(item: CommandItem): void {
    setOpen(false)
    if (item.kind === 'game') {
      navigate(`/game/${item.game.id}`)
    } else if (item.kind === 'action') {
      void item.run()
    } else {
      // For hashed paths (/settings#integrations) navigate sets pathname+hash
      // in one shot; the SettingsNav hash effect picks it up on mount.
      navigate(item.to)
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[selectedIndex]
      if (item) executeItem(item)
    } else if (e.key === 'Tab') {
      // Tab cycles like arrows so palette can be used purely from input focus.
      e.preventDefault()
      setSelectedIndex((i) =>
        e.shiftKey
          ? (i - 1 + filtered.length) % filtered.length
          : (i + 1) % filtered.length
      )
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={M.micro}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/55 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: easings.outQuint }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-white/10 bg-ink-900/95 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
              <CommandIcon className="w-4 h-4 text-accent shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelectedIndex(0)
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="Buscar jogo, ação ou navegar…"
                className="flex-1 bg-transparent outline-none text-base placeholder:text-slate-500"
              />
              <kbd className="text-[10px] uppercase tracking-wider text-slate-500 border border-white/10 rounded px-1.5 py-0.5 font-mono">
                Esc
              </kbd>
            </div>

            <ul className="max-h-[55vh] overflow-y-auto py-2">
              {filtered.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-slate-500">
                  Nada bate com <span className="text-slate-300 font-mono">"{query}"</span>
                </li>
              )}
              {filtered.map((item, idx) => (
                <CommandRow
                  key={item.id}
                  item={item}
                  selected={idx === selectedIndex}
                  onHover={() => setSelectedIndex(idx)}
                  onClick={() => executeItem(item)}
                />
              ))}
            </ul>

            <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-white/5 text-[11px] text-slate-500 font-mono">
              <div className="flex items-center gap-3">
                <span><kbd className="text-slate-300">↑↓</kbd> mover</span>
                <span><kbd className="text-slate-300">↵</kbd> abrir</span>
                <span><kbd className="text-slate-300">esc</kbd> fechar</span>
              </div>
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> {filtered.length} resultado{filtered.length === 1 ? '' : 's'}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CommandRow({
  item,
  selected,
  onHover,
  onClick
}: {
  item: CommandItem
  selected: boolean
  onHover: () => void
  onClick: () => void
}): JSX.Element {
  const Icon =
    item.kind === 'game' ? Play : item.kind === 'action' ? item.icon : item.icon
  const groupLabel =
    item.kind === 'game' ? 'Jogo' : item.kind === 'action' ? item.group : 'Navegar'

  return (
    <li>
      <button
        type="button"
        onMouseEnter={onHover}
        onClick={onClick}
        className={`relative w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
          selected ? 'bg-accent/15 text-white' : 'text-slate-200 hover:bg-white/5'
        }`}
      >
        {selected && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-accent" />
        )}
        <div className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${
          selected ? 'bg-accent/25 text-accent' : 'bg-white/5 text-slate-300'
        }`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{item.label}</div>
          <div className="text-[11px] text-slate-500 truncate">{item.subtitle}</div>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono shrink-0">
          {groupLabel}
        </span>
        {selected && <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0" />}
      </button>
    </li>
  )
}

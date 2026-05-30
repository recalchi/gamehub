import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Gamepad, Keyboard, X } from 'lucide-react'

/**
 * Global keyboard shortcut + gamepad mapping reference.
 *
 * Activated by pressing `?` (Shift+/) anywhere. The list is curated by hand
 * because the actual handlers live in many components and there's no clean
 * way to introspect them.
 */
const KEY_SECTIONS = [
  {
    title: 'Navegação',
    rows: [
      ['Ctrl/⌘ + K', 'Abrir paleta de comandos'],
      ['Arrows / WASD', 'Mover foco'],
      ['Enter', 'Confirmar / Jogar'],
      ['Esc', 'Voltar / Sair'],
      ['F11', 'Alternar fullscreen'],
      ['?', 'Mostrar/esconder esta tela']
    ]
  },
  {
    title: 'Tela do jogo',
    rows: [
      ['Enter', 'Jogar'],
      ['F', 'Favoritar / Desfavoritar'],
      ['Esc', 'Voltar à biblioteca']
    ]
  },
  {
    title: 'Splash',
    rows: [
      ['Esc / Space / Enter', 'Pular para Home']
    ]
  },
  {
    title: 'Modo TV',
    rows: [
      ['↑ ↓', 'Trocar entre linha de plataforma e linha de jogos'],
      ['← →', 'Mover dentro da linha'],
      ['Enter', 'Entrar / Jogar'],
      ['Esc / Backspace', 'Sair do Modo TV']
    ]
  }
]

const PAD_ROWS: Array<[string, string]> = [
  ['A / X (Sony)', 'Confirmar / Jogar'],
  ['B / ⃝ (Sony)', 'Voltar'],
  ['Start', 'Abrir Configurações'],
  ['LB / RB', 'Trocar categoria (em telas que suportam)'],
  ['D-pad / Stick esquerdo', 'Navegação direcional']
]

export default function ShortcutsOverlay(): JSX.Element {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '?') {
        e.preventDefault()
        setOpen((x) => !x)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md"
        >
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-2xl w-[44rem] max-w-[95vw] max-h-[85vh] overflow-y-auto p-8"
          >
            <header className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-bold flex items-center gap-3">
                <Keyboard className="w-6 h-6 text-accent" /> Atalhos
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {KEY_SECTIONS.map((s) => (
                <section key={s.title}>
                  <h3 className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">
                    {s.title}
                  </h3>
                  <ul className="space-y-1.5">
                    {s.rows.map(([k, label]) => (
                      <li
                        key={k}
                        className="flex items-center justify-between text-sm gap-3"
                      >
                        <kbd className="px-2 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                          {k}
                        </kbd>
                        <span className="text-slate-300 text-right text-xs flex-1">{label}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              <section className="md:col-span-2 border-t border-white/5 pt-4">
                <h3 className="text-[11px] uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                  <Gamepad className="w-3.5 h-3.5" /> Controle
                </h3>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                  {PAD_ROWS.map(([k, label]) => (
                    <li key={k} className="flex items-center justify-between text-sm gap-3">
                      <kbd className="px-2 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                        {k}
                      </kbd>
                      <span className="text-slate-300 text-right text-xs flex-1">{label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <p className="text-[11px] text-slate-500 mt-6 text-center">
              Pressione <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono">?</kbd> a
              qualquer momento para mostrar / esconder.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

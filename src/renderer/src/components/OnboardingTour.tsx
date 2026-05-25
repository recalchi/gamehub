import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronRight,
  FolderOpen,
  Gamepad2,
  Package,
  Plus,
  X
} from 'lucide-react'
import { useLibraryStore } from '../store/library'

/**
 * One-time welcome tour shown when the library is empty and the user hasn't
 * dismissed it before. Three steps:
 *
 *   1. Welcome — what GameHub is
 *   2. Configure scan paths — link to Settings
 *   3. Add games — link to Library "Adicionar"
 *
 * Step 3 also points at the curated catalog as a low-effort way to populate
 * the library and verify the launcher pipeline.
 *
 * Persists `hasSeenOnboarding: true` to settings on dismissal so it never
 * appears again, even if the library gets emptied later.
 */
export default function OnboardingTour(): JSX.Element {
  const settings = useLibraryStore((s) => s.settings)
  const games = useLibraryStore((s) => s.games)
  const save = useLibraryStore((s) => s.saveSettings)
  const [step, setStep] = useState(0)

  const shouldShow = !!settings && !settings.hasSeenOnboarding && games.length === 0
  if (!shouldShow) return <></>

  function dismiss(): void {
    void save({ hasSeenOnboarding: true })
  }

  const steps = [
    {
      icon: Gamepad2,
      title: 'Bem-vindo ao GameHub',
      body:
        'Seu console pessoal no PC. GameHub escaneia ROMs e jogos espalhados pelo disco, detecta emuladores instalados, baixa capas automaticamente, e lança tudo com um clique.',
      action: null
    },
    {
      icon: FolderOpen,
      title: 'Configure suas pastas',
      body:
        'Por padrão escaneamos D:\\Jogos e D:\\Jogos\\Emuladores. Se seus jogos estão em outro lugar, adicione o caminho em Configurações.',
      action: (
        <Link
          to="/settings"
          onClick={dismiss}
          className="px-4 py-2 bg-accent text-ink-950 rounded-md text-sm font-semibold inline-flex items-center gap-2"
        >
          Abrir Configurações <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      )
    },
    {
      icon: Plus,
      title: 'Adicione jogos',
      body:
        'Já tem jogos no disco? Clique em "Adicionar" na Biblioteca. Quer testar sem nada? O Catálogo tem homebrews legais com instalação um-clique.',
      action: (
        <div className="flex gap-2">
          <Link
            to="/library"
            onClick={dismiss}
            className="px-4 py-2 bg-accent text-ink-950 rounded-md text-sm font-semibold inline-flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Biblioteca
          </Link>
          <Link
            to="/catalog"
            onClick={dismiss}
            className="px-4 py-2 glass rounded-md text-sm inline-flex items-center gap-2"
          >
            <Package className="w-3.5 h-3.5" /> Catálogo
          </Link>
        </div>
      )
    }
  ]

  const current = steps[step]
  const Icon = current.icon
  const isLast = step === steps.length - 1

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 backdrop-blur-md"
      >
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 280 }}
          className="glass rounded-2xl p-8 w-[28rem] max-w-[95vw]"
        >
          <header className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-accent/15 flex items-center justify-center">
              <Icon className="w-6 h-6 text-accent" />
            </div>
            <button
              onClick={dismiss}
              className="text-slate-400 hover:text-white p-1"
              title="Pular tour"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          <h2 className="text-2xl font-display font-bold mb-2">{current.title}</h2>
          <p className="text-slate-300 leading-relaxed">{current.body}</p>

          {current.action && <div className="mt-5">{current.action}</div>}

          {/* Step indicators + nav */}
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all ${
                    i === step ? 'w-8 bg-accent' : 'w-2 bg-white/15'
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {!isLast ? (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="text-sm text-slate-300 hover:text-white px-3 py-1.5 rounded hover:bg-white/5 flex items-center gap-1"
                >
                  Próximo <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={dismiss}
                  className="text-sm text-slate-300 hover:text-white px-3 py-1.5 rounded hover:bg-white/5 flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Fechar
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, X } from 'lucide-react'
import type { LaunchFallbackEvent } from '@shared/types'

/**
 * Transient toast shown when the launcher auto-retries a failed game with a
 * different emulator. Neutral (blue), no actions, shorter dismiss — this isn't
 * an error, just a heads-up that the system is doing work on the user's behalf.
 */

interface Toast extends LaunchFallbackEvent {
  toastId: number
}

const AUTO_DISMISS_MS = 6_000

export default function LaunchFallbackToast(): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    let counter = 0
    return window.api.launch.onFallback((event) => {
      const toastId = ++counter
      setToasts((cur) => [...cur, { ...event, toastId }])
      setTimeout(() => {
        setToasts((cur) => cur.filter((t) => t.toastId !== toastId))
      }, AUTO_DISMISS_MS)
    })
  }, [])

  function dismiss(id: number): void {
    setToasts((cur) => cur.filter((t) => t.toastId !== id))
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[71] space-y-2 max-w-md pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.toastId}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            className="glass border border-sky-500/40 bg-sky-950/50 rounded-lg p-3 pointer-events-auto shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <RefreshCw className="w-4 h-4 text-sky-300 shrink-0 mt-0.5 animate-spin" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-sky-100">
                  Tentando com {t.toEmulator}…
                </div>
                <div className="text-[11px] text-sky-200/80 mt-0.5">
                  {t.fromEmulator} falhou ao abrir {t.gameTitle}. Trocando de emulador
                  automaticamente.
                </div>
              </div>
              <button
                onClick={() => dismiss(t.toastId)}
                className="text-sky-200/60 hover:text-sky-100 -mt-1 -mr-1"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

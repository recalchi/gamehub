import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertOctagon, FileText, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { LaunchFailedEvent } from '@shared/types'

/**
 * Listens globally for launch-failed broadcasts and renders a stacking toast.
 *
 * We auto-dismiss after 12s but keep them visible long enough for the user to
 * click "Ver logs" if they want diagnostics. Stack is capped at 3 to avoid
 * runaway when an emulator keeps crashing in a loop.
 */

interface Toast extends LaunchFailedEvent {
  toastId: number
}

const MAX_TOASTS = 3
const AUTO_DISMISS_MS = 12_000

export default function LaunchFailureToast(): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    let counter = 0
    return window.api.launch.onFailed((event) => {
      const toastId = ++counter
      setToasts((cur) => [...cur, { ...event, toastId }].slice(-MAX_TOASTS))
      setTimeout(() => {
        setToasts((cur) => cur.filter((t) => t.toastId !== toastId))
      }, AUTO_DISMISS_MS)
    })
  }, [])

  function dismiss(id: number): void {
    setToasts((cur) => cur.filter((t) => t.toastId !== id))
  }

  return (
    <div className="fixed bottom-6 right-6 z-[70] space-y-2 max-w-sm pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.toastId}
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            className="glass border border-rose-500/40 bg-rose-950/40 rounded-lg p-4 pointer-events-auto shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <AlertOctagon className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-rose-100">
                  {t.gameTitle} fechou inesperadamente
                </div>
                <div className="text-[11px] text-rose-200/80 mt-0.5">
                  {t.emulatorName} encerrou em {t.seconds}s com código {t.code ?? '?'}. Verifique
                  BIOS / arquivo / config.
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => {
                      dismiss(t.toastId)
                      navigate('/settings')
                    }}
                    className="text-[11px] text-rose-200 hover:text-white inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5"
                  >
                    <FileText className="w-3 h-3" /> Ver logs
                  </button>
                </div>
              </div>
              <button
                onClick={() => dismiss(t.toastId)}
                className="text-rose-200/60 hover:text-rose-100 -mt-1 -mr-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

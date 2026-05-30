import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Gamepad2, X } from 'lucide-react'
import { useLibraryStore } from '../store/library'

interface Toast {
  id: number
  type: 'connected' | 'disconnected'
  name: string
}

/**
 * Live controller connection notifier. The Web Gamepad API only populates
 * its list once the user presses a button on a new controller — at which
 * point a `gamepadconnected` event fires. We surface that as a toast so the
 * user gets confirmation that GameHub recognised the controller plugged in
 * *after* the app was already open (which was the original complaint —
 * users connecting controllers mid-session never saw feedback).
 *
 * Additionally, if no `preferredGamepadId` is set yet, we auto-adopt the
 * first connected controller as the preferred one so the input pipeline
 * (sidebar nav, big-picture, command palette) starts working immediately
 * without the user having to visit the Controllers page.
 */
export default function ControllerConnectionToast(): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const settings = useLibraryStore((s) => s.settings)
  const saveSettings = useLibraryStore((s) => s.saveSettings)

  useEffect(() => {
    let nextId = 1

    function push(toast: Omit<Toast, 'id'>): void {
      const id = nextId++
      setToasts((prev) => [...prev, { ...toast, id }])
      // Auto-dismiss after 4s
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 4000)
    }

    function onConnected(event: GamepadEvent): void {
      const pad = event.gamepad
      push({ type: 'connected', name: friendlyName(pad.id) })
      // Adopt as preferred if user hasn't picked one yet.
      const current = settings?.input?.preferredGamepadId ?? ''
      if (!current && settings?.input) {
        void saveSettings({
          input: { ...settings.input, preferredGamepadId: pad.id }
        })
      }
    }

    function onDisconnected(event: GamepadEvent): void {
      const pad = event.gamepad
      push({ type: 'disconnected', name: friendlyName(pad.id) })
    }

    window.addEventListener('gamepadconnected', onConnected)
    window.addEventListener('gamepaddisconnected', onDisconnected)
    return () => {
      window.removeEventListener('gamepadconnected', onConnected)
      window.removeEventListener('gamepaddisconnected', onDisconnected)
    }
  }, [settings, saveSettings])

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={`pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${
              toast.type === 'connected'
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-50'
                : 'border-rose-400/30 bg-rose-500/10 text-rose-50'
            }`}
          >
            <div
              className={`shrink-0 rounded-md p-2 ${
                toast.type === 'connected'
                  ? 'bg-emerald-500/25 text-emerald-200'
                  : 'bg-rose-500/25 text-rose-200'
              }`}
            >
              {toast.type === 'connected' ? (
                <Gamepad2 className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest opacity-80">
                {toast.type === 'connected' ? 'Controle conectado' : 'Controle desconectado'}
              </div>
              <div className="truncate text-sm font-semibold">{toast.name}</div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/** Strip the long vendor/product id tail browsers append (e.g.
 *  "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02e0)"
 *  becomes just "Xbox Wireless Controller"). */
function friendlyName(rawId: string): string {
  const paren = rawId.indexOf(' (')
  return (paren > 0 ? rawId.slice(0, paren) : rawId).trim() || 'Controle'
}

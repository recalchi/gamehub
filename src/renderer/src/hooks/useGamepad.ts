import { useEffect, useRef } from 'react'
import { useLibraryStore } from '../store/library'

export interface GamepadHandlers {
  onUp?: () => void
  onDown?: () => void
  onLeft?: () => void
  onRight?: () => void
  onConfirm?: () => void
  onBack?: () => void
  onMenu?: () => void
  onShoulderL?: () => void
  onShoulderR?: () => void
}

/**
 * Poll the Web Gamepad API at ~30fps and translate edge transitions into
 * semantic events. We never auto-repeat: holding the stick fires once, which
 * matches console-launcher UX better than a continuous keyrepeat.
 *
 * Mappings follow the standard Xbox/PS layout:
 *   A (0)         → confirm   (B if `swapConfirmBack`)
 *   B (1)         → back      (A if `swapConfirmBack`)
 *   Start (9)     → menu
 *   LB/RB (4/5)   → shoulder L/R
 *   D-pad 12-15   → directional
 *   Left stick    → directional (deadzone from settings)
 *
 * User preferences (deadzone, preferred gamepad, axis inversion, A/B swap)
 * come from the zustand library store and update live without remount.
 */
export function useGamepad(handlers: GamepadHandlers): void {
  const prev = useRef<Record<string, boolean>>({})
  const raf = useRef<number | null>(null)
  const settings = useLibraryStore((s) => s.settings)

  useEffect(() => {
    const loop = (): void => {
      const input = settings?.input
      const deadzone = input?.deadzone ?? 0.5
      const invertY = input?.invertY ?? false
      const swap = input?.swapConfirmBack ?? false
      const preferred = input?.preferredGamepadId ?? ''

      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      const candidates = preferred
        ? pads.filter((p) => p && p.id === preferred)
        : pads

      for (const pad of candidates) {
        if (!pad) continue
        const buttons = pad.buttons
        const axes = pad.axes
        const yAxis = invertY ? -(axes[1] ?? 0) : axes[1] ?? 0

        const state = {
          a: buttons[0]?.pressed,
          b: buttons[1]?.pressed,
          start: buttons[9]?.pressed,
          lb: buttons[4]?.pressed,
          rb: buttons[5]?.pressed,
          up: buttons[12]?.pressed || yAxis < -deadzone,
          down: buttons[13]?.pressed || yAxis > deadzone,
          left: buttons[14]?.pressed || (axes[0] ?? 0) < -deadzone,
          right: buttons[15]?.pressed || (axes[0] ?? 0) > deadzone
        }

        for (const key of Object.keys(state) as Array<keyof typeof state>) {
          const pressed = !!state[key]
          const wasPressed = !!prev.current[key]
          if (pressed && !wasPressed) {
            switch (key) {
              case 'a':
                ;(swap ? handlers.onBack : handlers.onConfirm)?.()
                break
              case 'b':
                ;(swap ? handlers.onConfirm : handlers.onBack)?.()
                break
              case 'start':
                handlers.onMenu?.()
                break
              case 'lb':
                handlers.onShoulderL?.()
                break
              case 'rb':
                handlers.onShoulderR?.()
                break
              case 'up':
                handlers.onUp?.()
                break
              case 'down':
                handlers.onDown?.()
                break
              case 'left':
                handlers.onLeft?.()
                break
              case 'right':
                handlers.onRight?.()
                break
            }
          }
          prev.current[key] = pressed
        }
      }
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    }
  }, [handlers, settings])
}

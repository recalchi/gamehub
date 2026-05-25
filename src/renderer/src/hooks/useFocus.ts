import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Very small spatial-navigation helper.
 *
 * Tracks an index across `count` items, exposes the current index, and binds
 * arrow keys + WASD. It is intentionally 1-D — most of our shelves are linear.
 * Cards opt-in by setting `data-focused={index === focused}` and listening for
 * Enter on the focused row.
 */
export function useFocus(
  count: number,
  options: {
    initial?: number
    orientation?: 'horizontal' | 'vertical'
    onConfirm?: (index: number) => void
    enabled?: boolean
  } = {}
): { focused: number; setFocused: (i: number) => void; ref: React.RefObject<HTMLDivElement> } {
  const { initial = 0, orientation = 'horizontal', onConfirm, enabled = true } = options
  const [focused, setFocused] = useState(Math.min(initial, Math.max(count - 1, 0)))
  const ref = useRef<HTMLDivElement>(null)

  // Clamp when count shrinks
  useEffect(() => {
    setFocused((f) => Math.min(f, Math.max(count - 1, 0)))
  }, [count])

  const move = useCallback(
    (delta: number) => {
      setFocused((f) => {
        const next = f + delta
        if (next < 0) return 0
        if (next > count - 1) return count - 1
        return next
      })
    },
    [count]
  )

  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (orientation === 'horizontal') {
        if (e.key === 'ArrowRight' || e.key === 'd') move(1)
        else if (e.key === 'ArrowLeft' || e.key === 'a') move(-1)
      } else {
        if (e.key === 'ArrowDown' || e.key === 's') move(1)
        else if (e.key === 'ArrowUp' || e.key === 'w') move(-1)
      }
      if (e.key === 'Enter') onConfirm?.(focused)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, focused, move, onConfirm, orientation])

  // Scroll focused element into view when it changes
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-index="${focused}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [focused])

  return { focused, setFocused, ref }
}

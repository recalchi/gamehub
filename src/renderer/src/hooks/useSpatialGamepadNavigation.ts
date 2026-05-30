import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useGamepad } from './useGamepad'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * Console-style navigation layer for the whole app.
 *
 * It treats visible links/buttons/inputs as a spatial graph, moves focus toward
 * the nearest element in the requested direction, clicks with confirm, and
 * keeps focused game cards visually lifted. This avoids per-page controller
 * wiring while still making every existing screen usable from the couch.
 */
export function useSpatialGamepadNavigation(): void {
  const navigate = useNavigate()
  const location = useLocation()

  const focusFirst = useCallback(() => {
    const active = document.activeElement
    if (active && isFocusable(active)) return
    const first = visibleFocusables()[0]
    if (first) focusElement(first)
  }, [])

  useEffect(() => {
    const id = window.setTimeout(focusFirst, 80)
    return () => window.clearTimeout(id)
  }, [focusFirst, location.pathname])

  const move = useCallback((direction: Direction) => {
    if (isTypingTarget(document.activeElement)) return
    const candidates = visibleFocusables()
    if (candidates.length === 0) return

    const current = isFocusable(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : nearestToViewportCenter(candidates)
    if (!current) {
      focusElement(candidates[0])
      return
    }

    const next = nearestInDirection(current, candidates, direction)
    if (next) focusElement(next)
  }, [])

  const confirm = useCallback(() => {
    const active = document.activeElement as HTMLElement | null
    if (!active) {
      focusFirst()
      return
    }
    document.body.dataset.inputMode = 'gamepad'
    if (isTypingTarget(active)) {
      active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      emitUiSound('confirm')
      return
    }
    if (isFocusable(active)) {
      active.click()
      return
    }
    focusFirst()
  }, [focusFirst])

  const back = useCallback(() => {
    if (isTypingTarget(document.activeElement)) {
      ;(document.activeElement as HTMLElement).blur()
      emitUiSound('back')
      return
    }
    emitUiSound('back')
    window.history.back()
  }, [])

  useGamepad({
    onUp: () => move('up'),
    onDown: () => move('down'),
    onLeft: () => move('left'),
    onRight: () => move('right'),
    onConfirm: confirm,
    onBack: back,
    onMenu: () => navigate('/settings'),
    onShoulderL: () => scrollFocusedShelf(-1),
    onShoulderR: () => scrollFocusedShelf(1)
  })
}

function visibleFocusables(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      isFocusable(el) &&
      !(el.tagName.toLowerCase() !== 'a' && el.closest('a[href]')) &&
      !el.closest('[aria-hidden="true"]') &&
      !el.closest('[data-gamepad-ignore="true"]')
  )
}

function isFocusable(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (el.hasAttribute('disabled')) return false
  if (el.getAttribute('aria-disabled') === 'true') return false
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false
  }
  return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth
}

function isTypingTarget(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}

function focusElement(el: HTMLElement): void {
  document.body.dataset.inputMode = 'gamepad'
  clearGamepadFocus()
  el.focus({ preventScroll: true })
  el.dataset.gamepadFocus = 'true'
  const card = el.classList.contains('focus-card')
    ? el
    : el.querySelector<HTMLElement>('.focus-card')
  if (card) card.dataset.focused = 'true'
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  emitUiSound('navigation')
}

function emitUiSound(kind: 'navigation' | 'confirm' | 'back' | 'toggle' | 'launch'): void {
  window.dispatchEvent(new CustomEvent('gamehub:ui-sound', { detail: { kind } }))
}

function clearGamepadFocus(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-gamepad-focus="true"]')) {
    delete el.dataset.gamepadFocus
  }
  for (const el of document.querySelectorAll<HTMLElement>('.focus-card[data-focused="true"]')) {
    delete el.dataset.focused
  }
}

function nearestToViewportCenter(candidates: HTMLElement[]): HTMLElement | null {
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  return candidates
    .map((el) => ({ el, score: distance(center(el), { x: cx, y: cy }) }))
    .sort((a, b) => a.score - b.score)[0]?.el ?? null
}

function nearestInDirection(
  current: HTMLElement,
  candidates: HTMLElement[],
  direction: Direction
): HTMLElement | null {
  const from = center(current)
  const scored = candidates
    .filter((el) => el !== current)
    .map((el) => {
      const to = center(el)
      const dx = to.x - from.x
      const dy = to.y - from.y
      const primary =
        direction === 'left'
          ? -dx
          : direction === 'right'
            ? dx
            : direction === 'up'
              ? -dy
              : dy
      if (primary <= 8) return null
      const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx)
      return { el, score: primary + secondary * 2.2 }
    })
    .filter((x): x is { el: HTMLElement; score: number } => !!x)
    .sort((a, b) => a.score - b.score)

  return scored[0]?.el ?? null
}

function center(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function scrollFocusedShelf(direction: -1 | 1): void {
  const active = document.activeElement as HTMLElement | null
  const shelf = active?.closest<HTMLElement>('.shelf')
  if (!shelf) {
    window.scrollBy({ top: direction * window.innerHeight * 0.72, behavior: 'smooth' })
    return
  }
  shelf.scrollBy({ left: direction * shelf.clientWidth * 0.8, behavior: 'smooth' })
}

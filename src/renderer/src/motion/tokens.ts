/**
 * Central motion tokens.
 *
 * Picked once, used everywhere — so the whole product moves with the same
 * cinematic vocabulary instead of every motion.div improvising its own
 * easing+duration. Tweak here, the rest of the app inherits.
 *
 * Easings are bezier control points so we can hand-tune feel without
 * pulling in another lib's named curves.
 *
 * Naming:
 *   page   — full-route transitions (Home ↔ Library)
 *   micro  — buttons, toggles, hover feedback (≤200ms)
 *   hero   — large hero panels, splash logo, dramatic reveals
 *   sidebar— sidebar/drawer width morphs
 *   spring — physical bounce for shared-element layout transitions
 */
import type { Transition, Variants } from 'framer-motion'

export const easings = {
  outQuint: [0.22, 1, 0.36, 1] as [number, number, number, number],
  outExpo: [0.16, 1, 0.3, 1] as [number, number, number, number],
  standard: [0.4, 0, 0.2, 1] as [number, number, number, number],
  emphasized: [0.2, 0.7, 0.2, 1] as [number, number, number, number]
}

export const M: Record<'page' | 'micro' | 'hero' | 'sidebar', Transition> = {
  page: { duration: 0.32, ease: easings.outQuint },
  micro: { duration: 0.16, ease: easings.standard },
  hero: { duration: 0.55, ease: easings.outExpo },
  sidebar: { duration: 0.22, ease: easings.emphasized }
}

/** Layout-id shared-element transitions get a gentle spring instead of a curve. */
export const layoutSpring: Transition = {
  type: 'spring',
  stiffness: 360,
  damping: 32,
  mass: 0.9
}

/** Standard page-enter/exit variants, used by every <RouteTransition>. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0, transition: M.page },
  exit: { opacity: 0, y: -4, filter: 'blur(2px)', transition: { duration: 0.18, ease: easings.standard } }
}

/**
 * Variants for pages that own a shared-element (layoutId) hero — currently
 * GameDetail. The page itself must NOT translate on enter/exit, because any
 * y/scale would fight the spring interpolating the shared cover from the
 * card's position. So this is pure opacity, slightly slower than micro
 * to mask the cover's spring landing.
 */
export const sharedElementVariants: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: { duration: 0.24, ease: easings.outQuint } },
  exit: { opacity: 0, transition: { duration: 0.16, ease: easings.standard } }
}

/**
 * Variants for settings-style pages — quick fade, no y, since the sub-nav
 * scroll-spy handles vertical motion within the page itself.
 */
export const settingsVariants: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: { duration: 0.22, ease: easings.standard } },
  exit: { opacity: 0, transition: { duration: 0.14, ease: easings.standard } }
}

/**
 * Honor prefers-reduced-motion. Call once at boot — installs a media-query
 * listener so the runtime flip also takes effect if the user toggles their
 * OS setting while GameHub is open (rare but proper).
 *
 * Strategy: when reduce is requested, mutate the exported token objects in
 * place. We can't replace the export bindings (they're already imported by
 * dozens of files), but mutating works because every consumer reads the
 * `.duration` / `.ease` keys at render time, not import time.
 */
const FLAT_TRANSITION: Transition = { duration: 0.08, ease: 'linear' }
// Saved on first call so toggle-back can restore them — module-level closure
// avoids a separate state store for one flag.
let originalTokens: typeof M | null = null
let originalPage: Variants | null = null
let originalShared: Variants | null = null
let originalSettings: Variants | null = null

function applyReducedMotion(): void {
  if (!originalTokens) {
    originalTokens = { ...M }
    originalPage = { ...pageVariants }
    originalShared = { ...sharedElementVariants }
    originalSettings = { ...settingsVariants }
  }
  for (const key of Object.keys(M) as Array<keyof typeof M>) {
    M[key] = FLAT_TRANSITION
  }
  pageVariants.initial = { opacity: 0 }
  pageVariants.enter = { opacity: 1, transition: FLAT_TRANSITION }
  pageVariants.exit = { opacity: 0, transition: FLAT_TRANSITION }
  sharedElementVariants.initial = { opacity: 0 }
  sharedElementVariants.enter = { opacity: 1, transition: FLAT_TRANSITION }
  sharedElementVariants.exit = { opacity: 0, transition: FLAT_TRANSITION }
  settingsVariants.initial = { opacity: 0 }
  settingsVariants.enter = { opacity: 1, transition: FLAT_TRANSITION }
  settingsVariants.exit = { opacity: 0, transition: FLAT_TRANSITION }
}

function restoreFullMotion(): void {
  if (!originalTokens || !originalPage || !originalShared || !originalSettings) return
  for (const key of Object.keys(originalTokens) as Array<keyof typeof M>) {
    M[key] = originalTokens[key]
  }
  Object.assign(pageVariants, originalPage)
  Object.assign(sharedElementVariants, originalShared)
  Object.assign(settingsVariants, originalSettings)
}

export function applyReducedMotionIfRequested(): void {
  if (typeof window === 'undefined' || !window.matchMedia) return
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (mq.matches) applyReducedMotion()
  // Listen for OS-level toggle while the app is open.
  mq.addEventListener('change', (e) => {
    if (e.matches) applyReducedMotion()
    else restoreFullMotion()
  })
}

/**
 * Manual override — called by App when the user picks `reducedMotionMode`
 * in Settings. Mode 'always' forces flat tokens regardless of OS; 'never'
 * restores full tokens; 'system' defers to the matchMedia state set by
 * `applyReducedMotionIfRequested`.
 */
export function setReducedMotionMode(mode: 'system' | 'always' | 'never'): void {
  if (mode === 'always') {
    applyReducedMotion()
    return
  }
  if (mode === 'never') {
    restoreFullMotion()
    return
  }
  // 'system' — re-evaluate matchMedia immediately.
  if (typeof window === 'undefined' || !window.matchMedia) return
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (mq.matches) applyReducedMotion()
  else restoreFullMotion()
}

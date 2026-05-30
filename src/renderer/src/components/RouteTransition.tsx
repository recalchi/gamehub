import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { M } from '../motion/tokens'

/**
 * Per-route mount animation.
 *
 * Earlier this component tried to play exit/enter through AnimatePresence,
 * which broke layout when wrapped around react-router's <Routes> (non-motion
 * direct child made mode="popLayout" leave exiting pages stacked in the DOM
 * — visible as the "black gap at top of every page" bug — and mode="wait"
 * left blank pages after navigation in some cases).
 *
 * Now it only plays a one-shot fade-up on mount. No exit animation, no
 * coordination with siblings — each page renders independently. Trade-off:
 * cross-page transitions are instant, but layout is bulletproof.
 *
 * Reduced-motion users see no animation at all (returns the children plain).
 */
export default function RouteTransition({
  children,
  className,
  // Kept for API compatibility — variant override no longer used.
  variant: _variant
}: {
  children: ReactNode
  variant?: 'page' | 'settings'
  className?: string
}): JSX.Element {
  const reduceMotion = useReducedMotion()
  const cls = className ?? 'h-full'

  if (reduceMotion) {
    return <div className={cls}>{children}</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: M.page }}
      className={cls}
    >
      {children}
    </motion.div>
  )
}

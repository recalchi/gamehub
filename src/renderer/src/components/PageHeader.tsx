import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { M } from '../motion/tokens'

/**
 * Standard page header used at the top of every settled route.
 *
 * Single source of truth for: title typography, subtitle voice, icon size,
 * trailing actions row. Pages used to roll their own <h1>+<p>+button — every
 * page had subtly different spacing, weight, and icon sizes. This unifies it
 * so the eye stops re-evaluating hierarchy on each route change.
 */
export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  accent = true,
  actions,
  rightSlot
}: {
  title: string
  subtitle?: string
  icon?: LucideIcon
  /** Tint the icon with `text-accent`. Default true. */
  accent?: boolean
  /** Buttons / chips that sit on the right of the title row. */
  actions?: ReactNode
  /** Content rendered below the subtitle (e.g. tabs, filter pills). */
  rightSlot?: ReactNode
}): JSX.Element {
  return (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={M.page}
      className="mb-8"
    >
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-3xl font-display font-bold flex items-center gap-3 leading-none">
            {Icon && <Icon className={`w-8 h-8 ${accent ? 'text-accent' : 'text-slate-300'}`} />}
            <span className="truncate">{title}</span>
          </h1>
          {subtitle && (
            <p className="text-slate-400 mt-2 max-w-2xl leading-relaxed">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {rightSlot && <div className="mt-5">{rightSlot}</div>}
    </motion.header>
  )
}

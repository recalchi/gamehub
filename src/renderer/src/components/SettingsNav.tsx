import { useEffect, useState } from 'react'
import { motion, LayoutGroup } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { layoutSpring, M } from '../motion/tokens'

export interface SettingsSection {
  id: string
  label: string
  icon: LucideIcon
}

/**
 * Side navigation rail for the Settings page — Apple-Preferences style.
 *
 * Sections are real `<section id="…">` blocks on the main column; this nav
 * just scrolls + visually tracks the active one via IntersectionObserver.
 *
 * No router changes needed (cheaper than sub-routes for the same UX win):
 * URL hash updates as the user scrolls or clicks, deep-links work out of
 * the box (`/settings#integrations`), and the 970-line Settings.tsx stays
 * intact — we wrap it instead of cutting it.
 */
export default function SettingsNav({ sections }: { sections: SettingsSection[] }): JSX.Element {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '')

  // Track which section the user is reading via IntersectionObserver.
  // We bias the trigger zone to the top-third of the viewport so a section's
  // "active" state matches what feels like the header on screen.
  useEffect(() => {
    const observed = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el)
    if (observed.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        setActiveId(visible[0].target.id)
      },
      { rootMargin: '-15% 0px -65% 0px', threshold: 0 }
    )
    observed.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [sections])

  // Honor hash on first mount — supports /settings#integrations deep links.
  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (hash && sections.some((s) => s.id === hash)) {
      setTimeout(() => scrollToSection(hash), 60)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <nav className="sticky top-12 self-start w-56 shrink-0">
      <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-3 px-3">Seções</p>
      <LayoutGroup id="settings-nav-rail">
        <ul className="space-y-0.5">
          {sections.map((s) => {
            const Icon = s.icon
            const active = activeId === s.id
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    scrollToSection(s.id)
                    setActiveId(s.id)
                    history.replaceState(null, '', `#${s.id}`)
                  }}
                  className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                    active ? 'text-accent' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="settings-rail"
                      transition={layoutSpring}
                      className="absolute inset-0 rounded-md bg-accent/15 border border-accent/30"
                    />
                  )}
                  <motion.span className="relative z-10 flex items-center gap-2.5" transition={M.micro}>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{s.label}</span>
                  </motion.span>
                </button>
              </li>
            )
          })}
        </ul>
      </LayoutGroup>
    </nav>
  )
}

function scrollToSection(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

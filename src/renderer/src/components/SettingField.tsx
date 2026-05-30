import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { M } from '../motion/tokens'

/**
 * Reusable Settings primitives — Toggle, NumberField, TextField, Section.
 *
 * Why: Settings.tsx grew ~970L because every section reinvented the same
 * "label + control + description" rows. These primitives centralize the
 * visual contract so future settings sections are one-liners with consistent
 * spacing, focus rings, and animation tokens.
 *
 * Naming is intentional: `SettingField.Toggle`, `SettingField.Number`, etc.
 * keeps imports tidy at the call site.
 */

function FieldShell({
  label,
  description,
  control
}: {
  label: ReactNode
  description?: ReactNode
  control: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-100 font-medium">{label}</div>
        {description && (
          <div className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">{description}</div>
        )}
      </div>
      <div className="shrink-0 flex items-center">{control}</div>
    </div>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled
}: {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <FieldShell
      label={label}
      description={description}
      control={
        <button
          type="button"
          disabled={disabled}
          data-ui-sound="toggle"
          onClick={() => onChange(!checked)}
          className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
            checked ? 'bg-accent' : 'bg-white/10'
          }`}
          aria-pressed={checked}
          aria-label={typeof label === 'string' ? label : undefined}
        >
          <motion.span
            animate={{ x: checked ? 22 : 2 }}
            transition={M.micro}
            className="absolute top-0.5 block w-5 h-5 rounded-full bg-white shadow-md"
          />
        </button>
      }
    />
  )
}

function NumberField({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix
}: {
  label: ReactNode
  description?: ReactNode
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}): JSX.Element {
  return (
    <FieldShell
      label={label}
      description={description}
      control={
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              const n = Number(e.currentTarget.value)
              if (Number.isFinite(n)) onChange(n)
            }}
            className="w-24 bg-ink-800 border border-white/10 rounded-md px-2.5 py-1.5 text-sm font-mono text-right text-slate-100 focus:border-accent focus:outline-none"
          />
          {suffix && <span className="text-xs text-slate-500 font-mono">{suffix}</span>}
        </div>
      }
    />
  )
}

function TextField({
  label,
  description,
  value,
  onChange,
  onBlur,
  placeholder,
  secret = false
}: {
  label: ReactNode
  description?: ReactNode
  value: string
  onChange: (next: string) => void
  onBlur?: () => void
  placeholder?: string
  secret?: boolean
}): JSX.Element {
  return (
    <FieldShell
      label={label}
      description={description}
      control={
        <input
          type={secret ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className="w-64 bg-ink-800 border border-white/10 rounded-md px-3 py-1.5 text-sm font-mono text-slate-100 focus:border-accent focus:outline-none"
        />
      }
    />
  )
}

function Section({
  title,
  description,
  children,
  id
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  id?: string
}): JSX.Element {
  return (
    <section id={id} className="glass rounded-2xl p-6 mb-6 scroll-mt-20">
      <h2 className="font-display font-semibold text-lg">{title}</h2>
      {description && <p className="text-slate-400 text-xs mt-1 mb-3">{description}</p>}
      <div className="divide-y divide-white/5">{children}</div>
    </section>
  )
}

function Group({ children }: { children: ReactNode }): JSX.Element {
  return <div className="divide-y divide-white/5">{children}</div>
}

const SettingField = {
  Toggle,
  Number: NumberField,
  Text: TextField,
  Section,
  Group
}

export default SettingField

import { useLibraryStore } from '../store/library'
import {
  SETTINGS_SCHEMA,
  getSettingValue,
  buildSettingPatch,
  type SettingDef,
  type SettingPath
} from '../settings/schema'
import SettingField from './SettingField'
import type { AppSettings } from '@shared/types'

/**
 * Schema-driven settings field.
 *
 * `<SettingsField name="appearance.showRealBootLogs" />` looks up the def
 * in SETTINGS_SCHEMA, reads the current value from Zustand, picks the
 * right widget (Toggle/Number/Text/Select), and wires onChange back into
 * `saveSettings` automatically.
 *
 * Call sites become one-liners. No more "label + checked + onChange that
 * spreads ...settings.appearance into a new object" repeated 30 times.
 */
export default function SettingsField({ name }: { name: SettingPath }): JSX.Element | null {
  const settings = useLibraryStore((s) => s.settings)
  const saveSettings = useLibraryStore((s) => s.saveSettings)
  // Cast to the union — `as const satisfies` narrowed each entry's literals
  // so the union members lose access to optional fields like `description`.
  const def = SETTINGS_SCHEMA[name] as SettingDef
  if (!settings || !def) return null

  const raw = getSettingValue(settings, name as string)
  const value = raw ?? def.default

  function commit(next: unknown): void {
    const patch = buildSettingPatch(name as string, next)
    // For nested keys, merge with existing siblings — settingsStore deep-merges
    // at the top level but not deeper. We pre-merge the immediate parent.
    const keys = (name as string).split('.')
    if (keys.length > 1) {
      const parentKey = keys[0]
      const parentExisting = (settings as unknown as Record<string, unknown>)[parentKey]
      const parentPatch = (patch as Record<string, unknown>)[parentKey]
      void saveSettings({
        [parentKey]: { ...(parentExisting as object), ...(parentPatch as object) }
      } as Partial<AppSettings>)
    } else {
      void saveSettings(patch)
    }
  }

  switch (def.type) {
    case 'bool':
      return (
        <SettingField.Toggle
          label={def.label}
          description={def.description}
          checked={Boolean(value)}
          onChange={(v) => commit(v)}
        />
      )
    case 'number':
      return (
        <SettingField.Number
          label={def.label}
          description={def.description}
          value={Number(value)}
          onChange={(v) => commit(v)}
          min={def.min}
          max={def.max}
          step={def.step}
          suffix={def.suffix}
        />
      )
    case 'range':
      return (
        <div className="flex items-start justify-between gap-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-100 font-medium">{def.label}</div>
            {def.description && (
              <div className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">{def.description}</div>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2 w-48">
            <input
              type="range"
              min={def.min}
              max={def.max}
              step={def.step}
              value={Number(value)}
              onChange={(e) => commit(Number(e.currentTarget.value))}
              className="flex-1 accent-accent"
            />
            <span className="text-xs text-slate-400 font-mono w-12 text-right">
              {Number(value).toFixed(def.step && def.step < 1 ? 2 : 0)}
              {def.suffix ?? ''}
            </span>
          </div>
        </div>
      )
    case 'text':
    case 'secret':
      return (
        <SettingField.Text
          label={def.label}
          description={def.description}
          value={String(value)}
          onChange={(v) => commit(v)}
          placeholder={def.placeholder}
          secret={def.type === 'secret'}
        />
      )
    case 'select':
      return (
        <div className="flex items-start justify-between gap-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-100 font-medium">{def.label}</div>
            {def.description && (
              <div className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">{def.description}</div>
            )}
          </div>
          <div className="shrink-0 inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
            {def.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => commit(opt.value)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  value === opt.value
                    ? 'bg-accent/20 text-accent'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )
  }
}

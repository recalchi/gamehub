/**
 * Settings schema — single source of truth for every user-facing preference.
 *
 * Used by `<SettingsField name="...">` to render the right widget without
 * the call site duplicating label/description/default/range. Also enables
 * future features:
 *   - Export/import config sanitisation (only write paths in this schema)
 *   - Command Palette enumeration ("toggle skip splash", "set volume to 0.6")
 *   - i18n: one place to translate labels instead of grep-replacing
 *
 * Path syntax: dot-separated keys into AppSettings. e.g.
 *   `appearance.showRealBootLogs`
 *   `sounds.volume`
 *   `discord.enabled`
 */
import type { AppSettings } from '@shared/types'

export type SettingType = 'bool' | 'number' | 'range' | 'text' | 'secret' | 'select'

export interface BaseDef<T> {
  label: string
  description?: string
  default: T
}

export interface BoolDef extends BaseDef<boolean> {
  type: 'bool'
}
export interface NumberDef extends BaseDef<number> {
  type: 'number' | 'range'
  min?: number
  max?: number
  step?: number
  suffix?: string
}
export interface TextDef extends BaseDef<string> {
  type: 'text' | 'secret'
  placeholder?: string
}
export interface SelectDef<V extends string = string> extends BaseDef<V> {
  type: 'select'
  options: Array<{ value: V; label: string }>
}

export type SettingDef = BoolDef | NumberDef | TextDef | SelectDef

/**
 * Flat dot-path → SettingDef map. New settings just get added here; the UI
 * picks them up automatically through `<SettingsField name="...">`.
 */
export const SETTINGS_SCHEMA = {
  // General
  'skipSplash': {
    type: 'bool',
    label: 'Pular splash após primeira execução',
    description: 'Vai direto pra Home depois da primeira vez.',
    default: false
  },
  'fullscreenOnStart': {
    type: 'bool',
    label: 'Abrir em tela cheia',
    description: 'GameHub inicia maximizado ocupando todo o monitor.',
    default: false
  },

  // Appearance
  'appearance.dynamicGameBackgrounds': {
    type: 'bool',
    label: 'Fundos dinâmicos por jogo',
    description: 'Usa a cor da capa do jogo focado como backdrop da página.',
    default: true
  },
  'appearance.showRealBootLogs': {
    type: 'bool',
    label: 'Splash mostra logs reais do processo principal',
    description: 'Troca as linhas de boot decorativas pelos eventos vindos do main.',
    default: false
  },
  'appearance.reducedMotionMode': {
    type: 'select',
    label: 'Animações',
    description:
      'Sistema = segue OS prefers-reduced-motion. Completas = força animações. Reduzir = sempre minimal.',
    default: 'system',
    options: [
      { value: 'system', label: 'Sistema' },
      { value: 'never', label: 'Completas' },
      { value: 'always', label: 'Reduzir' }
    ]
  },

  // Sounds
  'sounds.enabled': {
    type: 'bool',
    label: 'Sons da interface',
    description: 'Liga/desliga todos os efeitos sonoros gerados pela UI.',
    default: true
  },
  'sounds.volume': {
    type: 'range',
    label: 'Volume dos efeitos',
    min: 0,
    max: 1,
    step: 0.02,
    default: 0.42
  },
  'sounds.navigation': {
    type: 'bool',
    label: 'Navegação e foco',
    description: 'Tick curto ao mover entre cards/menus.',
    default: true
  },
  'sounds.confirm': {
    type: 'bool',
    label: 'Confirmar e clicar',
    description: 'Sound rising fourth quando aciona algo.',
    default: true
  },
  'sounds.back': {
    type: 'bool',
    label: 'Voltar e cancelar',
    description: 'Sound descending third ao sair de telas.',
    default: true
  },
  'sounds.toggle': {
    type: 'bool',
    label: 'Alternâncias e seletores',
    description: 'Click + pulse curto em switches/dropdowns.',
    default: true
  },
  'sounds.launch': {
    type: 'bool',
    label: 'Som ao iniciar jogo',
    description: 'Whoosh + sub-bass quando emulador abre.',
    default: true
  },

  // Performance monitor
  'performance.enabled': {
    type: 'bool',
    label: 'Monitorar jogos em execução',
    description: 'Coleta CPU/RAM enquanto o jogo roda.',
    default: false
  },
  'performance.showOnGameDetail': {
    type: 'bool',
    label: 'Mostrar painel na página do jogo',
    default: true
  },
  'performance.sampleIntervalMs': {
    type: 'number',
    label: 'Intervalo de leitura',
    min: 1000,
    max: 10000,
    step: 500,
    suffix: 'ms',
    default: 2000
  },
  'performance.warnCpuPercent': {
    type: 'number',
    label: 'Alerta de CPU',
    min: 20,
    max: 100,
    step: 5,
    suffix: '%',
    default: 85
  },
  'performance.historySeconds': {
    type: 'number',
    label: 'Histórico ao vivo',
    description: 'Janela do gráfico em tempo real.',
    min: 30,
    max: 900,
    step: 30,
    suffix: 's',
    default: 180
  },
  'performance.warnMemoryMb': {
    type: 'number',
    label: 'Alerta de RAM',
    min: 512,
    max: 32768,
    step: 256,
    suffix: 'MB',
    default: 4096
  },

  // Discord
  'discord.enabled': {
    type: 'bool',
    label: 'Discord Rich Presence',
    description: 'Publica "Jogando X" no seu Discord via named pipe local.',
    default: true
  },
  'discord.clientId': {
    type: 'secret',
    label: 'Discord Application Client ID',
    description: 'Crie em discord.com/developers/applications.',
    placeholder: '123456789012345678',
    default: ''
  },
  'discord.showPlatform': {
    type: 'bool',
    label: 'Mostrar plataforma na presença',
    description: 'Inclui "no PlayStation 2" etc. na linha de status.',
    default: true
  },

  // SteamGridDB
  'steamGridDb.enabled': {
    type: 'bool',
    label: 'SteamGridDB como fallback de capas',
    default: false
  },
  'steamGridDb.apiKey': {
    type: 'secret',
    label: 'SteamGridDB API key',
    default: ''
  }
} as const satisfies Record<string, SettingDef>

export type SettingPath = keyof typeof SETTINGS_SCHEMA

/** Walk a dot-path into AppSettings to read its value. */
export function getSettingValue(settings: AppSettings, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, settings)
}

/**
 * Return a partial-AppSettings patch that sets `path` to `value`. Used by
 * `<SettingsField>` to feed the existing `saveSettings(patch)` API instead
 * of forcing a brand new mutation pipeline.
 */
export function buildSettingPatch(path: string, value: unknown): Partial<AppSettings> {
  const keys = path.split('.')
  if (keys.length === 1) {
    return { [keys[0]]: value } as Partial<AppSettings>
  }
  // Multi-level: rebuild the path. Outer object replaced entirely; existing
  // siblings are spread back in by the caller (settingsStore deep-merges).
  const out: Record<string, unknown> = {}
  let cursor: Record<string, unknown> = out
  for (let i = 0; i < keys.length - 1; i++) {
    cursor[keys[i]] = {}
    cursor = cursor[keys[i]] as Record<string, unknown>
  }
  cursor[keys[keys.length - 1]] = value
  return out as Partial<AppSettings>
}

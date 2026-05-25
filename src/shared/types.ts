/**
 * Shared types used by main, preload and renderer.
 * Keep this file free of runtime imports so it can be consumed from any side.
 */

export type PlatformId =
  | 'nes'
  | 'snes'
  | 'n64'
  | 'gamecube'
  | 'wii'
  | 'gb'
  | 'gbc'
  | 'gba'
  | 'nds'
  | 'n3ds'
  | 'switch'
  | 'ps1'
  | 'ps2'
  | 'ps3'
  | 'psp'
  | 'xbox'
  | 'xbox360'
  | 'pc'
  | 'unknown'

export type EmulatorId =
  | 'retroarch'
  | 'epsxe'
  | 'duckstation'
  | 'psxfin'
  | 'pcsx2'
  | 'rpcs3'
  | 'dolphin'
  | 'ppsspp'
  | 'xemu'
  | 'mgba'
  | 'desmume'
  | 'citra'
  | 'ryujinx'
  | 'native'
  | 'unknown'

export type GameStatus =
  | 'ready'
  | 'installed'
  | 'not-downloaded'
  | 'corrupted'
  | 'missing-emulator'
  | 'missing-bios'
  | 'unknown'

export interface PlatformInfo {
  id: PlatformId
  name: string
  shortName: string
  manufacturer: 'Nintendo' | 'Sony' | 'Microsoft' | 'PC' | 'Other'
  /** primary file extensions, lowercase, no leading dot */
  extensions: string[]
  /** preferred emulator ids in fallback order */
  emulators: EmulatorId[]
  /** brand accent color, hex */
  color: string
  /** ISO year of original release, used for sorting */
  releaseYear: number
}

export interface Game {
  /** stable id derived from absolute path */
  id: string
  title: string
  /** absolute path on disk, the file/folder the launcher passes to the emulator */
  path: string
  platform: PlatformId
  emulator?: EmulatorId
  sizeBytes: number
  /** detection confidence 0..1 — low values surface as "suspicious" in UI */
  confidence: number
  status: GameStatus
  /** ISO timestamps */
  addedAt: string
  lastPlayedAt?: string
  /** seconds */
  playTime: number
  favorite: boolean
  /** local cover image path (file://...) or remote URL */
  cover?: string
  banner?: string
  description?: string
  genre?: string
  developer?: string
  year?: number
  /** notes the detector flagged (e.g. "multi-track cue", "compressed archive") */
  flags: string[]
  /** discovered companion files (e.g. .cue → all referenced .bin files) */
  relatedFiles: string[]
}

export interface DetectedEmulator {
  id: EmulatorId
  name: string
  /** absolute path to the executable */
  executable: string
  /** folder containing the executable */
  installPath: string
  version?: string
  platforms: PlatformId[]
  /** how it was found: 'auto' (filesystem scan), 'manual' (user-set) */
  source: 'auto' | 'manual'
}

export interface AppSettings {
  /** roots to scan for games */
  gameRoots: string[]
  /** roots to scan for emulators */
  emulatorRoots: string[]
  /** user overrides — emulatorId → absolute exe path */
  emulatorOverrides: Partial<Record<EmulatorId, string>>
  /** user overrides — platformId → emulatorId */
  platformEmulators: Partial<Record<PlatformId, EmulatorId>>
  fullscreenOnStart: boolean
  skipSplash: boolean
  /** primary accent color override */
  accentColor?: string
  /** locale */
  locale: 'pt-BR' | 'en-US'
  /** input preferences */
  input: InputSettings
}

export interface InputSettings {
  /** gamepad.id string of the preferred controller; empty = first detected */
  preferredGamepadId: string
  /** analog stick deadzone, 0..1 */
  deadzone: number
  /** invert vertical navigation (some users prefer "down stick = up nav") */
  invertY: boolean
  /** swap A/B confirm-back bindings (PS layout vs Xbox layout) */
  swapConfirmBack: boolean
}

export interface ScanProgress {
  phase: 'idle' | 'enumerating' | 'classifying' | 'enriching' | 'done'
  current?: string
  scanned: number
  found: number
  startedAt?: string
}

export interface ScanResult {
  games: Game[]
  emulators: DetectedEmulator[]
  durationMs: number
  errors: string[]
}

export interface LaunchResult {
  ok: boolean
  pid?: number
  command?: string
  error?: string
}

export interface DownloadProgress {
  id: string
  url: string
  title: string
  state: 'starting' | 'downloading' | 'finished' | 'failed' | 'cancelled'
  received: number
  total?: number
  speed: number
  error?: string
  filePath?: string
  gameId?: string
}

export interface LaunchFailedEvent {
  gameId: string
  gameTitle: string
  code: number | null
  seconds: number
  emulatorName: string
}

export interface ActiveLaunch {
  gameId: string
  gameTitle: string
  emulatorName: string
  pid?: number
  startedAt: string
}

export interface LogEntry {
  ts: string
  level: 'debug' | 'info' | 'warn' | 'error'
  scope: string
  message: string
  data?: unknown
}

export interface AppInfo {
  version: string
  versions: { electron: string; chrome: string; node: string; v8: string }
  paths: { userData: string; library: string; logs: string; covers: string; saves: string }
  stats: {
    games: number
    emulators: number
    readyGames: number
    coversCached: number
    saveSnapshots: number
  }
}

export interface UpdateInfo {
  current: string
  latest?: string
  newer: boolean
  releaseUrl?: string
  notes?: string
  error?: string
}

export interface BiosCheck {
  required: boolean
  found: boolean
  matchedPath?: string
  searchLocation?: string
  expected: string[]
  triedLocations: string[]
}

export interface SaveSnapshot {
  /** stamp used as folder name (also stable id) */
  id: string
  /** ISO timestamp the snapshot was taken */
  createdAt: string
  sizeBytes: number
  fileCount: number
  /** the source folder this captured */
  sourcePath: string
}

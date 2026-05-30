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
  | 'ps4'
  | 'psp'
  | 'xbox'
  | 'xbox360'
  | 'pc'
  | 'unknown'

export type EmulatorId =
  | 'retroarch'
  | 'mesen'
  | 'epsxe'
  | 'duckstation'
  | 'psxfin'
  | 'pcsx2'
  | 'rpcs3'
  | 'dolphin'
  | 'ppsspp'
  | 'xemu'
  | 'xenia'
  | 'shadps4'
  | 'fpps4'
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
  /** user-defined labels for organization (e.g. "multiplayer", "speedrun") */
  tags?: string[]
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
  /**
   * How GameHub picks an emulator for each game.
   *  - 'auto' (default): scanner picks the best one per PLATFORMS order, and
   *    the launcher silently falls back to the next available emulator when
   *    the chosen one crashes inside FAILURE_THRESHOLD_SECONDS. Successful
   *    fallbacks are persisted as the new per-platform default.
   *  - 'manual': honour the per-game/per-platform choice strictly. No silent
   *    fallback, no auto-relearn. A failed launch surfaces the error as-is.
   */
  emulatorSelection: 'auto' | 'manual'
  fullscreenOnStart: boolean
  skipSplash: boolean
  /** primary accent color override */
  accentColor?: string
  /** visual/background preferences */
  appearance: AppearanceSettings
  /** runtime performance monitor preferences */
  performance: PerformanceMonitorSettings
  /** Discord Rich Presence preferences */
  discord: DiscordPresenceSettings
  /** SteamGridDB cover provider preferences */
  steamGridDb?: SteamGridDbSettings
  /** How GameHub opens games/emulators. */
  launch: GameLaunchSettings
  /** Console-style interface sound preferences. */
  sounds: UiSoundSettings
  /** Downloadable mod catalog preferences. */
  mods: ModCatalogSettings
  /** Epic Games integration preferences. */
  epic: EpicGamesSettings
  /** Local cinema/media mode preferences. */
  media: MediaSettings
  /** locale */
  locale: 'pt-BR' | 'en-US'
  /** input preferences */
  input: InputSettings
  /** set to true once the user has dismissed the onboarding tour */
  hasSeenOnboarding?: boolean
}

export interface AppearanceSettings {
  /** Use the focused game's cover/color as the page backdrop. Off = app accent palette. */
  dynamicGameBackgrounds: boolean
  /** How strongly cover art and platform color influence dynamic backdrops. */
  gameBackgroundPreset: GameBackgroundPreset
  /** Keep the sidebar expanded instead of opening in compact mode. */
  sidebarPinned: boolean
  /** Replace the splash's canned BOOT_LINES with live main-process log events. */
  showRealBootLogs?: boolean
  /**
   * Force "reduced motion" regardless of OS-level prefers-reduced-motion.
   * Lets users opt into calmer animations without finding the Windows /
   * macOS toggle. 'always' = always reduce; 'never' = always full motion;
   * 'system' (default) = follow the OS media query.
   */
  reducedMotionMode?: 'system' | 'always' | 'never'
}

export type GameBackgroundPreset = 'soft' | 'cinema' | 'vibrant'

export interface PerformanceMonitorSettings {
  /** Collect process CPU/RAM samples while a game is running. */
  enabled: boolean
  /** Show the live panel on each game detail page. */
  showOnGameDetail: boolean
  /** Milliseconds between samples. */
  sampleIntervalMs: number
  /** CPU percentage that should be considered high for diagnostics. */
  warnCpuPercent: number
  /** Process working-set MB that should be considered high for diagnostics. */
  warnMemoryMb: number
  /** Keep a short in-memory rolling history for charts/summaries. */
  historySeconds: number
}

export type CrashCategory =
  | 'assertion'
  | 'segfault'
  | 'vulkan-oom'
  | 'vulkan-error'
  | 'memory'
  | 'shader'
  | 'filesystem'
  | 'user-quit'
  | 'unknown'

export interface CrashReport {
  ts: string
  gameId: string
  gameTitle: string
  emulatorId: string
  emulatorName: string
  exitCode: number | null
  uptimeSeconds: number
  signature: string
  category: CrashCategory
  logPath: string
}

export interface CrashStats {
  total: number
  byCategory: Partial<Record<CrashCategory, number>>
  lastTs?: string
  longestSession: number
  shortestSession: number
}

export interface PerformanceSample {
  gameId: string
  gameTitle: string
  emulatorName: string
  pid?: number
  processName?: string
  sampledAt: string
  elapsedSeconds: number
  cpuPercent?: number
  memoryMb?: number
  privateMemoryMb?: number
  systemMemoryUsedPercent?: number
  /** GPU 3D engine load 0..100, from Windows performance counters. */
  gpuPercent?: number
  /** Dedicated VRAM used by this process in MB. */
  gpuMemoryMb?: number
  /** Best-effort framerate estimate. Some emulators expose it via their
   *  window title; for others we leave it undefined. */
  fps?: number
  responding?: boolean
  status: 'running' | 'unavailable' | 'ended'
  note?: string
}

export interface PerformanceReport {
  gameId: string
  gameTitle: string
  emulatorName: string
  pid?: number
  startedAt: string
  endedAt: string
  durationSeconds: number
  sampleCount: number
  averages: {
    cpuPercent?: number
    memoryMb?: number
    systemMemoryUsedPercent?: number
  }
  peaks: {
    cpuPercent?: number
    memoryMb?: number
    systemMemoryUsedPercent?: number
  }
  diagnostics: string[]
  suggestions: string[]
  health: 'good' | 'attention' | 'unknown'
}

export interface SteamGridDbSettings {
  /** SteamGridDB API key (Bearer token). Empty = integration off. */
  apiKey: string
  /** Use SteamGridDB as a fallback when libretro misses, for any platform. */
  enabled: boolean
}

export interface DiscordPresenceSettings {
  /** Publish "Playing <game>" to the local Discord client while games run. */
  enabled: boolean
  /** Discord Developer Portal Application ID used by Rich Presence. */
  clientId: string
  /** Include platform/emulator text in the presence state line. */
  showPlatform: boolean
}

export interface DiscordRpcStatus {
  enabled: boolean
  configured: boolean
  connected: boolean
  pipeFound: boolean
  clientId?: string
  lastActivity: string | null
  lastError: string | null
  lastHandshake: 'ok' | 'invalid-client-id' | 'discord-not-running' | 'disabled' | 'unknown'
}

export type AchievementProvider = 'steam-local' | 'retroachievements' | 'none'

export type AchievementSourceStatus =
  | 'ready'
  | 'not-cached'
  | 'needs-configuration'
  | 'unsupported'
  | 'error'

export interface AchievementDefinition {
  id: string
  apiName: string
  title: string
  description?: string
  icon?: string
  iconGray?: string
  hidden?: boolean
  unlocked?: boolean
}

export interface GameAchievementSummary {
  gameId: string
  gameTitle: string
  platform: PlatformId
  cover?: string
  provider: AchievementProvider
  status: AchievementSourceStatus
  total: number
  unlocked?: number
  sourceLabel: string
  sourceDetail: string
  sourceUrl?: string
  updatedAt: string
}

export interface GameAchievementDetail {
  summary: GameAchievementSummary
  achievements: AchievementDefinition[]
}

export interface GameLaunchSettings {
  /** High-level preset shown in Settings. */
  preset: GameLaunchPreset
  /** Add fullscreen flags for emulators that support command-line fullscreen. */
  fullscreenGames: boolean
  /** Minimize GameHub after a game starts. Off keeps the performance panel visible on monitor 2. */
  minimizeGameHubOnLaunch: boolean
  /** Restore the GameHub window when the last active game closes. */
  restoreGameHubAfterExit: boolean
  /** Which monitor should GameHub move to before opening a game. */
  gameHubDisplay: DisplayTarget
  /** Which monitor GameHub should try to place emulator/native windows on. */
  gameDisplay: DisplayTarget
  /** Try to move the external game/emulator window after spawn when we have a PID. */
  moveGameWindowAfterLaunch: boolean
}

export type GameLaunchPreset = 'monitor' | 'console' | 'desktop'

export type DisplayTarget = 'current' | 'primary' | 'secondary' | 'display-1' | 'display-2' | 'display-3'

export interface DisplayInfo {
  id: number
  label: string
  index: number
  isPrimary: boolean
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor: number
}

export interface UiSoundSettings {
  /** Master switch for interface sounds. */
  enabled: boolean
  /** 0..1 master volume for all UI sounds. */
  volume: number
  /** Sound when focus moves across buttons/cards. */
  navigation: boolean
  /** Sound for normal activate/click actions. */
  confirm: boolean
  /** Sound for back/cancel actions. */
  back: boolean
  /** Sound for switches, sliders and option changes. */
  toggle: boolean
  /** Sound fired when GameHub starts a game. */
  launch: boolean
}

export interface ModCatalogSettings {
  /** Preferred Minecraft mod loader used when resolving Modrinth versions. */
  minecraftLoader: MinecraftModLoader
  /** Preferred Minecraft version; "auto" means newest compatible release. */
  minecraftVersion: string
  /** Where downloaded files should land by default. */
  installTarget: ModInstallTarget
  /** Optional custom staging root. Empty = GameHub managed userdata folder. */
  customInstallRoot: string
  /** Open destination folder after a mod download finishes. */
  openFolderAfterDownload: boolean
}

export interface EpicGamesSettings {
  /** Enable local Epic Games Launcher integration. */
  enabled: boolean
  /** Epic Developer Portal client id, stored only in local settings. */
  clientId: string
  /** Epic Developer Portal client secret, stored only in local settings. */
  clientSecret: string
}

export interface MediaSettings {
  /** Roots scanned by Cinema mode for movies and series. */
  mediaRoots: string[]
  /** Download target for free/public-domain cinema catalog entries. */
  downloadRoot: string
  /** Open local videos in the OS default player after selecting play. */
  openInExternalPlayer: boolean
  /** Cinema playback surface. External keeps Windows/default-player behavior. */
  playerMode: 'internal' | 'external'
  /** Show detected .srt/.vtt tracks in the internal Cinema player. */
  subtitlesEnabled: boolean
  /** Preferred subtitle language code. Empty = first detected/default track. */
  preferredSubtitleLanguage: string
  /** Subtitle text scale in the internal player. */
  subtitleFontScale: number
  /** Add a translucent background behind subtitles. */
  subtitleBackground: boolean
  /** External streaming providers shown inside Cinema mode. */
  streamingProviders: MediaStreamingProvider[]
}

export type MediaKind = 'movie' | 'series' | 'episode' | 'documentary'

export type MediaStreamingProviderId = 'prime-video'

export interface MediaStreamingProvider {
  id: MediaStreamingProviderId
  name: string
  enabled: boolean
  baseUrl: string
  searchUrl: string
  activationUrl: string
  openMode: 'browser'
}

export interface MediaSubtitle {
  id: string
  label: string
  language: string
  path: string
  format: 'srt' | 'vtt'
  isDefault?: boolean
}

export interface MediaItem {
  id: string
  title: string
  path: string
  kind: MediaKind
  sizeBytes: number
  addedAt: string
  lastWatchedAt?: string
  watchTime: number
  favorite: boolean
  cover?: string
  banner?: string
  description?: string
  year?: number
  genre?: string
  source: 'local' | 'internet-archive'
  sourceUrl?: string
  subtitles: MediaSubtitle[]
  relatedFiles: string[]
  tags?: string[]
}

export interface MediaLibraryFile {
  items: MediaItem[]
  updatedAt: string
}

export interface MediaWatchRecord {
  id: string
  mediaId: string
  title: string
  path?: string
  kind: MediaKind
  cover?: string
  banner?: string
  description?: string
  year?: number
  genre?: string
  source: MediaItem['source']
  sourceUrl?: string
  firstWatchedAt: string
  lastWatchedAt: string
  watchCount: number
  durationSeconds?: number
  lastPositionSeconds?: number
  progressPercent?: number
  completed: boolean
  archivedBecauseMissing?: boolean
}

export interface MediaWatchedFile {
  records: MediaWatchRecord[]
  updatedAt: string
}

export interface MediaWatchInput {
  itemId: string
  positionSeconds?: number
  durationSeconds?: number
  completed?: boolean
}

export interface MediaScanResult {
  items: MediaItem[]
  durationMs: number
  errors: string[]
}

export interface MediaCatalogEntry {
  id: string
  title: string
  year?: number
  description: string
  source: 'internet-archive'
  sourceUrl: string
  downloadUrl: string
  kind: MediaKind
  cover?: string
  banner?: string
  license: string
  runtimeMinutes?: number
  approxSizeMb?: number
  genre: string
}

export interface MediaDownloadProgress {
  id: string
  entryId: string
  title: string
  state: 'starting' | 'downloading' | 'finished' | 'failed' | 'cancelled'
  received: number
  total?: number
  speed: number
  error?: string
  filePath?: string
  item?: MediaItem
}

export type AutoSubtitleLanguage = 'pt-BR' | 'en'

export interface AutoSubtitleInput {
  itemId: string
  languages: AutoSubtitleLanguage[]
}

export interface AutoSubtitleResult {
  ok: boolean
  item?: MediaItem
  generated: MediaSubtitle[]
  errors: string[]
  tool?: string
  installHint?: string
}

export type MinecraftModLoader = 'fabric' | 'forge' | 'neoforge' | 'quilt'

export type ModInstallTarget = 'gamehub' | 'minecraft' | 'custom'

export type ModProjectType = 'mod' | 'shader' | 'modpack' | 'resourcepack'

export interface ModCatalogEntry {
  id: string
  title: string
  slug: string
  game: 'minecraft'
  gameTitle: string
  projectType: ModProjectType
  category: string
  rank: number
  description: string
  source: 'modrinth'
  sourceUrl: string
  iconUrl?: string
  downloads?: number
  followers?: number
  license?: string
  clientSide?: 'required' | 'optional' | 'unsupported' | 'unknown'
  serverSide?: 'required' | 'optional' | 'unsupported' | 'unknown'
  loaders: string[]
  gameVersions: string[]
  featured?: boolean
}

export interface ModInstallRecord {
  id: string
  entryId: string
  title: string
  slug: string
  game: 'minecraft'
  projectType: ModProjectType
  versionName: string
  versionNumber: string
  loader?: string
  gameVersion?: string
  fileName: string
  filePath: string
  sourceUrl: string
  installedAt: string
  installTarget: ModInstallTarget
}

export interface ModDownloadInput {
  entryId: string
  loader?: MinecraftModLoader
  gameVersion?: string
  installTarget?: ModInstallTarget
  customInstallRoot?: string
}

export interface ModDownloadProgress {
  id: string
  entryId: string
  title: string
  state: 'resolving' | 'downloading' | 'finished' | 'failed'
  received: number
  total?: number
  speed: number
  error?: string
  filePath?: string
  record?: ModInstallRecord
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

export interface NativeControllerDevice {
  name: string
  status: string
  pnpClass?: string
  manufacturer?: string
  service?: string
  pnpDeviceId: string
  busReportedDescription?: string
}

export interface XInputSlotStatus {
  slot: number
  connected: boolean
  resultCode: number
}

export interface ControllerCompanionApp {
  name: string
  version?: string
  publisher?: string
  installLocation?: string
}

export interface ControllerDiagnostics {
  platform: NodeJS.Platform
  scannedAt: string
  devices: NativeControllerDevice[]
  xinput: XInputSlotStatus[]
  companionApps: ControllerCompanionApp[]
  issues: string[]
  recommendations: string[]
  error?: string
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

export interface LaunchTerminateResult {
  ok: boolean
  gameId: string
  terminatedPids: number[]
  note?: string
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
  /** Last ~200 lines of merged stdout+stderr from the emulator process, if captured. */
  output?: string
  /** If set, the renderer should offer a one-click install button. */
  installOffer?: { emulatorId: EmulatorId; emulatorName: string }
}

export interface AutoInstallProgress {
  emulatorId: EmulatorId
  emulatorName: string
  state: 'downloading' | 'extracting' | 'registering' | 'done' | 'failed'
  received: number
  total?: number
  error?: string
}

export interface LaunchFallbackEvent {
  gameId: string
  gameTitle: string
  /** The emulator that just failed. */
  fromEmulator: string
  /** The emulator we're trying next. */
  toEmulator: string
}

export interface ActiveLaunch {
  gameId: string
  gameTitle: string
  emulatorName: string
  pid?: number
  /**
   * Lowercase basename of the emulator executable (e.g. `shadps4`, `rpcs3`).
   * Used by the performance monitor as a fallback PID-discovery: if the
   * tracked PID dies or the emulator spawns a child worker, we re-scan the
   * process table by name so we don't lose live metrics.
   */
  processName?: string
  /** Absolute executable path used for launch when available (safer terminate match). */
  executablePath?: string
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
  /** Current updater lifecycle step for UI/status banners. */
  phase?:
    | 'idle'
    | 'disabled'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'not-available'
    | 'installing'
    | 'error'
  /** release channel (stable default) */
  channel?: 'stable' | 'beta'
  /** timestamp for the last check attempt */
  checkedAt?: string
  /** filename currently being downloaded (when available) */
  fileName?: string
  /** 0..100 */
  percent?: number
  downloadedBytes?: number
  totalBytes?: number
  /** true when we already have an update on disk ready to install */
  canInstall?: boolean
  releaseUrl?: string
  notes?: string
  error?: string
}

export type HealthIssueKind =
  | 'missing-file'
  | 'unreadable-file'
  | 'orphan-cover'
  | 'orphan-banner'

export interface HealthIssue {
  kind: HealthIssueKind
  gameId?: string
  gameTitle?: string
  path: string
  message: string
}

export interface HealthReport {
  issues: HealthIssue[]
  orphanBytes: number
  durationMs: number
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

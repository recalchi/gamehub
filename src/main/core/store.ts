import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { PATHS } from './paths'
import { log } from './logger'
import type {
  AppSettings,
  DetectedEmulator,
  Game,
  GameJourneyFile,
  GameJourneyRecord,
  MediaItem,
  MediaLibraryFile,
  MediaWatchRecord,
  MediaWatchedFile
} from '@shared/types'

/**
 * MVP persistence: a single JSON file per concern.
 *
 * We deliberately avoid native deps for the MVP (no better-sqlite3, no sql.js).
 * The API surface is small enough that we can later swap implementations
 * without touching IPC handlers or the renderer.
 */

const DEFAULT_SETTINGS: AppSettings = {
  gameRoots: ['D:\\Jogos'],
  emulatorRoots: ['D:\\Jogos\\Emuladores'],
  emulatorOverrides: {},
  platformEmulators: {},
  emulatorSelection: 'auto',
  fullscreenOnStart: false,
  skipSplash: false,
  locale: 'pt-BR',
  appearance: {
    dynamicGameBackgrounds: true,
    gameBackgroundPreset: 'vibrant',
    sidebarPinned: false
  },
  performance: {
    enabled: true,
    showOnGameDetail: true,
    sampleIntervalMs: 2000,
    warnCpuPercent: 85,
    warnMemoryMb: 4096,
    historySeconds: 180
  },
  discord: {
    enabled: true,
    clientId: '',
    showPlatform: true
  },
  steamGridDb: {
    enabled: false,
    apiKey: ''
  },
  launch: {
    preset: 'monitor',
    fullscreenGames: true,
    minimizeGameHubOnLaunch: false,
    restoreGameHubAfterExit: true,
    gameHubDisplay: 'current',
    gameDisplay: 'secondary',
    moveGameWindowAfterLaunch: true
  },
  sounds: {
    enabled: true,
    volume: 0.42,
    navigation: true,
    confirm: true,
    back: true,
    toggle: true,
    launch: true
  },
  mods: {
    minecraftLoader: 'fabric',
    minecraftVersion: 'auto',
    installTarget: 'gamehub',
    customInstallRoot: '',
    openFolderAfterDownload: false
  },
  epic: {
    enabled: true,
    clientId: '',
    clientSecret: ''
  },
  media: {
    mediaRoots: ['E:\\Filmes e Séries'],
    downloadRoot: 'E:\\Filmes e Séries\\Livres',
    openInExternalPlayer: true,
    playerMode: 'internal',
    subtitlesEnabled: true,
    preferredSubtitleLanguage: 'pt-BR',
    subtitleFontScale: 1,
    subtitleBackground: true,
    streamingProviders: [
      {
        id: 'prime-video',
        name: 'Prime Video',
        enabled: true,
        baseUrl: 'https://www.primevideo.com/',
        searchUrl: 'https://www.primevideo.com/search/ref=atv_nb_sr?phrase={query}',
        activationUrl: 'https://www.primevideo.com/mytv',
        openMode: 'browser'
      }
    ]
  },
  input: {
    preferredGamepadId: '',
    deadzone: 0.5,
    invertY: false,
    swapConfirmBack: false
  }
}

interface LibraryFile {
  games: Game[]
  emulators: DetectedEmulator[]
  updatedAt: string
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as T
  } catch (err) {
    log.error('store', `failed to read ${path}, using fallback`, { err: String(err) })
    return fallback
  }
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
}

export const settingsStore = {
  load(): AppSettings {
    const loaded = readJson<Partial<AppSettings>>(PATHS.settingsFile, {})
    // Deep-merge so the `input` sub-object inherits new defaults when older
    // settings.json files lack a field that was added in a later version.
    return {
      ...DEFAULT_SETTINGS,
      ...loaded,
      appearance: { ...DEFAULT_SETTINGS.appearance, ...(loaded.appearance ?? {}) },
      performance: { ...DEFAULT_SETTINGS.performance, ...(loaded.performance ?? {}) },
      discord: { ...DEFAULT_SETTINGS.discord, ...(loaded.discord ?? {}) },
      steamGridDb: { ...DEFAULT_SETTINGS.steamGridDb!, ...(loaded.steamGridDb ?? {}) },
      launch: { ...DEFAULT_SETTINGS.launch, ...(loaded.launch ?? {}) },
      sounds: { ...DEFAULT_SETTINGS.sounds, ...(loaded.sounds ?? {}) },
      mods: { ...DEFAULT_SETTINGS.mods, ...(loaded.mods ?? {}) },
      epic: { ...DEFAULT_SETTINGS.epic, ...(loaded.epic ?? {}) },
      media: {
        ...DEFAULT_SETTINGS.media,
        ...(loaded.media ?? {}),
        streamingProviders:
          loaded.media?.streamingProviders ?? DEFAULT_SETTINGS.media.streamingProviders
      },
      input: { ...DEFAULT_SETTINGS.input, ...(loaded.input ?? {}) }
    }
  },
  save(next: AppSettings): void {
    writeJson(PATHS.settingsFile, next)
  }
}

/**
 * Migrate legacy `file:///` cover URLs to `gh-asset://`.
 *
 * Older library.json files (pre-protocol) store renderer-unsafe file:// URLs.
 * We rewrite them lazily on load by extracting the basename and mapping to the
 * appropriate gh-asset kind. Persists the rewrite so we only do this once.
 */
function migrateAssetUrl(url: string | undefined, kind: 'cover' | 'banner'): string | undefined {
  if (!url) return url
  if (url.startsWith('gh-asset://')) return url
  if (!url.startsWith('file:')) return url
  const filename = url.split(/[/\\]/).pop()
  if (!filename) return undefined
  return `gh-asset://${kind}/${encodeURIComponent(filename)}`
}

export const libraryStore = {
  load(): LibraryFile {
    const raw = readJson<LibraryFile>(PATHS.libraryFile, {
      games: [],
      emulators: [],
      updatedAt: new Date().toISOString()
    })
    let dirty = false
    const games = raw.games.map((g) => {
      const cover = migrateAssetUrl(g.cover, 'cover')
      const banner = migrateAssetUrl(g.banner, 'banner')
      if (cover !== g.cover || banner !== g.banner) {
        dirty = true
        return { ...g, cover, banner }
      }
      return g
    })
    if (dirty) {
      log.info('store', 'migrated legacy file:// cover URLs to gh-asset://')
      writeJson(PATHS.libraryFile, { ...raw, games, updatedAt: new Date().toISOString() })
    }
    return { ...raw, games }
  },
  save(games: Game[], emulators: DetectedEmulator[]): void {
    writeJson(PATHS.libraryFile, {
      games,
      emulators,
      updatedAt: new Date().toISOString()
    } satisfies LibraryFile)
  },
  /** Update a single game by id; returns the updated game or null. */
  patchGame(id: string, patch: Partial<Game>): Game | null {
    const data = this.load()
    const idx = data.games.findIndex((g) => g.id === id)
    if (idx === -1) return null
    const updated = { ...data.games[idx], ...patch }
    data.games[idx] = updated
    this.save(data.games, data.emulators)
    return updated
  },
  addGame(game: Game): Game {
    const data = this.load()
    // Idempotent on id — replace if exists
    const idx = data.games.findIndex((g) => g.id === game.id)
    if (idx === -1) data.games.push(game)
    else data.games[idx] = game
    this.save(data.games, data.emulators)
    return game
  },
  removeGame(id: string): boolean {
    const data = this.load()
    const before = data.games.length
    data.games = data.games.filter((g) => g.id !== id)
    if (data.games.length === before) return false
    this.save(data.games, data.emulators)
    return true
  }
}

export const mediaStore = {
  load(): MediaLibraryFile {
    const raw = readJson<MediaLibraryFile>(PATHS.mediaLibraryFile, {
      items: [],
      updatedAt: new Date().toISOString()
    })
    let dirty = false
    const items = raw.items.map((item) => {
      const cover = migrateAssetUrl(item.cover, 'cover')
      const banner = migrateAssetUrl(item.banner, 'banner')
      if (cover !== item.cover || banner !== item.banner) {
        dirty = true
        return { ...item, cover, banner }
      }
      return item
    })
    if (dirty) {
      writeJson(PATHS.mediaLibraryFile, { ...raw, items, updatedAt: new Date().toISOString() })
    }
    return { ...raw, items }
  },
  save(items: MediaItem[], extra: { excludedPaths?: string[] } = {}): void {
    const current = readJson<MediaLibraryFile>(PATHS.mediaLibraryFile, {
      items: [],
      updatedAt: new Date().toISOString()
    })
    writeJson(PATHS.mediaLibraryFile, {
      items,
      excludedPaths: extra.excludedPaths ?? current.excludedPaths ?? [],
      updatedAt: new Date().toISOString()
    } satisfies MediaLibraryFile)
  },
  exclude(path: string): void {
    const data = this.load()
    const set = new Set(data.excludedPaths ?? [])
    set.add(path.toLowerCase())
    this.save(data.items, { excludedPaths: Array.from(set) })
  },
  isExcluded(path: string): boolean {
    const data = this.load()
    return (data.excludedPaths ?? []).includes(path.toLowerCase())
  },
  patchItem(id: string, patch: Partial<MediaItem>): MediaItem | null {
    const data = this.load()
    const idx = data.items.findIndex((item) => item.id === id)
    if (idx === -1) return null
    const updated = { ...data.items[idx], ...patch }
    data.items[idx] = updated
    this.save(data.items)
    return updated
  },
  addItem(item: MediaItem): MediaItem {
    const data = this.load()
    const idx = data.items.findIndex((existing) => existing.id === item.id)
    if (idx === -1) data.items.push(item)
    else data.items[idx] = item
    this.save(data.items)
    return item
  },
  removeItem(id: string): boolean {
    const data = this.load()
    const next = data.items.filter((item) => item.id !== id)
    if (next.length === data.items.length) return false
    this.save(next)
    return true
  }
}

export const watchedMediaStore = {
  load(): MediaWatchedFile {
    const raw = readJson<MediaWatchedFile>(PATHS.mediaWatchedFile, {
      records: [],
      updatedAt: new Date().toISOString()
    })
    let dirty = false
    const records = raw.records.map((record) => {
      const cover = migrateAssetUrl(record.cover, 'cover')
      const banner = migrateAssetUrl(record.banner, 'banner')
      if (cover !== record.cover || banner !== record.banner) {
        dirty = true
        return { ...record, cover, banner }
      }
      return record
    })
    if (dirty) {
      writeJson(PATHS.mediaWatchedFile, { ...raw, records, updatedAt: new Date().toISOString() })
    }
    return { ...raw, records }
  },
  save(records: MediaWatchRecord[]): void {
    writeJson(PATHS.mediaWatchedFile, {
      records,
      updatedAt: new Date().toISOString()
    } satisfies MediaWatchedFile)
  },
  upsert(record: MediaWatchRecord): MediaWatchRecord {
    const data = this.load()
    const idx = data.records.findIndex((existing) => existing.id === record.id)
    if (idx === -1) data.records.unshift(record)
    else data.records[idx] = record
    data.records.sort((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt))
    this.save(data.records)
    return record
  },
  removeByMediaId(mediaId: string): boolean {
    const data = this.load()
    const before = data.records.length
    const next = data.records.filter((record) => record.mediaId !== mediaId)
    if (next.length === before) return false
    this.save(next)
    return true
  }
}

export const journeyStore = {
  load(): GameJourneyFile {
    const raw = readJson<GameJourneyFile>(PATHS.journeyFile, {
      records: [],
      updatedAt: new Date().toISOString()
    })
    let dirty = false
    const records = raw.records.map((record) => {
      const cover = migrateAssetUrl(record.cover, 'cover')
      const banner = migrateAssetUrl(record.banner, 'banner')
      if (cover !== record.cover || banner !== record.banner) {
        dirty = true
        return { ...record, cover, banner }
      }
      return record
    })
    if (dirty) {
      writeJson(PATHS.journeyFile, { ...raw, records, updatedAt: new Date().toISOString() })
    }
    return { ...raw, records }
  },
  save(records: GameJourneyRecord[]): void {
    writeJson(PATHS.journeyFile, {
      records,
      updatedAt: new Date().toISOString()
    } satisfies GameJourneyFile)
  },
  upsert(record: GameJourneyRecord): GameJourneyRecord {
    const data = this.load()
    const idx = data.records.findIndex((existing) => existing.gameId === record.gameId)
    if (idx === -1) data.records.unshift(record)
    else data.records[idx] = { ...data.records[idx], ...record, firstTrackedAt: data.records[idx].firstTrackedAt }
    data.records.sort((a, b) => b.lastTrackedAt.localeCompare(a.lastTrackedAt))
    this.save(data.records)
    return idx === -1 ? record : data.records[idx]
  }
}

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { PATHS } from './paths'
import { log } from './logger'
import type { AppSettings, DetectedEmulator, Game } from '@shared/types'

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
  fullscreenOnStart: false,
  skipSplash: false,
  locale: 'pt-BR',
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
    return JSON.parse(readFileSync(path, 'utf8')) as T
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
      input: { ...DEFAULT_SETTINGS.input, ...(loaded.input ?? {}) }
    }
  },
  save(next: AppSettings): void {
    writeJson(PATHS.settingsFile, next)
  }
}

export const libraryStore = {
  load(): LibraryFile {
    return readJson<LibraryFile>(PATHS.libraryFile, {
      games: [],
      emulators: [],
      updatedAt: new Date().toISOString()
    })
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

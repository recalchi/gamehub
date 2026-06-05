import { basename } from 'node:path'
import { LOCAL_ACHIEVEMENT_CATALOG, type AchievementCatalogEntry } from './catalog'
import type { Game } from '@shared/types'

/**
 * Resolver for the bundled achievement catalog. Returns null when no entry
 * matches the game (caller should fall back to Steam-local / RetroAchievements
 * / 'unsupported' as before).
 */
export function resolveLocalCatalogEntry(game: Game): AchievementCatalogEntry | null {
  const slug = normalize(game.title)
  const appId = steamAppIdFromGame(game)
  const exeName = basename(game.path).toLowerCase()
  for (const entry of LOCAL_ACHIEVEMENT_CATALOG) {
    if (appId && entry.matchers.steamAppId === appId) return entry
    if (entry.matchers.titles.some((t) => normalize(t) === slug)) {
      if (entry.platforms.length === 0 || entry.platforms.includes(game.platform)) {
        return entry
      }
    }
    if (entry.matchers.exe?.some((e) => e.toLowerCase() === exeName)) return entry
  }
  return null
}

function steamAppIdFromGame(game: Game): string | null {
  const fromId = game.id.match(/^steam_(\d+)$/i)?.[1]
  if (fromId) return fromId
  return game.path.match(/^steam:\/\/rungameid\/(\d+)/i)?.[1] ?? null
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

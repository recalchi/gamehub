import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { PATHS } from '../paths'

/**
 * Persisted, user-driven achievement progress. Steam writes its own progress
 * to its cache; for the local catalog + manual tracking we need a sidecar.
 *
 * Schema is intentionally flat: `{ gameId: { achievementId: timestamp } }`.
 * Storing the unlock timestamp gives the UI a "Conquistada em ..." line
 * without ballooning the file.
 */
export interface AchievementProgressFile {
  perGame: Record<string, Record<string, string>>
  updatedAt: string
}

function load(): AchievementProgressFile {
  if (!existsSync(PATHS.achievementsProgressFile)) {
    return { perGame: {}, updatedAt: new Date().toISOString() }
  }
  try {
    return JSON.parse(readFileSync(PATHS.achievementsProgressFile, 'utf8')) as AchievementProgressFile
  } catch {
    return { perGame: {}, updatedAt: new Date().toISOString() }
  }
}

function save(data: AchievementProgressFile): void {
  writeFileSync(
    PATHS.achievementsProgressFile,
    JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  )
}

export function listUnlocked(gameId: string): Record<string, string> {
  return load().perGame[gameId] ?? {}
}

export function toggleAchievement(gameId: string, achievementId: string, unlocked: boolean): Record<string, string> {
  const data = load()
  const current = data.perGame[gameId] ?? {}
  if (unlocked) {
    current[achievementId] = new Date().toISOString()
  } else {
    delete current[achievementId]
  }
  data.perGame[gameId] = current
  save(data)
  return current
}

export function unlockedCount(gameId: string): number {
  return Object.keys(listUnlocked(gameId)).length
}

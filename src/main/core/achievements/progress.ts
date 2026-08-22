import { PATHS } from '../paths'
import { loadProgressFromFile, toggleAchievementInFile } from './progress-file'

export function listUnlocked(gameId: string): Record<string, string> {
  return loadProgressFromFile(PATHS.achievementsProgressFile).perGame[gameId] ?? {}
}

export function toggleAchievement(gameId: string, achievementId: string, unlocked: boolean): Record<string, string> {
  return toggleAchievementInFile(PATHS.achievementsProgressFile, gameId, achievementId, unlocked)
}

export function unlockedCount(gameId: string): number {
  return Object.keys(listUnlocked(gameId)).length
}

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export interface AchievementProgressFile {
  perGame: Record<string, Record<string, string>>
  updatedAt: string
}

export function loadProgressFromFile(filePath: string): AchievementProgressFile {
  if (!existsSync(filePath)) {
    return { perGame: {}, updatedAt: new Date().toISOString() }
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as AchievementProgressFile
  } catch {
    return { perGame: {}, updatedAt: new Date().toISOString() }
  }
}

export function saveProgressToFile(filePath: string, data: AchievementProgressFile): void {
  writeFileSync(
    filePath,
    JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  )
}

export function toggleAchievementInFile(
  filePath: string,
  gameId: string,
  achievementId: string,
  unlocked: boolean
): Record<string, string> {
  const data = loadProgressFromFile(filePath)
  const current = data.perGame[gameId] ?? {}
  if (unlocked) {
    current[achievementId] = new Date().toISOString()
  } else {
    delete current[achievementId]
  }
  data.perGame[gameId] = current
  saveProgressToFile(filePath, data)
  return current
}

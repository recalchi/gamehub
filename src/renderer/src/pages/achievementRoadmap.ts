import type { AchievementDefinition } from '@shared/types'

export type AchievementRoadmapCategoryId = NonNullable<AchievementDefinition['category']>

export interface AchievementRoadmapCategory {
  id: AchievementRoadmapCategoryId
  label: string
  total: number
  unlocked: number
  pending: number
  percent: number
}

export interface AchievementRoadmap {
  total: number
  unlocked: number
  pending: number
  percent: number
  categories: AchievementRoadmapCategory[]
  next: AchievementDefinition[]
}

const CATEGORY_LABELS: Record<AchievementRoadmapCategoryId, string> = {
  story: 'Historia',
  boss: 'Chefes',
  ending: 'Finais',
  collection: 'Colecoes',
  upgrade: 'Upgrades',
  milestone: 'Marcos'
}

const CATEGORY_ORDER: AchievementRoadmapCategoryId[] = [
  'boss',
  'ending',
  'collection',
  'story',
  'upgrade',
  'milestone'
]

const TIER_WEIGHT: Record<NonNullable<AchievementDefinition['tier']>, number> = {
  platinum: 0,
  gold: 1,
  silver: 2,
  bronze: 3,
  gamehub: 4
}

export function buildAchievementRoadmap(
  achievements: AchievementDefinition[],
  progress: Record<string, string>
): AchievementRoadmap {
  const unlocked = achievements.filter((achievement) => isUnlocked(achievement, progress)).length
  const total = achievements.length
  const pending = total - unlocked

  return {
    total,
    unlocked,
    pending,
    percent: percentage(unlocked, total),
    categories: CATEGORY_ORDER.map((category) => buildCategory(category, achievements, progress)).filter(
      (category) => category.total > 0
    ),
    next: achievements
      .filter((achievement) => !isUnlocked(achievement, progress))
      .sort(compareNextAchievement)
      .slice(0, 5)
  }
}

function buildCategory(
  category: AchievementRoadmapCategoryId,
  achievements: AchievementDefinition[],
  progress: Record<string, string>
): AchievementRoadmapCategory {
  const items = achievements.filter((achievement) => normalizeCategory(achievement) === category)
  const unlocked = items.filter((achievement) => isUnlocked(achievement, progress)).length
  const total = items.length

  return {
    id: category,
    label: CATEGORY_LABELS[category],
    total,
    unlocked,
    pending: total - unlocked,
    percent: percentage(unlocked, total)
  }
}

function compareNextAchievement(a: AchievementDefinition, b: AchievementDefinition): number {
  return (
    categoryWeight(a) - categoryWeight(b) ||
    tierWeight(a) - tierWeight(b) ||
    sourceWeight(a) - sourceWeight(b) ||
    a.title.localeCompare(b.title)
  )
}

function categoryWeight(achievement: AchievementDefinition): number {
  const index = CATEGORY_ORDER.indexOf(normalizeCategory(achievement))
  return index === -1 ? CATEGORY_ORDER.length : index
}

function tierWeight(achievement: AchievementDefinition): number {
  return achievement.tier ? TIER_WEIGHT[achievement.tier] : 5
}

function sourceWeight(achievement: AchievementDefinition): number {
  return achievement.source === 'gamehub' ? 1 : 0
}

function normalizeCategory(achievement: AchievementDefinition): AchievementRoadmapCategoryId {
  return achievement.category ?? 'milestone'
}

function isUnlocked(achievement: AchievementDefinition, progress: Record<string, string>): boolean {
  return Boolean(progress[achievement.id] || achievement.unlocked)
}

function percentage(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

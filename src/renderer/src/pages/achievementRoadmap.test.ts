import { describe, expect, it } from 'vitest'
import type { AchievementDefinition } from '@shared/types'
import { buildAchievementRoadmap } from './achievementRoadmap'

const achievements: AchievementDefinition[] = [
  {
    id: 'boss-1',
    apiName: 'BOSS_1',
    title: 'Margit, the Fell Omen',
    category: 'boss',
    tier: 'bronze',
    source: 'steam'
  },
  {
    id: 'ending-1',
    apiName: 'ENDING_1',
    title: 'Age of the Stars',
    category: 'ending',
    tier: 'gold',
    source: 'steam'
  },
  {
    id: 'collection-1',
    apiName: 'COLLECTION_1',
    title: 'Legendary Armaments',
    category: 'collection',
    tier: 'silver',
    source: 'steam'
  },
  {
    id: 'custom-1',
    apiName: 'CUSTOM_1',
    title: 'GameHub: boss hunt',
    category: 'milestone',
    tier: 'gamehub',
    source: 'gamehub',
    checklistTotal: 166
  },
  {
    id: 'unknown-1',
    apiName: 'UNKNOWN_1',
    title: 'Unclassified'
  }
]

describe('achievement roadmap', () => {
  it('groups progress by category and keeps uncategorized entries as milestones', () => {
    const roadmap = buildAchievementRoadmap(achievements, { 'boss-1': '2026-08-22T00:00:00.000Z' })

    expect(roadmap.total).toBe(5)
    expect(roadmap.unlocked).toBe(1)
    expect(roadmap.percent).toBe(20)
    expect(roadmap.categories.find((category) => category.id === 'boss')).toMatchObject({
      total: 1,
      unlocked: 1,
      pending: 0
    })
    expect(roadmap.categories.find((category) => category.id === 'milestone')).toMatchObject({
      total: 2,
      unlocked: 0,
      pending: 2
    })
  })

  it('builds a focused next-up list with pending items only', () => {
    const roadmap = buildAchievementRoadmap(achievements, {
      'boss-1': '2026-08-22T00:00:00.000Z',
      'ending-1': '2026-08-22T00:01:00.000Z'
    })

    expect(roadmap.next.map((achievement) => achievement.id)).toEqual([
      'collection-1',
      'custom-1',
      'unknown-1'
    ])
  })
})

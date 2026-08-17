import { describe, expect, it } from 'vitest'
import { LOCAL_ACHIEVEMENT_CATALOG } from './index'

const eldenRing = LOCAL_ACHIEVEMENT_CATALOG.find((entry) => entry.id === 'elden-ring')

describe('achievement catalog / Elden Ring', () => {
  it('maps the official Steam achievement set plus GameHub checklists', () => {
    expect(eldenRing).toBeDefined()

    const official = eldenRing!.achievements.filter((achievement) => achievement.source === 'steam')
    const gamehub = eldenRing!.achievements.filter((achievement) => achievement.source === 'gamehub')

    expect(official).toHaveLength(42)
    expect(gamehub).toHaveLength(2)
    expect(official.at(-1)).toMatchObject({
      id: 'er:elden-ring',
      title: 'Elden Ring',
      tier: 'platinum'
    })
  })

  it('classifies boss achievements and custom boss checklist totals', () => {
    expect(eldenRing).toBeDefined()

    const achievementBosses = eldenRing!.achievements.filter(
      (achievement) => achievement.category === 'boss' && achievement.source === 'steam'
    )
    const bossChecklist = eldenRing!.achievements.find(
      (achievement) => achievement.id === 'er:gamehub-achievement-bosses'
    )
    const baseGameBossHunt = eldenRing!.achievements.find(
      (achievement) => achievement.id === 'er:gamehub-base-game-boss-hunt'
    )

    expect(achievementBosses).toHaveLength(30)
    expect(bossChecklist).toMatchObject({ checklistTotal: 30, category: 'boss', source: 'gamehub' })
    expect(baseGameBossHunt).toMatchObject({
      checklistTotal: 166,
      category: 'milestone',
      source: 'gamehub'
    })
  })
})

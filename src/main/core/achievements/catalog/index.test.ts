import { describe, expect, it } from 'vitest'
import { LOCAL_ACHIEVEMENT_CATALOG } from './index'
import { resolveLocalCatalogEntry } from '../local-catalog'
import type { Game, PlatformId } from '@shared/types'

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

function game(title: string, path: string, platform: PlatformId): Game {
  return {
    id: `${platform}:${title}`,
    title,
    path,
    platform,
    sizeBytes: 0,
    confidence: 1,
    status: 'ready',
    addedAt: '2026-08-22T00:00:00.000Z',
    playTime: 0,
    favorite: false,
    flags: [],
    relatedFiles: []
  }
}

describe('achievement catalog / God of War series', () => {
  it('covers every God of War title currently identified in the local library', () => {
    expect(LOCAL_ACHIEVEMENT_CATALOG.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['god-of-war-ps2', 'god-of-war-ii-ps2', 'god-of-war-ii-hd', 'god-of-war-2018'])
    )
  })

  it('maps GoW.exe to the 37-item Steam achievement set for God of War 2018', () => {
    const entry = resolveLocalCatalogEntry(game('GoW', 'E:\\Jogos\\PC\\God-of-War\\GodOfWar\\GoW.exe', 'pc'))

    expect(entry?.id).toBe('god-of-war-2018')
    expect(entry?.achievements.filter((achievement) => achievement.source === 'steam')).toHaveLength(37)
    expect(entry?.achievements.at(-1)).toMatchObject({
      id: 'gow2018:father-and-son',
      tier: 'platinum'
    })
  })

  it('keeps PS2 originals as GameHub goals and HD remasters as local trophy roadmaps', () => {
    const gow = resolveLocalCatalogEntry(game('God of War', 'D:\\Jogos\\PS2\\God of War.iso', 'ps2'))
    const gow2 = resolveLocalCatalogEntry(game('God of War II', 'D:\\Jogos\\PS2\\SLUS-21361 (1.00).iso', 'ps2'))
    const gow2hd = resolveLocalCatalogEntry(
      game('God of War II HD', 'D:\\Jogos\\PS3\\God of War II HD (USA)\\game.pkg', 'ps3')
    )

    expect(gow?.achievements.every((achievement) => achievement.source === 'gamehub')).toBe(true)
    expect(gow2?.achievements.some((achievement) => achievement.id === 'gow2:gamehub-ps2-platinum-run')).toBe(true)
    expect(gow2hd?.achievements.filter((achievement) => achievement.source === 'local')).toHaveLength(35)
  })
})

describe('achievement catalog / Demon Slayer', () => {
  it('maps the running Yuzu install path to the Hinokami Chronicles roadmap', () => {
    const entry = resolveLocalCatalogEntry(
      game(
        'yuzu',
        'E:\\Jogos\\PC\\Demon-Slayer-Kimetsu-no-Yaiba-SteamRIP.com (1)\\Demon Slayer - Kimetsu no Yaiba\\yuzu.exe',
        'pc'
      )
    )

    expect(entry?.id).toBe('demon-slayer-hinokami-chronicles')
    expect(entry?.sourceUrl).toBe('https://steamcommunity.com/stats/1490890/achievements')
  })

  it('keeps the 47 official Steam achievements separate from GameHub goals', () => {
    const entry = LOCAL_ACHIEVEMENT_CATALOG.find((item) => item.id === 'demon-slayer-hinokami-chronicles')

    expect(entry).toBeDefined()
    expect(entry!.achievements.filter((achievement) => achievement.source === 'steam')).toHaveLength(47)
    expect(entry!.achievements.filter((achievement) => achievement.source === 'gamehub')).toHaveLength(4)
    expect(entry!.achievements.at(-1)).toMatchObject({
      id: 'dshc:gamehub-platinum-run',
      checklistTotal: 47,
      tier: 'gamehub'
    })
  })
})

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { libraryStore } from './store'
import { log } from './logger'
import { resolveLocalCatalogEntry } from './achievements/local-catalog'
import type {
  AchievementDefinition,
  AchievementSourceStatus,
  Game,
  GameAchievementDetail,
  GameAchievementSummary,
  PlatformId
} from '@shared/types'

const STEAM_ROOTS = [
  'C:\\Program Files (x86)\\Steam',
  'C:\\Program Files\\Steam',
  'D:\\Steam',
  'E:\\Steam'
]

const RETRO_PLATFORMS = new Set<PlatformId>([
  'nes',
  'snes',
  'n64',
  'gamecube',
  'gb',
  'gbc',
  'gba',
  'nds',
  'n3ds',
  'ps1',
  'ps2',
  'psp'
])

const LANGUAGE_LABELS = [
  'spanish',
  'LATAM',
  'italian',
  'russian',
  'polish',
  'french',
  'german',
  'brazilian',
  'koreana',
  'tchinese',
  'schinese',
  'japanese',
  'turkish',
  'thai',
  'desc token',
  'hidden',
  'icon'
]

export async function listAchievementSummaries(): Promise<GameAchievementSummary[]> {
  const { games } = libraryStore.load()
  return games.map((game) => buildSummary(game, readDefinitions(game)))
}

export async function achievementDetail(gameId: string): Promise<GameAchievementDetail | null> {
  const game = libraryStore.load().games.find((g) => g.id === gameId)
  if (!game) return null
  const achievements = readDefinitions(game)
  return {
    summary: buildSummary(game, achievements),
    achievements
  }
}

function buildSummary(game: Game, achievements: AchievementDefinition[]): GameAchievementSummary {
  // Bundled catalog wins when available — it works without Steam being
  // installed and covers PC titles outside the Steam ecosystem.
  const local = resolveLocalCatalogEntry(game)
  if (local) {
    return {
      gameId: game.id,
      gameTitle: game.title,
      platform: game.platform,
      cover: game.cover,
      provider: 'local-catalog',
      status: 'ready',
      total: local.achievements.length,
      sourceLabel: local.sourceLabel,
      sourceDetail: 'Conquistas mapeadas no catálogo local do GameHub.',
      sourceUrl: local.sourceUrl,
      updatedAt: new Date().toISOString()
    }
  }

  const appId = steamAppId(game)
  if (appId) {
    const status: AchievementSourceStatus = achievements.length > 0 ? 'ready' : 'not-cached'
    return {
      gameId: game.id,
      gameTitle: game.title,
      platform: game.platform,
      cover: game.cover,
      provider: 'steam-local',
      status,
      total: achievements.length,
      sourceLabel: 'Steam',
      sourceDetail:
        status === 'ready'
          ? 'Conquistas identificadas no cache local da Steam.'
          : 'A Steam ainda nao tem o schema deste jogo em cache local neste PC.',
      sourceUrl: `https://store.steampowered.com/app/${appId}`,
      updatedAt: new Date().toISOString()
    }
  }

  if (RETRO_PLATFORMS.has(game.platform)) {
    return {
      gameId: game.id,
      gameTitle: game.title,
      platform: game.platform,
      cover: game.cover,
      provider: 'retroachievements',
      status: 'needs-configuration',
      total: 0,
      sourceLabel: 'RetroAchievements',
      sourceDetail:
        'Jogo de console compativel em potencial. Para listar conquistas reais, precisa conectar RetroAchievements e validar o hash da ROM.',
      sourceUrl: 'https://retroachievements.org/',
      updatedAt: new Date().toISOString()
    }
  }

  return {
    gameId: game.id,
    gameTitle: game.title,
    platform: game.platform,
    cover: game.cover,
    provider: 'none',
    status: 'unsupported',
    total: 0,
    sourceLabel: 'Sem provedor',
    sourceDetail: 'Nao encontrei uma fonte local confiavel de conquistas para este jogo.',
    updatedAt: new Date().toISOString()
  }
}

function readDefinitions(game: Game): AchievementDefinition[] {
  const local = resolveLocalCatalogEntry(game)
  if (local) return local.achievements
  const appId = steamAppId(game)
  if (!appId) return []
  const schemaPath = findSteamSchema(appId)
  if (!schemaPath) return []
  try {
    return parseSteamSchema(appId, readFileSync(schemaPath))
  } catch (err) {
    log.warn('achievements', `failed to parse Steam schema ${schemaPath}: ${String(err)}`)
    return []
  }
}

function steamAppId(game: Game): string | null {
  const fromId = game.id.match(/^steam_(\d+)$/i)?.[1]
  if (fromId) return fromId
  return game.path.match(/^steam:\/\/rungameid\/(\d+)/i)?.[1] ?? null
}

function findSteamSchema(appId: string): string | null {
  for (const root of STEAM_ROOTS) {
    const direct = join(root, 'appcache', 'stats', `UserGameStatsSchema_${appId}.bin`)
    if (existsSync(direct)) return direct
  }

  for (const root of STEAM_ROOTS) {
    const statsDir = join(root, 'appcache', 'stats')
    if (!existsSync(statsDir)) continue
    try {
      const found = readdirSync(statsDir).find(
        (file) => file.toLowerCase() === `usergamestatsschema_${appId}.bin`
      )
      if (found) return join(statsDir, found)
    } catch {
      continue
    }
  }
  return null
}

function parseSteamSchema(appId: string, bytes: Buffer): AchievementDefinition[] {
  const text = new TextDecoder('utf-8')
    .decode(bytes)
    .replace(/[^\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]+/g, ' ')
    .replace(/\s+/g, ' ')

  const starts = Array.from(text.matchAll(/\bbits\s+\d+\s+name\s+/g)).map((m) => m.index ?? 0)
  const achievements: AchievementDefinition[] = []

  for (let i = 0; i < starts.length; i++) {
    const segment = text.slice(starts[i], starts[i + 1] ?? text.length)
    const apiName = segment.match(/\bname\s+(\S+)/)?.[1]
    if (!apiName) continue
    const title = readEnglishField(segment, /display name token\s+\S+\s+/)
    const description = readEnglishField(segment, /desc token\s+\S+\s+/)
    if (!title || title === apiName) continue

    const icon = segment.match(/\bicon\s+([a-f0-9]{40}\.(?:jpg|png))/i)?.[1]
    const iconGray = segment.match(/\bicon_gray\s+([a-f0-9]{40}\.(?:jpg|png))/i)?.[1]
    achievements.push({
      id: `${appId}:${apiName}`,
      apiName,
      title,
      description,
      icon: icon ? steamAchievementIcon(appId, icon) : undefined,
      iconGray: iconGray ? steamAchievementIcon(appId, iconGray) : undefined
    })
  }

  return achievements
}

function readEnglishField(segment: string, marker: RegExp): string | undefined {
  const markerMatch = segment.match(marker)
  if (!markerMatch?.index) return undefined
  const tail = segment.slice(markerMatch.index + markerMatch[0].length)
  const match = tail.match(
    new RegExp(`\\benglish\\s+(.+?)(?=\\s+(?:${LANGUAGE_LABELS.map(escapeRegExp).join('|')})\\b)`, 'i')
  )
  return cleanup(match?.[1])
}

function cleanup(value: string | undefined): string | undefined {
  const out = value?.replace(/\s+/g, ' ').trim()
  if (!out || out.length < 2) return undefined
  return out
}

function steamAchievementIcon(appId: string, filename: string): string {
  return `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appId}/${filename}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

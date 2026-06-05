import { copyFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { PLATFORMS } from '@shared/platforms'
import type {
  Game,
  GameArchiveRemoveInput,
  GameCompletionStatus,
  GameJourneyRecord,
  GameJourneyUpsertInput
} from '@shared/types'
import { achievementDetail } from './achievements'
import { log } from './logger'
import { removeGame } from './manualGames'
import { PATHS } from './paths'
import { backupSave } from './saves'
import { journeyStore, libraryStore } from './store'

type JourneyResult =
  | { ok: true; record: GameJourneyRecord; saveWarning?: string }
  | { error: string }

const STATUS_WEIGHT: Record<GameCompletionStatus, number> = {
  played: 1,
  completed: 2,
  platinum: 3
}

export function listJourneyRecords(): GameJourneyRecord[] {
  return journeyStore.load().records
}

export async function upsertJourneyFromGame(input: GameJourneyUpsertInput): Promise<JourneyResult> {
  const game = findGame(input.gameId)
  if (!game) return { error: 'Jogo nao encontrado.' }
  return saveJourneyForGame(game, input)
}

export async function archiveAndRemoveGame(input: GameArchiveRemoveInput): Promise<JourneyResult> {
  const game = findGame(input.gameId)
  if (!game) return { error: 'Jogo nao encontrado.' }

  const ref = input.redownloadUrl?.trim() ?? ''
  if (!isValidDownloadReference(ref)) {
    return {
      error:
        'Para excluir da biblioteca, informe um link valido para baixar/reinstalar depois (https://..., steam://..., epic://...).'
    }
  }

  const journey = await saveJourneyForGame(game, {
    ...input,
    redownloadUrl: ref,
    status: input.status
  })
  if ('error' in journey) return journey

  if (input.removeFromLibrary !== false) {
    const removed = removeGame(game.id)
    if ('error' in removed) return { error: removed.error }
  }

  return journey
}

async function saveJourneyForGame(game: Game, input: GameJourneyUpsertInput): Promise<JourneyResult> {
  const now = new Date().toISOString()
  const data = journeyStore.load()
  const prev = data.records.find((record) => record.gameId === game.id)

  let saveWarning: string | undefined
  let snapshotId = prev?.saveSnapshotId
  let snapshotCreatedAt = prev?.saveSnapshotCreatedAt
  let snapshotSizeBytes = prev?.saveSnapshotSizeBytes

  if (input.captureSave !== false) {
    const snapshot = await backupSave(game.id)
    if ('error' in snapshot) {
      saveWarning = snapshot.error
    } else {
      snapshotId = snapshot.id
      snapshotCreatedAt = snapshot.createdAt
      snapshotSizeBytes = snapshot.sizeBytes
    }
  }

  const achievements = await achievementDetail(game.id)
  const mergedStatus = pickBestStatus(prev?.status, input.status)
  const cover = await persistJourneyAsset(game, 'cover')
  const banner = await persistJourneyAsset(game, 'banner')

  const record: GameJourneyRecord = {
    id: prev?.id ?? `journey_${game.id}`,
    gameId: game.id,
    title: game.title,
    platform: game.platform,
    emulator: game.emulator,
    gamePath: game.path,
    cover,
    banner,
    status: mergedStatus,
    playTimeSeconds: Math.max(game.playTime ?? 0, prev?.playTimeSeconds ?? 0),
    firstTrackedAt: prev?.firstTrackedAt ?? now,
    lastTrackedAt: now,
    completedAt:
      mergedStatus === 'completed' || mergedStatus === 'platinum'
        ? prev?.completedAt ?? now
        : prev?.completedAt,
    redownloadUrl: input.redownloadUrl?.trim() || prev?.redownloadUrl,
    sourceUrl: input.sourceUrl?.trim() || prev?.sourceUrl,
    sourceLabel: input.sourceLabel?.trim() || prev?.sourceLabel,
    saveSnapshotId: snapshotId,
    saveSnapshotCreatedAt: snapshotCreatedAt,
    saveSnapshotSizeBytes: snapshotSizeBytes,
    achievementProvider: achievements?.summary.provider,
    achievementUnlocked: achievements?.summary.unlocked,
    achievementTotal: achievements?.summary.total,
    notes: input.notes?.trim() || prev?.notes
  }

  const saved = journeyStore.upsert(record)
  log.info(
    'journey',
    `tracked ${saved.title} as ${saved.status}${saveWarning ? ' (save warning)' : ''}`
  )
  return { ok: true, record: saved, saveWarning }
}

function findGame(gameId: string): Game | undefined {
  return libraryStore.load().games.find((game) => game.id === gameId)
}

function pickBestStatus(
  previous: GameCompletionStatus | undefined,
  next: GameCompletionStatus
): GameCompletionStatus {
  if (!previous) return next
  return STATUS_WEIGHT[next] >= STATUS_WEIGHT[previous] ? next : previous
}

function isValidDownloadReference(value: string): boolean {
  if (!value) return false
  if (/^(https?:\/\/|steam:\/\/|com\.epicgames\.launcher:\/\/|epic:\/\/|magnet:)/i.test(value)) {
    return true
  }
  try {
    const url = new URL(value)
    return Boolean(url.protocol && url.hostname)
  } catch {
    return false
  }
}

function decodeAssetFilename(url: string, host: string): string | null {
  const prefix = `gh-asset://${host}/`
  if (!url.startsWith(prefix)) return null
  const encoded = url.slice(prefix.length)
  if (!encoded) return null
  try {
    return decodeURIComponent(encoded)
  } catch {
    return encoded
  }
}

async function persistJourneyAsset(
  game: Game,
  kind: 'cover' | 'banner'
): Promise<string | undefined> {
  const sourceUrl = kind === 'cover' ? game.cover : game.banner
  const journeyHost = kind === 'cover' ? 'journey-cover' : 'journey-banner'
  const journeyRoot = kind === 'cover' ? PATHS.journeyCovers : PATHS.journeyBanners
  const sourceHost = kind === 'cover' ? 'cover' : 'banner'
  const sourceRoot = kind === 'cover' ? PATHS.covers : PATHS.banners

  const filenameFromManaged = sourceUrl ? decodeAssetFilename(sourceUrl, sourceHost) : null
  if (filenameFromManaged) {
    const sourcePath = join(sourceRoot, filenameFromManaged)
    if (existsSync(sourcePath)) {
      const ext = extname(filenameFromManaged) || '.png'
      const targetName = `${game.id}${ext}`
      await copyFile(sourcePath, join(journeyRoot, targetName))
      return `gh-asset://${journeyHost}/${encodeURIComponent(targetName)}`
    }
  }

  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
    return sourceUrl
  }

  if (kind === 'cover') {
    const fallbackName = `${game.id}.svg`
    const fallbackPath = join(journeyRoot, fallbackName)
    if (!existsSync(fallbackPath)) {
      await writeFile(fallbackPath, fallbackCoverSvg(game), 'utf8')
    }
    return `gh-asset://${journeyHost}/${encodeURIComponent(fallbackName)}`
  }
  return undefined
}

function fallbackCoverSvg(game: Game): string {
  const platform = PLATFORMS[game.platform]
  const accent = platform?.color ?? '#5eead4'
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
  </defs>
  <rect width="600" height="900" fill="url(#bg)"/>
  <rect x="44" y="44" width="512" height="812" rx="26" fill="none" stroke="${accent}" stroke-opacity="0.42" stroke-width="3"/>
  <text x="62" y="96" fill="${accent}" font-size="22" font-family="Segoe UI, Arial, sans-serif">${(platform?.shortName ?? 'GAME').toUpperCase()}</text>
  <text x="62" y="770" fill="#e2e8f0" font-size="40" font-weight="700" font-family="Segoe UI, Arial, sans-serif">${escapeXml(game.title)}</text>
  <text x="62" y="812" fill="#94a3b8" font-size="18" font-family="Segoe UI, Arial, sans-serif">GameHub Journey</text>
</svg>`
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

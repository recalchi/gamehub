import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, basename } from 'node:path'
import { libraryStore } from './store'
import { log } from './logger'
import type { Game, PlatformId } from '@shared/types'

export interface ManualGameInput {
  title: string
  path: string
  platform: PlatformId
  description?: string
  developer?: string
  genre?: string
  year?: number
  cover?: string
}

/**
 * Add a hand-crafted entry to the library.
 *
 * Covers the spec's "PC / Outros" cases — Minecraft (via official launcher),
 * Steam games, indie .exe titles — anything the auto-scanner wouldn't pick up
 * because it sits outside the scanned roots.
 *
 * The id is derived from the file path so adding the same exe twice is a
 * no-op (it'll just update fields, not duplicate).
 */
export function addManualGame(input: ManualGameInput): Game | { error: string } {
  if (!input.title.trim()) return { error: 'Título é obrigatório.' }
  if (!input.path) return { error: 'Caminho do executável é obrigatório.' }
  if (!existsSync(input.path)) {
    return { error: `Arquivo não encontrado: ${input.path}` }
  }

  const id = createHash('sha1').update(resolve(input.path).toLowerCase()).digest('hex').slice(0, 16)
  const isNative = input.platform === 'pc'

  const game: Game = {
    id,
    title: input.title.trim(),
    path: input.path,
    platform: input.platform,
    emulator: isNative ? 'native' : undefined,
    sizeBytes: 0,
    confidence: 1,
    status: 'ready',
    addedAt: new Date().toISOString(),
    playTime: 0,
    favorite: false,
    cover: input.cover,
    description: input.description,
    developer: input.developer,
    genre: input.genre,
    year: input.year,
    flags: ['adicionado manualmente'],
    relatedFiles: []
  }

  libraryStore.addGame(game)
  log.info('manual', `added manual game: ${game.title} (${game.platform}) at ${game.path}`)
  return game
}

export function removeGame(id: string): { ok: true } | { error: string } {
  const ok = libraryStore.removeGame(id)
  if (!ok) return { error: 'Jogo não encontrado.' }
  log.info('manual', `removed game ${id}`)
  return { ok: true }
}

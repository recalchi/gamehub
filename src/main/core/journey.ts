import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { PATHS } from './paths'
import { libraryStore } from './store'
import { backupSave } from './saves'
import { log } from './logger'
import type { GameJourneyInput, GameJourneyRecord } from '@shared/types'

interface JourneyFile {
  records: GameJourneyRecord[]
  updatedAt: string
}

function loadFile(): JourneyFile {
  if (!existsSync(PATHS.gameJourneyFile)) {
    return { records: [], updatedAt: new Date().toISOString() }
  }
  try {
    return JSON.parse(readFileSync(PATHS.gameJourneyFile, 'utf8')) as JourneyFile
  } catch {
    return { records: [], updatedAt: new Date().toISOString() }
  }
}

function saveFile(records: GameJourneyRecord[]): void {
  writeFileSync(
    PATHS.gameJourneyFile,
    JSON.stringify({ records, updatedAt: new Date().toISOString() } satisfies JourneyFile, null, 2)
  )
}

export function listJourneyRecords(): GameJourneyRecord[] {
  return loadFile().records
}

export async function upsertJourneyRecord(
  input: GameJourneyInput
): Promise<GameJourneyRecord | { error: string }> {
  const data = libraryStore.load()
  const game = data.games.find((item) => item.id === input.gameId)
  if (!game) return { error: 'Jogo nao encontrado.' }

  let saveSnapshotId: string | undefined
  let saveWarning: string | undefined
  if (input.captureSave) {
    const snapshot = await backupSave(game.id)
    if ('error' in snapshot) saveWarning = snapshot.error
    else saveSnapshotId = snapshot.id
  }

  const file = loadFile()
  const next: GameJourneyRecord = {
    ...input,
    title: game.title,
    gamePath: game.path,
    cover: game.cover,
    banner: game.banner,
    savedAt: new Date().toISOString(),
    saveSnapshotId,
    saveWarning
  }
  const idx = file.records.findIndex((record) => record.gameId === input.gameId)
  if (idx === -1) file.records.push(next)
  else file.records[idx] = { ...file.records[idx], ...next }
  saveFile(file.records)
  log.info('journey', `saved journey record for ${game.title} (${input.status})`)
  return next
}

export async function archiveAndRemoveGame(
  input: GameJourneyInput
): Promise<{ ok: true; record: GameJourneyRecord } | { error: string }> {
  if (!input.redownloadUrl?.trim()) {
    return { error: 'Informe um link para baixar/reinstalar depois.' }
  }
  const record = await upsertJourneyRecord(input)
  if ('error' in record) return record
  const ok = libraryStore.removeGame(input.gameId)
  if (!ok) return { error: 'Jogo nao encontrado para remover.' }
  log.info('journey', `archived and removed ${record.title}`)
  return { ok: true, record }
}

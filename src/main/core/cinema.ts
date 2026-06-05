import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  copyFileSync
} from 'node:fs'
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { BrowserWindow, dialog, nativeImage, shell } from 'electron'
import { PATHS } from './paths'
import { mediaStore, settingsStore, watchedMediaStore } from './store'
import { bannerUrl, coverUrl } from './covers'
import { log } from './logger'
import { IPC } from '@shared/ipc'
import type {
  MediaCatalogEntry,
  MediaDownloadProgress,
  MediaItem,
  MediaKind,
  MediaScanResult,
  MediaSubtitle,
  AutoSubtitleInput,
  AutoSubtitleResult,
  AutoSubtitleLanguage,
  MediaWatchInput,
  MediaWatchRecord,
  MediaWatchedFile
} from '@shared/types'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.webm', '.wmv'])
const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt'])
const COVER_NAMES = ['poster', 'cover', 'folder', 'front', 'capa']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const WHISPER_INSTALL_HINT =
  'Instale o Whisper local e o FFmpeg. Exemplo: py -m pip install -U openai-whisper; depois confirme com: whisper --help'

export const MEDIA_CATALOG: MediaCatalogEntry[] = [
  {
    id: 'ia-his-girl-friday',
    title: 'His Girl Friday',
    year: 1940,
    genre: 'Comedia',
    description: 'Comedia screwball classica de Howard Hawks, com Cary Grant e Rosalind Russell.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/his_girl_friday',
    downloadUrl: 'https://archive.org/download/his_girl_friday/his_girl_friday_512kb.mp4',
    kind: 'movie',
    cover: 'https://archive.org/services/img/his_girl_friday',
    banner: 'https://archive.org/services/img/his_girl_friday',
    license: 'Dominio publico / Internet Archive',
    runtimeMinutes: 92,
    approxSizeMb: 383
  },
  {
    id: 'ia-house-on-haunted-hill',
    title: 'House on Haunted Hill',
    year: 1959,
    genre: 'Terror',
    description: 'Vincent Price em um classico de mansao assombrada, perfeito para sessao noturna.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/house_on_haunted_hill_ipod',
    downloadUrl: 'https://archive.org/download/house_on_haunted_hill_ipod/house_on_haunted_hill_512kb.mp4',
    kind: 'movie',
    cover: 'https://archive.org/services/img/house_on_haunted_hill_ipod',
    banner: 'https://archive.org/services/img/house_on_haunted_hill_ipod',
    license: 'Dominio publico / Internet Archive',
    runtimeMinutes: 75,
    approxSizeMb: 303
  },
  {
    id: 'ia-night-of-the-living-dead',
    title: 'Night of the Living Dead',
    year: 1968,
    genre: 'Terror',
    description: 'O marco de George A. Romero que definiu boa parte do cinema moderno de zumbis.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/Night.Of.The.Living.Dead_1080p',
    downloadUrl: 'https://archive.org/download/Night.Of.The.Living.Dead_1080p/NightOfTheLivingDead_720p_512kb.mp4',
    kind: 'movie',
    cover: 'https://archive.org/services/img/Night.Of.The.Living.Dead_1080p',
    banner: 'https://archive.org/services/img/Night.Of.The.Living.Dead_1080p',
    license: 'Dominio publico / Internet Archive',
    runtimeMinutes: 96,
    approxSizeMb: 388
  },
  {
    id: 'ia-the-general',
    title: 'The General',
    year: 1926,
    genre: 'Acao',
    description: 'Buster Keaton em um dos grandes filmes mudos de aventura e comedia fisica.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/TheGeneral',
    downloadUrl: 'https://archive.org/download/TheGeneral/The_General_512kb.mp4',
    kind: 'movie',
    cover: 'https://archive.org/services/img/TheGeneral',
    banner: 'https://archive.org/services/img/TheGeneral',
    license: 'Dominio publico / Internet Archive',
    runtimeMinutes: 78,
    approxSizeMb: 279
  },
  {
    id: 'ia-sita-sings-the-blues',
    title: 'Sita Sings the Blues',
    year: 2008,
    genre: 'Animacao',
    description: 'Longa animado independente de Nina Paley, distribuido com licenca livre.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/Sita_Sings_the_Blues',
    downloadUrl: 'https://archive.org/download/Sita_Sings_the_Blues/SITA_SINGS_MOVIE_ONLY.mp4',
    kind: 'movie',
    cover: 'https://archive.org/services/img/Sita_Sings_the_Blues',
    banner: 'https://archive.org/services/img/Sita_Sings_the_Blues',
    license: 'CC0 / Internet Archive',
    runtimeMinutes: 82,
    approxSizeMb: 485
  },
  {
    id: 'ia-charlie-chaplin-festival',
    title: 'Charlie Chaplin Festival',
    year: 1938,
    genre: 'Comedia',
    description: 'Coletanea de curtas de Chaplin para uma sessao leve de cinema classico.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/charlie_chaplin_film_fest',
    downloadUrl: 'https://archive.org/download/charlie_chaplin_film_fest/charlie_chaplin_film_fest_512kb.mp4',
    kind: 'movie',
    cover: 'https://archive.org/services/img/charlie_chaplin_film_fest',
    banner: 'https://archive.org/services/img/charlie_chaplin_film_fest',
    license: 'Dominio publico / Internet Archive',
    runtimeMinutes: 73,
    approxSizeMb: 322
  },
  {
    id: 'ia-jungle-book',
    title: 'Jungle Book',
    year: 1942,
    genre: 'Aventura',
    description: 'A versao classica em live action da obra de Kipling, com visual de aventura familiar.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/JungleBook',
    downloadUrl: 'https://archive.org/download/JungleBook/Jungle_Book_512kb.mp4',
    kind: 'movie',
    cover: 'https://archive.org/services/img/JungleBook',
    banner: 'https://archive.org/services/img/JungleBook',
    license: 'Dominio publico / Internet Archive',
    runtimeMinutes: 108,
    approxSizeMb: 436
  },
  {
    id: 'ia-fast-and-furious-1954',
    title: 'The Fast and the Furious',
    year: 1954,
    genre: 'Crime',
    description: 'Noir de corrida e fuga produzido por Roger Corman, sem relacao com a franquia moderna.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/TheFastandtheFuriousJohnIreland1954goofyrip',
    downloadUrl:
      'https://archive.org/download/TheFastandtheFuriousJohnIreland1954goofyrip/TheFastandtheFuriousJohnIreland1954goofyrip_512kb.mp4',
    kind: 'movie',
    cover: 'https://archive.org/services/img/TheFastandtheFuriousJohnIreland1954goofyrip',
    banner: 'https://archive.org/services/img/TheFastandtheFuriousJohnIreland1954goofyrip',
    license: 'Dominio publico / Internet Archive',
    runtimeMinutes: 73,
    approxSizeMb: 301
  },
  {
    id: 'ia-bonanza-trail-gang',
    title: 'Bonanza - The Trail Gang',
    year: 1960,
    genre: 'Serie / Faroeste',
    description: 'Episodio classico de faroeste televisivo, bom para testar o modo series.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/Bonanza_-_The_Trail_Gang',
    downloadUrl: 'https://archive.org/download/Bonanza_-_The_Trail_Gang/Bonanza_-_The_Trail_Gang_512kb.mp4',
    kind: 'episode',
    cover: 'https://archive.org/services/img/Bonanza_-_The_Trail_Gang',
    banner: 'https://archive.org/services/img/Bonanza_-_The_Trail_Gang',
    license: 'Dominio publico / Internet Archive',
    runtimeMinutes: 49,
    approxSizeMb: 205
  },
  {
    id: 'ia-lone-ranger-enter',
    title: 'The Lone Ranger - Enter the Lone Ranger',
    year: 1949,
    genre: 'Serie / Aventura',
    description: 'Primeiro episodio televisivo do Lone Ranger em copia preservada no Internet Archive.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/enter_the_lone_ranger',
    downloadUrl: 'https://archive.org/download/enter_the_lone_ranger/enter_the_lone_ranger_512kb.mp4',
    kind: 'episode',
    cover: 'https://archive.org/services/img/enter_the_lone_ranger',
    banner: 'https://archive.org/services/img/enter_the_lone_ranger',
    license: 'Dominio publico / Internet Archive',
    runtimeMinutes: 69,
    approxSizeMb: 278
  },
  {
    id: 'ia-sherlock-holmes-harry-crocker',
    title: 'Sherlock Holmes - The Case of Harry Crocker',
    year: 1954,
    genre: 'Serie / Misterio',
    description: 'Episodio da serie The Adventures of Sherlock Holmes de 1954.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/SherlockHolmes1954',
    downloadUrl:
      'https://archive.org/download/SherlockHolmes1954/Sherlock%20Holmes%2009%20The%20Case%20Of%20Harry%20Crocker.mp4',
    kind: 'episode',
    cover: 'https://archive.org/services/img/SherlockHolmes1954',
    banner: 'https://archive.org/services/img/SherlockHolmes1954',
    license: 'Dominio publico / Internet Archive',
    runtimeMinutes: 26,
    approxSizeMb: 72
  },
  {
    id: 'ia-lucy-meets-john-wayne',
    title: 'The Lucy Show - Lucy Meets John Wayne',
    year: 1966,
    genre: 'Serie / Comedia',
    description: 'Episodio de comedia televisiva com participacao de John Wayne.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/TLS_Lucy_Meets_John_Wayne',
    downloadUrl: 'https://archive.org/download/TLS_Lucy_Meets_John_Wayne/TLS_Lucy_Meets_John_Wayne_512kb.mp4',
    kind: 'episode',
    cover: 'https://archive.org/services/img/TLS_Lucy_Meets_John_Wayne',
    banner: 'https://archive.org/services/img/TLS_Lucy_Meets_John_Wayne',
    license: 'Dominio publico / Internet Archive',
    runtimeMinutes: 25,
    approxSizeMb: 105
  },
  {
    id: 'ia-space-1999-voyagers-return',
    title: "Space 1999 - Voyager's Return",
    year: 1975,
    genre: 'Serie / Ficcao cientifica',
    description: 'Episodio de ficcao cientifica setentista, catalogado como serie classica.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/Space1999.Series1',
    downloadUrl:
      "https://archive.org/download/Space1999.Series1/Space%201999%20S01E06%20Voyager%27s%20Return.mp4",
    kind: 'episode',
    cover: 'https://archive.org/services/img/Space1999.Series1',
    banner: 'https://archive.org/services/img/Space1999.Series1',
    license: 'Internet Archive',
    runtimeMinutes: 50,
    approxSizeMb: 332
  },
  {
    id: 'ia-about-bananas',
    title: 'About Bananas',
    year: 1935,
    genre: 'Documentario',
    description: 'Curta documental industrial sobre producao, transporte e consumo de bananas.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/AboutBan1935',
    downloadUrl: 'https://archive.org/download/AboutBan1935/AboutBan1935_512kb.mp4',
    kind: 'documentary',
    cover: 'https://archive.org/services/img/AboutBan1935',
    banner: 'https://archive.org/services/img/AboutBan1935',
    license: 'Prelinger Archives / Internet Archive',
    runtimeMinutes: 11,
    approxSizeMb: 44
  },
  {
    id: 'ia-duck-and-cover',
    title: 'Duck and Cover',
    year: 1951,
    genre: 'Documentario',
    description: 'Filme educacional historico da era nuclear, hoje usado como documento cultural.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/DuckandC1951',
    downloadUrl: 'https://archive.org/download/DuckandC1951/DuckandC1951_512kb.mp4',
    kind: 'documentary',
    cover: 'https://archive.org/services/img/DuckandC1951',
    banner: 'https://archive.org/services/img/DuckandC1951',
    license: 'Prelinger Archives / Internet Archive',
    runtimeMinutes: 9,
    approxSizeMb: 37
  },
  {
    id: 'ia-health-your-posture',
    title: 'Health: Your Posture',
    year: 1953,
    genre: 'Documentario',
    description: 'Curta educativo vintage sobre postura e habitos corporais.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/HealthYo1953',
    downloadUrl: 'https://archive.org/download/HealthYo1953/HealthYo1953_512kb.mp4',
    kind: 'documentary',
    cover: 'https://archive.org/services/img/HealthYo1953',
    banner: 'https://archive.org/services/img/HealthYo1953',
    license: 'Prelinger Archives / Internet Archive',
    runtimeMinutes: 10,
    approxSizeMb: 43
  },
  {
    id: 'ia-doctor-in-industry',
    title: 'Doctor in Industry',
    year: 1946,
    genre: 'Documentario',
    description: 'Documentario industrial sobre medicina, saude ocupacional e fabrica.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/Doctorin1946',
    downloadUrl: 'https://archive.org/download/Doctorin1946/Doctorin1946_512kb.mp4',
    kind: 'documentary',
    cover: 'https://archive.org/services/img/Doctorin1946',
    banner: 'https://archive.org/services/img/Doctorin1946',
    license: 'Prelinger Archives / Internet Archive',
    runtimeMinutes: 19,
    approxSizeMb: 76
  },
  {
    id: 'ia-voyage-prehistoric-women',
    title: 'Voyage to the Planet of Prehistoric Women',
    year: 1968,
    genre: 'Ficcao cientifica',
    description: 'Ficcao cientifica exploitation com visual espacial e aventura pulp.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/VoyagetothePlanetofPrehistoricWomen',
    downloadUrl:
      'https://archive.org/download/VoyagetothePlanetofPrehistoricWomen/VoyagetothePlanetofPrehistoricWomen_512kb.mp4',
    kind: 'movie',
    cover: 'https://archive.org/services/img/VoyagetothePlanetofPrehistoricWomen',
    banner: 'https://archive.org/services/img/VoyagetothePlanetofPrehistoricWomen',
    license: 'Dominio publico / Internet Archive',
    runtimeMinutes: 78,
    approxSizeMb: 331
  },
  {
    id: 'ia-popeye-for-president',
    title: 'Popeye for President',
    year: 1956,
    genre: 'Animacao',
    description: 'Curta animado do Popeye em clima de campanha presidencial.',
    source: 'internet-archive',
    sourceUrl: 'https://archive.org/details/Popeye_forPresident',
    downloadUrl: 'https://archive.org/download/Popeye_forPresident/Popeye_forPresident_512kb.mp4',
    kind: 'movie',
    cover: 'https://archive.org/services/img/Popeye_forPresident',
    banner: 'https://archive.org/services/img/Popeye_forPresident',
    license: 'Dominio publico / Internet Archive',
    runtimeMinutes: 6,
    approxSizeMb: 26
  }
]

const activeDownloads = new Map<string, { ctrl: AbortController; cancelled: boolean }>()

export function listMedia(): MediaLibraryFileLike {
  return mediaStore.load()
}

export function listWatchedMedia(): MediaWatchedFile {
  return watchedMediaStore.load()
}

export async function scanMediaLibrary(options: { fresh?: boolean } = {}): Promise<MediaScanResult> {
  const started = Date.now()
  const settings = settingsStore.load()
  const previous = options.fresh ? new Map<string, MediaItem>() : indexPrevious()
  const errors: string[] = []
  const found: MediaItem[] = []

  const excluded = new Set((mediaStore.load().excludedPaths ?? []).map((p) => p.toLowerCase()))
  for (const root of settings.media.mediaRoots) {
    if (!existsSync(root)) {
      errors.push(`Pasta nao encontrada: ${root}`)
      continue
    }
    walkVideos(root, 6, errors, (path) => {
      if (excluded.has(path.toLowerCase())) return
      const item = classifyMedia(path, previous)
      if (item) found.push(item)
    })
  }

  const merged = dedupeByPath(found)
  mediaStore.save(merged)
  await enrichMediaItems(merged.map((item) => item.id))
  const resultItems = mediaStore.load().items
  log.info('cinema', `media scan complete: ${resultItems.length} item(s)`)
  return { items: resultItems, durationMs: Date.now() - started, errors }
}

export async function enrichMediaItems(
  ids?: string[],
  options: { force?: boolean } = {}
): Promise<{ updated: number; skipped: number }> {
  const data = mediaStore.load()
  const wanted = new Set(ids ?? data.items.map((item) => item.id))
  let updated = 0
  let skipped = 0
  for (const item of data.items) {
    if (!wanted.has(item.id)) continue
    const art = await resolveArtwork(item)
    if (art.cover || art.banner || art.description || art.year || art.genre) {
      const currentCover = preferredCurrentArtwork(item, 'cover')
      const currentBanner = preferredCurrentArtwork(item, 'banner')
      const patch: Partial<MediaItem> = {
        cover: pickArtwork(currentCover, art.cover, options.force === true),
        banner: pickArtwork(currentBanner, art.banner, options.force === true),
        description: options.force ? art.description ?? item.description : item.description ?? art.description,
        year: options.force ? art.year ?? item.year : item.year ?? art.year,
        genre: options.force ? art.genre ?? item.genre : item.genre ?? art.genre
      }
      mediaStore.patchItem(item.id, {
        ...patch
      })
      updated++
    } else {
      skipped++
    }
  }
  return { updated, skipped }
}

function pickArtwork(current: string | undefined, candidate: string | undefined, force: boolean): string | undefined {
  if (!force) return current ?? candidate
  if (!candidate) return current
  if (isGeneratedAssetUrl(candidate) && current && !isGeneratedAssetUrl(current)) return current
  return candidate
}

function preferredCurrentArtwork(item: MediaItem, kind: 'cover' | 'banner'): string | undefined {
  const existing = kind === 'cover' ? item.cover : item.banner
  if (existing && !isGeneratedAssetUrl(existing)) return existing
  const cached = cachedArtworkUrl(item.id, kind)
  return cached ?? existing
}

function cachedArtworkUrl(id: string, kind: 'cover' | 'banner'): string | undefined {
  const suffix = kind === 'cover' ? '' : '_banner'
  for (const ext of IMAGE_EXTENSIONS) {
    const fileName = `media_${id}${suffix}${ext}`
    const filePath = join(kind === 'cover' ? PATHS.covers : PATHS.banners, fileName)
    if (existsSync(filePath)) return kind === 'cover' ? coverUrl(fileName) : bannerUrl(fileName)
  }
  return undefined
}

function isGeneratedAssetUrl(value: string | undefined): boolean {
  return Boolean(value && /_generated(?:_banner)?\.(svg|png|jpg|jpeg|webp)$/i.test(value))
}

export async function refreshMediaArtwork(ids?: string[]): Promise<{ updated: number; skipped: number }> {
  return enrichMediaItems(ids, { force: true })
}

export function recordMediaWatch(input: MediaWatchInput): MediaWatchRecord | { error: string } {
  const item = mediaStore.load().items.find((entry) => entry.id === input.itemId)
  if (!item) return { error: 'Midia nao encontrada.' }

  const now = new Date().toISOString()
  const duration = positiveNumber(input.durationSeconds)
  const position = positiveNumber(input.positionSeconds)
  const progressPercent =
    duration && position ? Math.min(100, Math.max(0, Math.round((position / duration) * 100))) : undefined
  const completed = input.completed ?? (progressPercent !== undefined && progressPercent >= 88)
  const data = watchedMediaStore.load()
  const existing = data.records.find((record) => record.mediaId === item.id)
  const record: MediaWatchRecord = {
    id: existing?.id ?? item.id,
    mediaId: item.id,
    title: item.title,
    path: item.path,
    kind: item.kind,
    cover: item.cover,
    banner: item.banner,
    description: item.description,
    year: item.year,
    genre: item.genre,
    source: item.source,
    sourceUrl: item.sourceUrl,
    firstWatchedAt: existing?.firstWatchedAt ?? now,
    lastWatchedAt: now,
    watchCount: Math.max(1, existing?.watchCount ?? 1),
    durationSeconds: duration ?? existing?.durationSeconds,
    lastPositionSeconds: position ?? existing?.lastPositionSeconds,
    progressPercent: progressPercent ?? existing?.progressPercent,
    completed: existing?.completed || completed,
    archivedBecauseMissing: !existsSync(item.path)
  }
  watchedMediaStore.upsert(record)
  mediaStore.patchItem(item.id, {
    lastWatchedAt: now,
    watchTime: Math.max(item.watchTime ?? 0, Math.floor(position ?? 0))
  })
  return record
}

/**
 * Toggle the "Minha lista" / watchlist bit on a media item. We piggyback on
 * the existing `favorite` field — the Cinema UI surfaces it as a Netflix-style
 * watchlist row, while the field name keeps storage compatibility.
 */
/**
 * Drop a media entry from the local library. If `deleteFile` is set and the
 * file lives under one of our managed download roots, we also try to unlink
 * it from disk — outside those roots we deliberately keep the file in place
 * (it might be the user's own collection in another folder).
 */
export async function removeMediaFromLibrary(
  id: string,
  options: { deleteFile?: boolean } = {}
): Promise<{ ok: true; deletedFile: boolean } | { error: string }> {
  const item = mediaStore.load().items.find((entry) => entry.id === id)
  if (!item) return { error: 'Mídia não encontrada.' }

  const removed = mediaStore.removeItem(id)
  if (!removed) return { error: 'Falha ao remover entrada da biblioteca.' }

  // Remember the path so a rescan does not re-add the same file. The user
  // explicitly excluded it — surprise re-import would be obnoxious.
  if (item.path) mediaStore.exclude(item.path)

  // Also purge watch history record so a deleted item doesn't ghost-resurface
  // in "Continuar assistindo" later.
  watchedMediaStore.removeByMediaId(id)

  let deletedFile = false
  if (options.deleteFile && item.path && existsSync(item.path)) {
    const managed = item.path.startsWith(PATHS.mediaDownloads)
    if (managed) {
      try {
        const { rmSync } = await import('node:fs')
        rmSync(item.path, { force: true })
        deletedFile = true
      } catch (err) {
        log.warn('cinema', `failed to delete ${item.path}: ${String(err)}`)
      }
    }
  }
  return { ok: true, deletedFile }
}

export function toggleMediaFavorite(id: string): MediaItem | { error: string } {
  const item = mediaStore.load().items.find((entry) => entry.id === id)
  if (!item) return { error: 'Midia nao encontrada.' }
  const next = mediaStore.patchItem(id, { favorite: !item.favorite })
  return next ?? { error: 'Falha ao salvar favorito.' }
}

/**
 * Mark an item as completed/uncompleted without going through the player.
 * Used by the "marcar como visto" quick-action on cards.
 */
export function setMediaWatchedState(
  id: string,
  completed: boolean
): MediaWatchRecord | { error: string } {
  const item = mediaStore.load().items.find((entry) => entry.id === id)
  if (!item) return { error: 'Midia nao encontrada.' }
  const now = new Date().toISOString()
  const data = watchedMediaStore.load()
  const existing = data.records.find((record) => record.mediaId === item.id)
  const record: MediaWatchRecord = {
    id: existing?.id ?? item.id,
    mediaId: item.id,
    title: item.title,
    path: item.path,
    kind: item.kind,
    cover: item.cover,
    banner: item.banner,
    description: item.description,
    year: item.year,
    genre: item.genre,
    source: item.source,
    sourceUrl: item.sourceUrl,
    firstWatchedAt: existing?.firstWatchedAt ?? now,
    lastWatchedAt: now,
    watchCount: Math.max(1, existing?.watchCount ?? 1),
    durationSeconds: existing?.durationSeconds,
    lastPositionSeconds: completed ? existing?.durationSeconds ?? existing?.lastPositionSeconds : 0,
    progressPercent: completed ? 100 : 0,
    completed,
    archivedBecauseMissing: !existsSync(item.path)
  }
  watchedMediaStore.upsert(record)
  return record
}

/**
 * Remove an item from "Continuar assistindo" by wiping its watch record.
 * Used by the small "x" badge on in-progress cards.
 */
export function clearMediaWatch(id: string): { ok: true } | { error: string } {
  const item = mediaStore.load().items.find((entry) => entry.id === id)
  if (!item) return { error: 'Midia nao encontrada.' }
  watchedMediaStore.removeByMediaId(id)
  return { ok: true }
}

export async function exportWatchedMediaBackup(): Promise<{ ok: true; path: string } | { error: string }> {
  const browserWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showSaveDialog(browserWindow, {
    title: 'Salvar backup de assistidos',
    defaultPath: join(homedir(), `gamehub-cinema-assistidos-${new Date().toISOString().slice(0, 10)}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return { error: 'Backup cancelado.' }
  await writeFile(result.filePath, JSON.stringify(watchedMediaStore.load(), null, 2), 'utf8')
  return { ok: true, path: result.filePath }
}

export async function openMedia(id: string): Promise<{ ok: true } | { error: string }> {
  const item = mediaStore.load().items.find((entry) => entry.id === id)
  if (!item) return { error: 'Midia nao encontrada.' }
  if (!existsSync(item.path)) return { error: `Arquivo nao encontrado: ${item.path}` }
  const result = await shell.openPath(item.path)
  if (result) return { error: result }
  mediaStore.patchItem(id, { lastWatchedAt: new Date().toISOString() })
  return { ok: true }
}

export async function generateAutoSubtitles(input: AutoSubtitleInput): Promise<AutoSubtitleResult> {
  const item = mediaStore.load().items.find((entry) => entry.id === input.itemId)
  if (!item) {
    return { ok: false, generated: [], errors: ['Midia nao encontrada.'] }
  }
  if (!existsSync(item.path)) {
    return { ok: false, generated: [], errors: [`Arquivo nao encontrado: ${item.path}`] }
  }

  const tool = await detectWhisperTool()
  if (!tool) {
    return {
      ok: false,
      generated: [],
      errors: ['Whisper local nao encontrado no PATH.'],
      installHint: WHISPER_INSTALL_HINT
    }
  }

  const requestedLanguages: AutoSubtitleLanguage[] =
    input.languages.length > 0 ? input.languages : ['pt-BR', 'en']
  const languages = Array.from(new Set<AutoSubtitleLanguage>(requestedLanguages))
  const generated: MediaSubtitle[] = []
  const errors: string[] = []
  for (const language of languages) {
    const result = await runWhisperSubtitle(item, language, tool)
    if ('error' in result) {
      errors.push(result.error)
    } else {
      generated.push(result.subtitle)
    }
  }

  const refreshed = refreshItemSubtitles(item.id)
  return {
    ok: generated.length > 0,
    item: refreshed ?? item,
    generated,
    errors,
    tool: tool.label,
    installHint: generated.length > 0 ? undefined : WHISPER_INSTALL_HINT
  }
}

export async function startMediaDownload(
  entryId: string
): Promise<{ id: string } | { error: string }> {
  const entry = MEDIA_CATALOG.find((item) => item.id === entryId)
  if (!entry) return { error: 'Filme nao encontrado no catalogo.' }
  const id = randomUUID().slice(0, 8)
  const ctrl = new AbortController()
  activeDownloads.set(id, { ctrl, cancelled: false })
  void runMediaDownload(id, entry, ctrl).finally(() => {
    setTimeout(() => activeDownloads.delete(id), 30_000)
  })
  return { id }
}

export function cancelMediaDownload(id: string): { ok: boolean } {
  const active = activeDownloads.get(id)
  if (!active) return { ok: false }
  active.cancelled = true
  active.ctrl.abort()
  return { ok: true }
}

async function runMediaDownload(
  id: string,
  entry: MediaCatalogEntry,
  ctrl: AbortController
): Promise<void> {
  const settings = settingsStore.load()
  const destDir = settings.media.downloadRoot || PATHS.mediaDownloads
  await mkdir(destDir, { recursive: true })
  const filePath = join(destDir, filenameFromUrl(entry.downloadUrl, entry.title))
  publishDownload({
    id,
    entryId: entry.id,
    title: entry.title,
    state: 'starting',
    received: 0,
    speed: 0
  })

  try {
    const r = await fetch(entry.downloadUrl, { signal: ctrl.signal })
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status} ${r.statusText}`)
    const total = Number(r.headers.get('content-length')) || undefined
    const reader = r.body.getReader()
    const stream = createWriteStream(filePath)
    let received = 0
    let lastEmit = 0
    let lastBytes = 0
    let lastTime = Date.now()
    let speed = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (activeDownloads.get(id)?.cancelled) {
        stream.close()
        await unlink(filePath).catch(() => {})
        publishDownload({ id, entryId: entry.id, title: entry.title, state: 'cancelled', received, total, speed: 0 })
        return
      }
      stream.write(Buffer.from(value))
      received += value.length
      const now = Date.now()
      if (now - lastEmit > 500) {
        const elapsedSec = (now - lastTime) / 1000
        speed = elapsedSec > 0 ? (received - lastBytes) / elapsedSec : 0
        lastBytes = received
        lastTime = now
        lastEmit = now
        publishDownload({
          id,
          entryId: entry.id,
          title: entry.title,
          state: 'downloading',
          received,
          total,
          speed
        })
      }
    }
    stream.end()
    await new Promise<void>((resolveDone, reject) => {
      stream.on('finish', () => resolveDone())
      stream.on('error', reject)
    })
    const st = await stat(filePath)
    const item = await registerCatalogItem(entry, filePath, st.size)
    publishDownload({
      id,
      entryId: entry.id,
      title: entry.title,
      state: 'finished',
      received: st.size,
      total: st.size,
      speed: 0,
      filePath,
      item
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await unlink(filePath).catch(() => {})
    log.error('cinema', `download failed: ${msg}`)
    publishDownload({ id, entryId: entry.id, title: entry.title, state: 'failed', received: 0, speed: 0, error: msg })
  }
}

async function registerCatalogItem(
  entry: MediaCatalogEntry,
  filePath: string,
  sizeBytes: number
): Promise<MediaItem> {
  const id = mediaId(filePath)
  const existing = mediaStore.load().items.find((item) => item.id === id)
  const item: MediaItem = {
    id,
    title: entry.title,
    path: filePath,
    kind: entry.kind,
    sizeBytes,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    lastWatchedAt: existing?.lastWatchedAt,
    watchTime: existing?.watchTime ?? 0,
    favorite: existing?.favorite ?? false,
    cover: existing?.cover,
    banner: existing?.banner,
    description: entry.description,
    year: entry.year,
    genre: entry.genre,
    source: 'internet-archive',
    sourceUrl: entry.sourceUrl,
    subtitles: [],
    relatedFiles: [entry.downloadUrl],
    tags: ['livre', 'internet-archive']
  }
  mediaStore.addItem(item)
  await enrichMediaItems([id])
  return mediaStore.load().items.find((candidate) => candidate.id === id) ?? item
}

function classifyMedia(path: string, previous: Map<string, MediaItem>): MediaItem | null {
  let st
  try {
    st = statSync(path)
  } catch {
    return null
  }
  const id = mediaId(path)
  const prev = previous.get(id)
  const rawTitle = bestMediaTitle(path)
  const { title, year } = cleanMediaTitle(rawTitle)
  const kind = inferKind(path, title)
  const item: MediaItem = {
    id,
    title: prev?.title ?? title,
    path,
    kind,
    sizeBytes: st.size,
    addedAt: prev?.addedAt ?? new Date().toISOString(),
    lastWatchedAt: prev?.lastWatchedAt,
    watchTime: prev?.watchTime ?? 0,
    favorite: prev?.favorite ?? false,
    cover: prev?.cover,
    banner: prev?.banner,
    description: prev?.description,
    year: prev?.year ?? year,
    genre: prev?.genre,
    source: prev?.source ?? 'local',
    sourceUrl: prev?.sourceUrl,
    subtitles: detectSubtitles(path, settingsStore.load().media.preferredSubtitleLanguage),
    relatedFiles: [],
    tags: prev?.tags
  }
  return item
}

function walkVideos(
  dir: string,
  depth: number,
  errors: string[],
  onVideo: (path: string) => void
): void {
  if (depth < 0) return
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    errors.push(`Falha ao ler ${dir}: ${String(err)}`)
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) walkVideos(full, depth - 1, errors, onVideo)
      continue
    }
    if (VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase())) onVideo(full)
  }
}

export function subtitleAsVtt(itemId: string, subtitleId: string): string | null {
  const item = mediaStore.load().items.find((entry) => entry.id === itemId)
  const subtitle = item?.subtitles.find((entry) => entry.id === subtitleId)
  if (!subtitle || !existsSync(subtitle.path)) return null
  try {
    const raw = readdirSafeText(subtitle.path)
    if (subtitle.format === 'vtt') {
      return raw.trimStart().startsWith('WEBVTT') ? raw : `WEBVTT\n\n${raw}`
    }
    return srtToVtt(raw)
  } catch {
    return null
  }
}

async function resolveArtwork(item: MediaItem): Promise<Partial<MediaItem>> {
  const local = copyLocalArtwork(item)
  if (local.cover && local.banner) return local
  if (local.cover || local.banner) return fillMissingArtwork(item, local)

  const catalog = MEDIA_CATALOG.find((entry) => normalize(entry.title) === normalize(item.title))
  if (catalog) {
    return fillMissingArtwork(item, await downloadArtwork(item.id, catalog.cover, catalog.banner))
  }

  const tv = item.kind === 'episode' || item.kind === 'series' ? await fetchTvMazeMedia(item) : {}
  if (tv.cover && tv.banner) return tv
  if (tv.cover || tv.banner) return fillMissingArtwork(item, tv)

  const store = await fetchItunesMedia(item)
  if (store.cover && store.banner) return store
  if (store.cover || store.banner) return fillMissingArtwork(item, store)

  const wiki = await fetchWikipediaMedia(item)
  if (wiki.cover && wiki.banner) return wiki
  if (wiki.cover || wiki.banner) return fillMissingArtwork(item, wiki)
  const generated = await generateFallbackArtwork(item)
  if (wiki.description || wiki.year || wiki.genre) return { ...generated, ...wiki }
  return generated
}

async function fillMissingArtwork(
  item: MediaItem,
  art: Partial<MediaItem>
): Promise<Partial<MediaItem>> {
  if (art.cover && art.banner) return art
  const generated = await generateFallbackArtwork(item)
  return {
    ...art,
    cover: art.cover ?? generated.cover,
    banner: art.banner ?? generated.banner
  }
}

function copyLocalArtwork(item: MediaItem): Pick<MediaItem, 'cover' | 'banner'> {
  const cover = findSidecarImage(item)
  if (!cover) return {}
  const ext = extname(cover).toLowerCase().replace('.', '') || 'jpg'
  const coverName = `media_${item.id}.${ext}`
  const bannerName = `media_${item.id}_banner.${ext}`
  try {
    copyFileSync(cover, join(PATHS.covers, coverName))
    copyFileSync(cover, join(PATHS.banners, bannerName))
    return { cover: coverUrl(coverName), banner: bannerUrl(bannerName) }
  } catch (err) {
    log.warn('cinema', `failed to copy sidecar art for ${item.title}: ${String(err)}`)
    return {}
  }
}

async function fetchWikipediaMedia(item: MediaItem): Promise<Partial<MediaItem>> {
  let bestMeta: Partial<MediaItem> = {}
  for (const locale of ['pt', 'en'] as const) {
    const page = await findWikipediaPage(item, locale)
    if (!page) continue
    try {
      const r = await fetch(`https://${locale}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`)
      if (!r.ok) continue
      const data = (await r.json()) as {
        title?: string
        extract?: string
        thumbnail?: { source?: string }
        originalimage?: { source?: string }
      }
      const image = data.thumbnail?.source ?? data.originalimage?.source
      const art = await downloadArtwork(item.id, image, image)
      const result: Partial<MediaItem> = {
        ...art,
        description: data.extract,
        year: item.year
      }
      if (result.cover || result.banner) return result
      if (result.description && !bestMeta.description) bestMeta.description = result.description
    } catch {
      // continue trying next locale
    }
  }
  return bestMeta
}

async function fetchItunesMedia(item: MediaItem): Promise<Partial<MediaItem>> {
  const term = searchTitleForArtwork(item)
  const entity = item.kind === 'episode' || item.kind === 'series' ? 'tvSeason' : 'movie'
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=${entity === 'movie' ? 'movie' : 'tvShow'}&entity=${entity}&limit=8`
  try {
    const r = await fetch(url)
    if (!r.ok) return {}
    const data = (await r.json()) as {
      results?: Array<{
        trackName?: string
        collectionName?: string
        artistName?: string
        artworkUrl100?: string
        longDescription?: string
        shortDescription?: string
        primaryGenreName?: string
        releaseDate?: string
      }>
    }
    const best = (data.results ?? [])
      .map((result) => ({
        result,
        candidate: result.trackName ?? result.collectionName ?? result.artistName ?? '',
        score: titleScore(term, result.trackName ?? result.collectionName ?? result.artistName ?? '')
      }))
      .filter(({ candidate, score }) => score >= 0.6 && isTitleCompatible(term, candidate))
      .sort((a, b) => b.score - a.score)[0]?.result
    if (!best?.artworkUrl100) return {}
    const releaseYear = best.releaseDate ? Number(best.releaseDate.slice(0, 4)) : undefined
    if (item.year && releaseYear && Math.abs(item.year - releaseYear) > 2) return {}
    const image = best.artworkUrl100.replace(/100x100bb\.(jpg|png|webp)$/i, '600x900bb.$1')
    const art = await downloadArtwork(item.id, image, image)
    return {
      ...art,
      description: best.longDescription ?? best.shortDescription,
      year: item.year ?? releaseYear,
      genre: best.primaryGenreName
    }
  } catch {
    return {}
  }
}

async function fetchTvMazeMedia(item: MediaItem): Promise<Partial<MediaItem>> {
  const term = searchTitleForArtwork(item)
  const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(term)}`
  try {
    const r = await fetch(url)
    if (!r.ok) return {}
    const data = (await r.json()) as Array<{
      show?: {
        name?: string
        summary?: string
        premiered?: string
        genres?: string[]
        image?: { medium?: string; original?: string }
      }
    }>
    const best = data
      .map(({ show }) => ({
        show,
        score: titleScore(term, show?.name ?? '')
      }))
      .filter(({ show, score }) => show?.image && score >= 0.62 && isTitleCompatible(term, show?.name ?? ''))
      .sort((a, b) => b.score - a.score)[0]?.show
    const image = best?.image?.original ?? best?.image?.medium
    if (!best || !image) return {}
    const releaseYear = best.premiered ? Number(best.premiered.slice(0, 4)) : undefined
    const art = await downloadArtwork(item.id, image, image)
    return {
      ...art,
      description: stripHtml(best.summary),
      year: item.year ?? releaseYear,
      genre: best.genres?.slice(0, 2).join(', ')
    }
  } catch {
    return {}
  }
}

async function findWikipediaPage(item: Pick<MediaItem, 'title' | 'path' | 'kind' | 'year'>, locale: 'pt' | 'en'): Promise<string | null> {
  const term = searchTitleForArtwork(item)
  const subject = item.kind === 'movie' ? (locale === 'pt' ? 'filme' : 'film') : locale === 'pt' ? 'serie' : 'series'
  const queries = [
    `${term}${item.year ? ` ${item.year}` : ''} ${subject}`.trim(),
    `${term}${item.year ? ` ${item.year}` : ''}`.trim(),
    term
  ]
  for (const query of queries) {
    const url = `https://${locale}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`
    try {
      const r = await fetch(url)
      if (!r.ok) continue
      const data = (await r.json()) as { query?: { search?: Array<{ title: string; snippet?: string }> } }
      const match = (data.query?.search ?? []).find((entry) => {
        const text = `${entry.title} ${stripHtml(entry.snippet) ?? ''}`.trim()
        const score = titleScore(term, text)
        return score >= 0.5 && isTitleCompatible(term, text)
      })
      if (match?.title) return match.title
    } catch {
      // try next query
    }
  }
  return null
}

function searchTitleForArtwork(item: Pick<MediaItem, 'title' | 'path' | 'kind'>): string {
  if (item.kind === 'episode') {
    const fromTitle = item.title.replace(/\bS\d{1,2}E\d{1,2}\b.*$/i, '').trim()
    if (fromTitle && fromTitle !== item.title) return cleanMediaTitle(fromTitle).title
    const parent = basename(dirname(item.path))
    if (parent && !/^(season|temporada|s\d{1,2})$/i.test(parent)) return cleanMediaTitle(parent).title
    const grandParent = basename(dirname(dirname(item.path)))
    if (grandParent) return cleanMediaTitle(grandParent).title
  }
  return cleanMediaTitle(item.title).title
}

function titleScore(expected: string, candidate: string): number {
  const a = normalize(expected)
  const b = normalize(candidate)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.82
  const aTokens = new Set(a.split(' ').filter(Boolean))
  const bTokens = new Set(b.split(' ').filter(Boolean))
  const overlap = Array.from(aTokens).filter((token) => bTokens.has(token)).length
  return overlap / Math.max(aTokens.size, bTokens.size)
}

function isTitleCompatible(expected: string, candidate: string): boolean {
  const expectedTokens = tokenizeTitle(expected)
  const candidateTokens = new Set(tokenizeTitle(candidate))
  if (expectedTokens.length === 0 || candidateTokens.size === 0) return false
  const overlap = expectedTokens.filter((token) => candidateTokens.has(token))
  const longOverlap = overlap.filter((token) => token.length >= 4).length
  if (longOverlap === 0) return false
  if (expectedTokens.length >= 4 && overlap.length < 2) return false
  return true
}

function tokenizeTitle(value: string): string[] {
  return normalize(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !['the', 'and', 'dos', 'das', 'de', 'do', 'da', 'a', 'o', 'no', 'na'].includes(token))
}

function stripHtml(value?: string): string | undefined {
  return value?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function downloadArtwork(
  id: string,
  coverSource?: string,
  bannerSource?: string
): Promise<Pick<MediaItem, 'cover' | 'banner'>> {
  const out: Pick<MediaItem, 'cover' | 'banner'> = {}
  if (coverSource) {
    const ext = imageExt(coverSource)
    const name = `media_${id}.${ext}`
    if (await fetchToFile(coverSource, join(PATHS.covers, name), 'cover')) out.cover = coverUrl(name)
  }
  if (bannerSource) {
    const ext = imageExt(bannerSource)
    const name = `media_${id}_banner.${ext}`
    if (await fetchToFile(bannerSource, join(PATHS.banners, name), 'banner')) out.banner = bannerUrl(name)
  }
  return out
}

async function fetchToFile(url: string, dest: string, kind: 'cover' | 'banner'): Promise<boolean> {
  try {
    const r = await fetch(url)
    if (!r.ok) return false
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length === 0) return false
    if (!isExpectedArtworkShape(buf, kind)) return false
    mkdirSync(dirname(dest), { recursive: true })
    await writeFile(dest, buf)
    return true
  } catch {
    return false
  }
}

function isExpectedArtworkShape(buf: Buffer, kind: 'cover' | 'banner'): boolean {
  try {
    const image = nativeImage.createFromBuffer(buf)
    const size = image.getSize()
    if (!size.width || !size.height) return true
    if (size.width < 120 || size.height < 120) return false
    const ratio = size.width / size.height
    if (kind === 'cover') {
      if (size.height < 220) return false
      return ratio <= 1.25
    }
    if (size.width < 320) return false
    return ratio >= 0.9
  } catch {
    return true
  }
}

async function generateFallbackArtwork(item: MediaItem): Promise<Pick<MediaItem, 'cover' | 'banner'>> {
  const colors = paletteFor(item.title)
  const title = escapeXml(item.title)
  const meta = escapeXml([kindLabel(item.kind), item.year].filter(Boolean).join(' - '))
  const coverName = `media_${item.id}_generated.svg`
  const bannerName = `media_${item.id}_generated_banner.svg`
  const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${colors[0]}"/><stop offset="0.55" stop-color="${colors[1]}"/><stop offset="1" stop-color="#05060a"/></linearGradient></defs>
<rect width="600" height="900" fill="url(#g)"/>
<rect x="28" y="28" width="544" height="844" rx="26" fill="none" stroke="rgba(255,255,255,0.20)" stroke-width="2"/>
<circle cx="500" cy="110" r="92" fill="rgba(255,255,255,0.10)"/>
<text x="54" y="98" fill="rgba(255,255,255,0.72)" font-family="Arial, sans-serif" font-size="24" font-weight="700">${meta}</text>
<foreignObject x="54" y="242" width="492" height="420"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;font-size:58px;line-height:1.02;font-weight:800;color:white;word-break:break-word;">${title}</div></foreignObject>
<text x="54" y="808" fill="rgba(255,255,255,0.56)" font-family="Arial, sans-serif" font-size="22">GAMEHUB CINEMA</text>
</svg>`
  const bannerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0"><stop stop-color="${colors[0]}"/><stop offset="0.48" stop-color="${colors[1]}"/><stop offset="1" stop-color="#05060a"/></linearGradient></defs>
<rect width="1600" height="900" fill="url(#g)"/>
<circle cx="1320" cy="150" r="220" fill="rgba(255,255,255,0.08)"/>
<rect x="80" y="92" width="1440" height="716" rx="34" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>
<text x="112" y="184" fill="rgba(255,255,255,0.64)" font-family="Arial, sans-serif" font-size="30" font-weight="700">${meta}</text>
<foreignObject x="112" y="278" width="950" height="330"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;font-size:78px;line-height:1.02;font-weight:850;color:white;word-break:break-word;">${title}</div></foreignObject>
<text x="112" y="730" fill="rgba(255,255,255,0.52)" font-family="Arial, sans-serif" font-size="24">GAMEHUB CINEMA</text>
</svg>`
  await writeFile(join(PATHS.covers, coverName), coverSvg, 'utf8')
  await writeFile(join(PATHS.banners, bannerName), bannerSvg, 'utf8')
  return { cover: coverUrl(coverName), banner: bannerUrl(bannerName) }
}

function findSidecarImage(item: Pick<MediaItem, 'path' | 'title' | 'kind'>): string | null {
  const videoDir = dirname(item.path)
  const dirs: string[] = [videoDir]
  const parentDir = dirname(videoDir)
  if (parentDir && parentDir !== videoDir) dirs.push(parentDir)
  if (item.kind === 'episode') {
    const grandParent = dirname(parentDir)
    if (grandParent && grandParent !== parentDir) dirs.push(grandParent)
  }
  const uniqueDirs = Array.from(new Set(dirs))

  for (const dir of uniqueDirs) {
    for (const name of COVER_NAMES) {
      for (const ext of IMAGE_EXTENSIONS) {
        const candidate = join(dir, `${name}${ext}`)
        if (existsSync(candidate)) return candidate
      }
    }
    try {
      const images = readdirSync(dir).filter((file) => IMAGE_EXTENSIONS.includes(extname(file).toLowerCase()))
      if (images.length === 1) {
        const only = join(dir, images[0])
        if (scoreLocalCoverCandidate(item, only) >= 8) return only
      }
    } catch {
      // optional dir
    }
  }

  const scored: Array<{ path: string; score: number }> = []
  for (const dir of uniqueDirs) {
    let files: string[] = []
    try {
      files = readdirSync(dir).filter((file) => IMAGE_EXTENSIONS.includes(extname(file).toLowerCase()))
    } catch {
      continue
    }
    for (const file of files) {
      const full = join(dir, file)
      const score = scoreLocalCoverCandidate(item, full)
      if (score > 0) scored.push({ path: full, score })
    }
  }
  if (scored.length === 0) return null
  scored.sort((a, b) => b.score - a.score)
  if (scored[0].score >= 40) return scored[0].path
  if (scored[0].score >= 18) return scored[0].path
  return null
}

function scoreLocalCoverCandidate(item: Pick<MediaItem, 'path' | 'title' | 'kind'>, imagePath: string): number {
  const rawStem = basename(imagePath, extname(imagePath))
  const stem = normalize(rawStem)
  const fileName = basename(imagePath).toLowerCase()
  const decodedFileName = safeDecode(fileName)
  const videoStem = normalize(basename(item.path, extname(item.path)))
  const folderStem = normalize(basename(dirname(item.path)))
  const titleStem = normalize(item.title)
  let score = 0

  if (/\b(poster|cover|folder|capa|artwork|movie)\b/.test(stem)) score += 90
  if (/\b(backdrop|banner|fanart|landscape|wallpaper|logo|screenshot|sample)\b/.test(stem)) score -= 45
  if (stem === videoStem || stem === folderStem || stem === titleStem) score += 70
  if (videoStem && (stem.startsWith(videoStem) || videoStem.startsWith(stem))) score += 28
  if (folderStem && (stem.startsWith(folderStem) || folderStem.startsWith(stem))) score += 24

  const titleTokens = new Set(tokenizeTitle(item.title))
  const imageTokens = new Set(tokenizeTitle(decodedFileName))
  const overlap = Array.from(titleTokens).filter((token) => imageTokens.has(token)).length
  if (overlap >= 2) score += 26
  else if (overlap === 1) score += 10

  const size = localImageSize(imagePath)
  if (size) {
    const ratio = size.width / Math.max(1, size.height)
    if (ratio <= 0.95) score += 25
    if (ratio <= 0.75) score += 10
    if (size.height >= 600) score += 8
    if (size.width * size.height < 80_000) score -= 40
  }

  return score
}

function localImageSize(path: string): { width: number; height: number } | null {
  try {
    const image = nativeImage.createFromPath(path)
    const size = image.getSize()
    if (!size.width || !size.height) return null
    return { width: size.width, height: size.height }
  } catch {
    return null
  }
}

function bestMediaTitle(path: string): string {
  const parent = basename(dirname(path))
  const filename = basename(path, extname(path))
  if (/[Ss]\d{1,2}[Ee]\d{1,2}/.test(filename)) return filename
  if (parent && !/^(captures|movies|filmes|series|s[eé]ries)$/i.test(parent)) return parent
  return filename
}

function cleanMediaTitle(input: string): { title: string; year?: number } {
  const year = input.match(/\b(19\d{2}|20\d{2})\b/)?.[1]
  const title = input
    .replace(/[._]+/g, ' ')
    .replace(/\bS(\d{1,2})E(\d{1,2})\b/gi, 'S$1E$2')
    .replace(/\b(480p|720p|1080p|2160p|4k|hdr10?|dolby|vision|web[- ]?dl|webrip|bluray|brrip|remux|dual|dubbed|legendado|x264|x265|h264|h265|hevc|av1|aac|ac3|dts|ddp?\d?\.?\d?|mp3|nf|amzn)\b/gi, ' ')
    .replace(/\b(www|com|org|net)\b/gi, ' ')
    .replace(/\b\d{1,2}\s*[._-]\s*\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}\s+(ch|canal|canais)\b/gi, ' ')
    .replace(/\(([^)]*)\)/g, (_match, inner) => (/^\s*(4k|hdr|dual|dubbed|legendado|x26[45]|h26[45]|\d+\s*[._-]\s*\d+)\s*$/i.test(inner) ? ' ' : `(${inner})`))
    .replace(/\b(19\d{2}|20\d{2})\b(?=\s*$)/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*$/g, '')
    .trim()
  return { title: title || input, year: year ? Number(year) : undefined }
}

function inferKind(path: string, title: string): MediaKind {
  if (/[Ss]\d{1,2}[Ee]\d{1,2}/.test(path) || /\btemporada\b/i.test(path)) return 'episode'
  if (/\bS\d{1,2}\b/.test(title)) return 'series'
  return 'movie'
}

function detectSubtitles(videoPath: string, preferredLanguage: string): MediaSubtitle[] {
  const dir = dirname(videoPath)
  const base = basename(videoPath, extname(videoPath)).toLowerCase()
  const candidates: string[] = []
  const dirs = [dir, join(dir, 'Subs'), join(dir, 'Subtitles'), join(dir, 'Legendas')]
  for (const subtitleDir of dirs) {
    try {
      for (const file of readdirSync(subtitleDir)) {
        const ext = extname(file).toLowerCase()
        if (!SUBTITLE_EXTENSIONS.has(ext)) continue
        const stem = basename(file, ext).toLowerCase()
        if (subtitleDir !== dir || stem === base || stem.startsWith(`${base}.`) || stem.startsWith(`${base} `)) {
          candidates.push(join(subtitleDir, file))
        }
      }
    } catch {
      // optional sidecar folder
    }
  }
  const preferred = normalizeLang(preferredLanguage)
  return Array.from(new Set(candidates)).map((path, index) => {
    const language = detectSubtitleLanguage(path)
    const id = createHash('sha1').update(resolve(path).toLowerCase()).digest('hex').slice(0, 12)
    return {
      id,
      label: subtitleLabel(path, language),
      language,
      path,
      format: extname(path).toLowerCase() === '.vtt' ? 'vtt' : 'srt',
      isDefault: preferred ? normalizeLang(language) === preferred : index === 0
    }
  })
}

function refreshItemSubtitles(itemId: string): MediaItem | null {
  const item = mediaStore.load().items.find((entry) => entry.id === itemId)
  if (!item) return null
  const subtitles = detectSubtitles(item.path, settingsStore.load().media.preferredSubtitleLanguage)
  return mediaStore.patchItem(item.id, { subtitles })
}

interface WhisperTool {
  command: string
  prefixArgs: string[]
  label: string
}

async function detectWhisperTool(): Promise<WhisperTool | null> {
  if (await commandWorks('whisper', ['--help'])) {
    return { command: 'whisper', prefixArgs: [], label: 'whisper' }
  }
  if (await commandWorks('py', ['-m', 'whisper', '--help'])) {
    return { command: 'py', prefixArgs: ['-m', 'whisper'], label: 'py -m whisper' }
  }
  if (await commandWorks('python', ['-m', 'whisper', '--help'])) {
    return { command: 'python', prefixArgs: ['-m', 'whisper'], label: 'python -m whisper' }
  }
  return null
}

async function commandWorks(command: string, args: string[]): Promise<boolean> {
  const result = await runCommand(command, args, { timeoutMs: 7000 })
  return result.code === 0
}

async function runWhisperSubtitle(
  item: MediaItem,
  language: AutoSubtitleLanguage,
  tool: WhisperTool
): Promise<{ subtitle: MediaSubtitle } | { error: string }> {
  const outDir = join(PATHS.cache, 'auto-subtitles', `${item.id}-${language}-${Date.now()}`)
  mkdirSync(outDir, { recursive: true })
  const task = language === 'en' ? 'translate' : 'transcribe'
  const whisperLanguage = language === 'pt-BR' ? 'Portuguese' : 'English'
  const args = [
    ...tool.prefixArgs,
    item.path,
    '--task',
    task,
    '--language',
    whisperLanguage,
    '--output_format',
    'srt',
    '--output_dir',
    outDir
  ]

  log.info('cinema', `auto subtitle ${language} started for ${item.title} using ${tool.label}`)
  const result = await runCommand(tool.command, args, { timeoutMs: 1000 * 60 * 90 })
  if (result.code !== 0) {
    return {
      error: `Falha ao gerar legenda ${language}: ${result.stderr || result.stdout || `codigo ${result.code}`}`
    }
  }

  const produced = findFirstSrt(outDir)
  if (!produced) {
    return { error: `Whisper terminou, mas nao gerou .srt para ${language}.` }
  }

  const target = subtitleTargetPath(item.path, language)
  copyFileSync(produced, target)
  const subtitle = detectSubtitles(item.path, language).find(
    (candidate) => resolve(candidate.path).toLowerCase() === resolve(target).toLowerCase()
  )
  if (!subtitle) return { error: `Legenda ${language} gerada, mas nao foi indexada.` }
  log.info('cinema', `auto subtitle ${language} written: ${target}`)
  return { subtitle }
}

function findFirstSrt(dir: string): string | null {
  try {
    for (const file of readdirSync(dir)) {
      if (extname(file).toLowerCase() === '.srt') return join(dir, file)
    }
  } catch {
    return null
  }
  return null
}

function subtitleTargetPath(videoPath: string, language: AutoSubtitleLanguage): string {
  return join(dirname(videoPath), `${basename(videoPath, extname(videoPath))}.${language}.auto.srt`)
}

function runCommand(
  command: string,
  args: string[],
  options: { timeoutMs: number }
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveDone) => {
    const child = spawn(command, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      resolveDone({ code: -1, stdout, stderr: stderr || 'Tempo limite excedido.' })
    }, options.timeoutMs)
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolveDone({ code: -1, stdout, stderr: err.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolveDone({ code, stdout, stderr })
    })
  })
}

function detectSubtitleLanguage(path: string): string {
  const lower = basename(path).toLowerCase()
  if (/\b(pt[-_. ]?br|por|portuguese|brasil|brazilian)\b/.test(lower)) return 'pt-BR'
  if (/\b(en|eng|english)\b/.test(lower)) return 'en'
  if (/\b(es|spa|spanish)\b/.test(lower)) return 'es'
  if (/\b(fr|fre|french)\b/.test(lower)) return 'fr'
  return 'und'
}

function subtitleLabel(path: string, language: string): string {
  if (language === 'pt-BR') return 'Portugues (Brasil)'
  if (language === 'en') return 'English'
  if (language === 'es') return 'Español'
  if (language === 'fr') return 'Français'
  return basename(path)
}

function normalizeLang(value: string): string {
  return value.trim().toLowerCase().replace('_', '-')
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function readdirSafeText(path: string): string {
  return readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
}

function srtToVtt(raw: string): string {
  return `WEBVTT\n\n${raw
    .replace(/^\uFEFF/, '')
    .replace(/\r+/g, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .replace(/^\d+\n(?=\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+)/gm, '')}`
}

function dedupeByPath(items: MediaItem[]): MediaItem[] {
  const map = new Map<string, MediaItem>()
  for (const item of items) map.set(resolve(item.path).toLowerCase(), item)
  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title))
}

function indexPrevious(): Map<string, MediaItem> {
  const idx = new Map<string, MediaItem>()
  for (const item of mediaStore.load().items) idx.set(item.id, item)
  return idx
}

function mediaId(path: string): string {
  return createHash('sha1').update(resolve(path).toLowerCase()).digest('hex').slice(0, 16)
}

function shouldSkipDir(name: string): boolean {
  return ['$recycle.bin', 'system volume information', 'node_modules'].includes(name.toLowerCase())
}

function filenameFromUrl(url: string, title: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    if (last) return last
  } catch {
    // fall through
  }
  return `${sanitize(title)}.mp4`
}

function sanitize(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 90) || 'movie'
}

function imageExt(url: string): 'jpg' | 'png' | 'webp' {
  const lower = url.toLowerCase()
  if (lower.includes('.png')) return 'png'
  if (lower.includes('.webp')) return 'webp'
  return 'jpg'
}

function normalize(value: string): string {
  return safeDecode(String(value ?? ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function kindLabel(kind: MediaKind): string {
  if (kind === 'episode') return 'Episodio'
  if (kind === 'series') return 'Serie'
  return 'Filme'
}

function paletteFor(value: string): [string, string] {
  const palettes: Array<[string, string]> = [
    ['#0f766e', '#7c3aed'],
    ['#be123c', '#1d4ed8'],
    ['#ca8a04', '#166534'],
    ['#4338ca', '#0f766e'],
    ['#c2410c', '#312e81'],
    ['#64748b', '#7f1d1d']
  ]
  const hash = createHash('sha1').update(value).digest()[0]
  return palettes[hash % palettes.length]
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function publishDownload(progress: MediaDownloadProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.media.progress, progress)
  }
}

type MediaLibraryFileLike = ReturnType<typeof mediaStore.load>

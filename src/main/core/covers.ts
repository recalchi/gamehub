import { writeFile, readdir } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { BrowserWindow } from 'electron'
import { PATHS } from './paths'
import { libraryStore } from './store'
import { log } from './logger'
import { fetchSteamGridCover, isSteamGridDbConfigured } from './steamGridDb'
import { IPC } from '@shared/ipc'
import type { Game, PlatformId } from '@shared/types'

// Cover art service.
//
// We fetch box art (and optional title/screenshot) from the public libretro
// thumbnails repository — https://thumbnails.libretro.com/. It has no API
// key requirement, is fast, and has very wide coverage for the platforms
// GameHub targets. Each platform has three top-level folders:
//
//   /<System>/Named_Boxarts/<Title>.png
//   /<System>/Named_Titles/<Title>.png
//   /<System>/Named_Snaps/<Title>.png
//
// Filename rules (libretro's quirk): the chars &, *, slash, colon, backtick,
// <, >, ?, backslash, pipe, and double-quote all become "_". Anything else
// in the No-Intro filename is kept verbatim.
//
// We try a small list of title variants because users rarely have the exact
// No-Intro filename. If none hit, we just leave cover empty and retry next
// scan — there's no negative cache yet.

const LIBRETRO_BASE = 'https://thumbnails.libretro.com'

const WIKI_PAGE_ALIASES: Array<[RegExp, string]> = [
  [/elder scrolls iv.*oblivion/i, 'The Elder Scrolls IV: Oblivion'],
  [/god of war ii hd/i, 'God of War Collection'],
  [/guitar hero iii.*legends of rock/i, 'Guitar Hero III: Legends of Rock'],
  [/jojo.*all star battle/i, "JoJo's Bizarre Adventure: All Star Battle"],
  [/mortal kombat vs.*dc/i, 'Mortal Kombat vs. DC Universe'],
  [/mortal kombat komplete/i, 'Mortal Kombat (2011 video game)'],
  [/league of legends/i, 'League of Legends'],
  [/^valorant/i, 'Valorant'],
  [/^fortnite/i, 'Fortnite Battle Royale']
]

const LIBRETRO_SYSTEMS: Partial<Record<PlatformId, string>> = {
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  n64: 'Nintendo - Nintendo 64',
  gamecube: 'Nintendo - GameCube',
  wii: 'Nintendo - Wii',
  gb: 'Nintendo - Game Boy',
  gbc: 'Nintendo - Game Boy Color',
  gba: 'Nintendo - Game Boy Advance',
  nds: 'Nintendo - Nintendo DS',
  n3ds: 'Nintendo - Nintendo 3DS',
  ps1: 'Sony - PlayStation',
  ps2: 'Sony - PlayStation 2',
  ps3: 'Sony - PlayStation 3',
  psp: 'Sony - PlayStation Portable',
  xbox: 'Microsoft - Xbox',
  xbox360: 'Microsoft - Xbox 360'
  // ps4: libretro doesn't index PS4 — fallback handled by tryFetchSteamGrid
}

/** Libretro escapes these characters in filenames */
function libretroSafe(title: string): string {
  return title.replace(/[&*/:`<>?\\|"]/g, '_')
}

/**
 * Generate a small set of candidate titles to try. Real No-Intro filenames
 * include region tags like " (USA)" or " (Europe)" — we try the bare title
 * first, then a couple of common region suffixes.
 */
function titleVariants(title: string): string[] {
  const base = title.trim()
  const out = [
    base,
    `${base} (USA)`,
    `${base} (Europe)`,
    `${base} (Japan)`,
    `${base} (World)`,
    `${base} (USA, Europe)`,
    `${base} (Australia)`
  ]
  // No-Intro convention puts "The" at the end: "Elder Scrolls V, The". If the
  // user has the natural-language version ("The Elder Scrolls V") flip it.
  // Likewise try the reverse so either source title finds the other.
  const theMatch = base.match(/^The\s+(.+)$/i)
  if (theMatch) {
    out.push(`${theMatch[1]}, The`, `${theMatch[1]}, The (USA)`, `${theMatch[1]}, The (Europe)`)
  }
  const commaTheMatch = base.match(/^(.+),\s*The$/i)
  if (commaTheMatch) {
    out.push(`The ${commaTheMatch[1]}`)
  }
  return out
}

interface CoverResult {
  cover?: string
  banner?: string
  screenshot?: string
}

interface SteamSearchItem {
  id: number
  name: string
}

interface WikiSearchResult {
  title: string
}

interface WikiSummary {
  title?: string
  thumbnail?: { source?: string }
  originalimage?: { source?: string }
}

interface EpicImageCandidate {
  url: string
  hint: string
}

async function tryFetch(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url, { method: 'GET' })
    if (!r.ok) return null
    return await r.arrayBuffer()
  } catch (err) {
    log.debug('covers', `fetch failed ${url}: ${String(err)}`)
    return null
  }
}

/**
 * In-memory cache of libretro directory listings, keyed by "<system>/<folder>".
 * Each listing is the parsed list of PNG filenames available. We fetch the
 * index HTML once per session (a few KB to ~150KB per platform) and reuse it.
 * Caches don't survive restarts — fine for our use case.
 */
const listingCache = new Map<string, string[]>()

async function fetchListing(
  system: string,
  folder: 'Named_Boxarts' | 'Named_Titles' | 'Named_Snaps'
): Promise<string[]> {
  const key = `${system}/${folder}`
  const cached = listingCache.get(key)
  if (cached) return cached
  const url = `${LIBRETRO_BASE}/${encodeURIComponent(system)}/${folder}/`
  try {
    const r = await fetch(url)
    if (!r.ok) {
      listingCache.set(key, [])
      return []
    }
    const html = await r.text()
    // The directory listing is an apache-style autoindex HTML. Filenames are
    // in `href="..."` attributes ending with `.png`. Decode URI escapes so we
    // can do plain-text comparisons.
    const filenames = Array.from(html.matchAll(/href="([^"]+\.png)"/gi)).map((m) => {
      try {
        return decodeURIComponent(m[1])
      } catch {
        return m[1]
      }
    })
    log.info('covers', `cached libretro listing for ${key}: ${filenames.length} entries`)
    listingCache.set(key, filenames)
    return filenames
  } catch (err) {
    log.warn('covers', `failed to fetch listing ${key}: ${String(err)}`)
    listingCache.set(key, [])
    return []
  }
}

/**
 * Pick the best filename from a listing for a title. Matching is:
 *   1. Exact match (case-insensitive, libretro-safe-applied)
 *   2. Exact base + any tags suffix (e.g. "Gran Turismo 4 (USA) (v1.01).png"
 *      matches title "Gran Turismo 4")
 *   3. Prefix match on normalised title
 *
 * Prefers USA > Europe > World > anything else when multiple candidates.
 */
function pickListingMatch(title: string, listing: string[]): string | null {
  // Build a small set of normalised forms so "The X" matches libretro's
  // canonical "X, The".
  const variants = new Set<string>()
  const base = libretroSafe(title).toLowerCase()
  variants.add(base)
  const m1 = base.match(/^the\s+(.+)$/)
  if (m1) variants.add(`${m1[1]}, the`)
  const m2 = base.match(/^(.+),\s*the$/)
  if (m2) variants.add(`the ${m2[1]}`)
  const canonicalTitle = canonicalCoverTitle(title)
  // The "base" of our title — anything before " - " or " (" that we treat
  // as the canonical game name. Used for the asymmetric case where the user
  // has a longer name (e.g. "Mortal Kombat - Armageddon - Premium Edition")
  // than the libretro filename ("Mortal Kombat - Armageddon (USA)").
  const candidates: Array<{ filename: string; rank: number }> = []
  for (const filename of listing) {
    const noExt = filename.replace(/\.png$/i, '').toLowerCase()
    const canonicalFile = canonicalCoverTitle(noExt)
    if (variants.has(noExt)) {
      candidates.push({ filename, rank: 0 })
      continue
    }
    // Case A — libretro filename has version/region tags after our title.
    let matchedVariant = false
    for (const v of variants) {
      if (noExt.startsWith(v + ' (')) {
        candidates.push({ filename, rank: rankByRegion(noExt, 5) })
        matchedVariant = true
        break
      }
    }
    if (matchedVariant) continue
    // Case B — our title has extra suffix tags ("...Premium Edition") and
    // the libretro filename is the shorter canonical name. We only accept
    // this when the base parts match exactly to avoid false positives like
    // "Mortal Kombat" matching "Mortal Kombat Trilogy".
    if (canonicalTitle && canonicalFile && canonicalTitle === canonicalFile) {
      candidates.push({ filename, rank: rankByRegion(noExt, 20) })
    }
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.rank - b.rank)
  return candidates[0].filename
}

function rankByRegion(filename: string, baseRank: number): number {
  if (filename.includes('(usa)')) return baseRank + 1
  if (filename.includes('(world)')) return baseRank + 2
  if (filename.includes('(europe)')) return baseRank + 3
  if (filename.includes('(japan)')) return baseRank + 4
  return baseRank + 9
}

function canonicalCoverTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(cusa|bles|blus|npub|npea|npeb|slus|sles|scus|scps|ulus|ules)\s*-?\s*\d+\b/g, ' ')
    .replace(/\bv?\d+(\.\d+)+\b/g, ' ')
    .replace(/\b(pt-br|psvr|psn|dlc|update|patch|fix|trainer|demo|beta|alpha)\b/g, ' ')
    .replace(/\b(usa|europe|japan|world|asia|en|fr|de|es|it|pt|br)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bthe\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchOne(
  system: string,
  folder: 'Named_Boxarts' | 'Named_Titles' | 'Named_Snaps',
  title: string,
  destPath: string
): Promise<boolean> {
  // Strategy 1 — try the cheap, predictable URL variants first. Most popular
  // games hit on the first try and we avoid downloading the listing.
  for (const variant of titleVariants(title)) {
    const url = `${LIBRETRO_BASE}/${encodeURIComponent(system)}/${folder}/${encodeURIComponent(
      libretroSafe(variant)
    )}.png`
    const data = await tryFetch(url)
    if (data) {
      await writeFile(destPath, Buffer.from(data))
      log.info('covers', `${folder} hit for "${title}" via "${variant}"`)
      return true
    }
  }
  // Strategy 2 — fall back to the system listing. Catches games whose
  // canonical filename has version/region tags (e.g. "Gran Turismo 4 (USA)
  // (v1.01).png") that we can't enumerate ahead of time.
  const listing = await fetchListing(system, folder)
  const match = pickListingMatch(title, listing)
  if (!match) return false
  const url = `${LIBRETRO_BASE}/${encodeURIComponent(system)}/${folder}/${encodeURIComponent(match)}`
  const data = await tryFetch(url)
  if (data) {
    await writeFile(destPath, Buffer.from(data))
    log.info('covers', `${folder} hit for "${title}" via listing "${match}"`)
    return true
  }
  return false
}

/**
 * Build the renderer-facing URL for a local asset.
 *
 * We use the `gh-asset://` custom protocol (registered in main/index.ts) so
 * the renderer can load these from any origin — `file:///` would be blocked
 * by Chrome's mixed-content policy in dev (renderer runs on http://localhost).
 */
export function coverUrl(filename: string): string {
  return `gh-asset://cover/${encodeURIComponent(filename)}`
}

export function bannerUrl(filename: string): string {
  return `gh-asset://banner/${encodeURIComponent(filename)}`
}

function decodeGhAssetFilename(url: string, kind: 'cover' | 'banner'): string | null {
  const prefix = `gh-asset://${kind}/`
  if (!url.startsWith(prefix)) return null
  const raw = url.slice(prefix.length)
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function hasUsableCover(url: string | undefined): boolean {
  if (!url) return false
  if (url.startsWith('http://') || url.startsWith('https://')) return true
  const filename = decodeGhAssetFilename(url, 'cover')
  if (!filename) return false
  const full = join(PATHS.covers, filename)
  if (!existsSync(full)) return false
  try {
    return statSync(full).isFile()
  } catch {
    return false
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function fallbackCoverSvg(game: Game): string {
  const palette = ['#0f172a', '#111827', '#1e1b4b', '#12343b', '#3f1d2e', '#312e81']
  const seed = game.id
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const base = palette[seed % palette.length]
  const accent = game.platform === 'unknown' ? '#94a3b8' : '#5eead4'
  const title = escapeXml(game.title)
  const platform = escapeXml(game.platform.toUpperCase())
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${base}"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
  </defs>
  <rect width="600" height="900" fill="url(#bg)"/>
  <rect x="44" y="44" width="512" height="812" rx="26" fill="none" stroke="${accent}" stroke-opacity="0.42" stroke-width="3"/>
  <text x="60" y="94" fill="${accent}" font-size="22" font-family="Segoe UI, Arial, sans-serif" letter-spacing="3">${platform}</text>
  <text x="60" y="780" fill="#e2e8f0" font-size="42" font-weight="700" font-family="Segoe UI, Arial, sans-serif">${title}</text>
  <text x="60" y="820" fill="#94a3b8" font-size="18" font-family="Segoe UI, Arial, sans-serif">GameHub Auto Cover</text>
</svg>`
}

async function generateFallbackCover(game: Game): Promise<string> {
  const filename = `${game.id}.svg`
  const full = join(PATHS.covers, filename)
  if (!existsSync(full)) {
    await writeFile(full, fallbackCoverSvg(game), 'utf8')
  }
  return coverUrl(filename)
}

async function fetchSteamCovers(game: Game): Promise<CoverResult> {
  const appId = await findSteamAppId(game)
  if (!appId) return {}

  const coverPath = join(PATHS.covers, `${game.id}.jpg`)
  const bannerPath = join(PATHS.banners, `${game.id}.jpg`)
  const out: CoverResult = {}

  if (existsSync(coverPath)) {
    out.cover = coverUrl(`${game.id}.jpg`)
  } else if (await fetchRemoteImage(steamCoverUrl(appId), coverPath)) {
    out.cover = coverUrl(`${game.id}.jpg`)
  }

  if (existsSync(bannerPath)) {
    out.banner = bannerUrl(`${game.id}.jpg`)
  } else if (await fetchRemoteImage(steamBannerUrl(appId), bannerPath)) {
    out.banner = bannerUrl(`${game.id}.jpg`)
  }

  if (out.cover || out.banner) {
    log.info('covers', `Steam fallback hit for "${game.title}" via app ${appId}`)
  }
  return out
}

async function fetchEpicStoreCovers(game: Game): Promise<CoverResult> {
  if (!game.flags?.includes('epic') && !game.path.startsWith('com.epicgames.launcher://')) {
    return {}
  }

  const slugs = epicProductSlugs(game)
  for (const slug of slugs) {
    try {
      const r = await fetch(
        `https://store-content.ak.epicgames.com/api/en-US/content/products/${encodeURIComponent(slug)}`
      )
      if (!r.ok) continue
      const data = (await r.json()) as unknown
      const images = collectEpicImageUrls(data)
      const coverUrlSource = pickEpicImage(images, [
        /portrait/i,
        /1200x1600/i,
        /blade/i,
        /keyart/i
      ])
      const bannerUrlSource = pickEpicImage(images, [
        /backgroundImageUrl/i,
        /carousel/i,
        /2560x1440/i,
        /3840x2160/i
      ])
      if (!coverUrlSource && !bannerUrlSource) continue

      const out: CoverResult = {}
      if (coverUrlSource) {
        const ext = imageExtFromUrl(coverUrlSource)
        const coverPath = join(PATHS.covers, `${game.id}.${ext}`)
        if (existsSync(coverPath) || (await fetchRemoteImage(coverUrlSource, coverPath))) {
          out.cover = coverUrl(`${game.id}.${ext}`)
        }
      }
      if (bannerUrlSource) {
        const ext = imageExtFromUrl(bannerUrlSource)
        const bannerPath = join(PATHS.banners, `${game.id}.${ext}`)
        if (existsSync(bannerPath) || (await fetchRemoteImage(bannerUrlSource, bannerPath))) {
          out.banner = bannerUrl(`${game.id}.${ext}`)
        }
      }
      if (out.cover || out.banner) {
        log.info('covers', `Epic Store fallback hit for "${game.title}" via "${slug}"`)
        return out
      }
    } catch (err) {
      log.debug('covers', `Epic Store cover failed for "${game.title}": ${String(err)}`)
    }
  }
  return {}
}

async function fetchWikipediaCovers(game: Game): Promise<CoverResult> {
  const query = wikiSearchTitle(game.title)
  if (!query) return {}
  const pageTitle = wikiPageAlias(query) ?? (await findWikipediaPage(query))
  if (!pageTitle) return {}
  try {
    const r = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`
    )
    if (!r.ok) return {}
    const data = (await r.json()) as WikiSummary
    const imageUrl = data.thumbnail?.source ?? data.originalimage?.source
    if (!imageUrl) return {}
    const ext = imageExtFromUrl(imageUrl)
    const coverPath = join(PATHS.covers, `${game.id}.${ext}`)
    const bannerPath = join(PATHS.banners, `${game.id}.${ext}`)
    const out: CoverResult = {}
    if (existsSync(coverPath) || (await fetchRemoteImage(imageUrl, coverPath))) {
      out.cover = coverUrl(`${game.id}.${ext}`)
    }
    if (existsSync(bannerPath) || (await fetchRemoteImage(imageUrl, bannerPath))) {
      out.banner = bannerUrl(`${game.id}.${ext}`)
    }
    if (out.cover || out.banner) {
      log.info('covers', `Wikipedia fallback hit for "${game.title}" via "${data.title ?? pageTitle}"`)
    }
    return out
  } catch (err) {
    log.debug('covers', `Wikipedia summary failed for "${game.title}": ${String(err)}`)
    return {}
  }
}

function wikiPageAlias(query: string): string | null {
  return WIKI_PAGE_ALIASES.find(([pattern]) => pattern.test(query))?.[1] ?? null
}

async function findWikipediaPage(query: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    `${query} video game`
  )}&format=json&origin=*`
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const data = (await r.json()) as { query?: { search?: WikiSearchResult[] } }
    const picked = (data.query?.search ?? [])
      .map((item) => ({ item, score: titleSimilarity(query, item.title) }))
      .filter((entry) => entry.score >= 0.45)
      .sort((a, b) => b.score - a.score)[0]
    return picked?.item.title ?? null
  } catch (err) {
    log.debug('covers', `Wikipedia search failed for "${query}": ${String(err)}`)
    return null
  }
}

function wikiSearchTitle(title: string): string {
  const cleaned = steamSearchTitle(title)
    .replace(/\bclient\b/gi, ' ')
    .replace(/\bwin64\b/gi, ' ')
    .replace(/\bshipping\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (/^fortnite/i.test(cleaned)) return 'Fortnite'
  if (/^valorant/i.test(cleaned)) return 'Valorant'
  return cleaned
}

function imageExtFromUrl(url: string): 'jpg' | 'png' | 'webp' {
  const lower = url.toLowerCase()
  if (lower.includes('.png')) return 'png'
  if (lower.includes('.webp')) return 'webp'
  return 'jpg'
}

async function findSteamAppId(game: Game): Promise<number | null> {
  const direct =
    game.id.match(/^steam_(\d+)$/)?.[1] ?? game.path.match(/steam:\/\/rungameid\/(\d+)/)?.[1]
  if (direct) return Number(direct)

  const query = steamSearchTitle(game.title)
  if (!query) return null
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(
    query
  )}&cc=US&l=english`
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const data = (await r.json()) as { items?: SteamSearchItem[] }
    const picked = (data.items ?? [])
      .map((item) => ({ item, score: titleSimilarity(query, item.name) }))
      .filter((entry) => entry.score >= 0.72)
      .sort((a, b) => b.score - a.score)[0]
    return picked?.item.id ?? null
  } catch (err) {
    log.debug('covers', `Steam search failed for "${game.title}": ${String(err)}`)
    return null
  }
}

function steamSearchTitle(title: string): string {
  return basename(title)
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(cusa|bles|blus|npub|npea|npeb)\s*-?\s*\d+\b/gi, ' ')
    .replace(/\bv?\d+(\.\d+)+\b/g, ' ')
    .replace(/\b(psvr|ps4|ps3|dlc|update|patch|fix|trainer|demo)\b/gi, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleSimilarity(a: string, b: string): number {
  const left = new Set(canonicalCoverTitle(a).split(' ').filter((x) => x.length > 1))
  const right = new Set(canonicalCoverTitle(b).split(' ').filter((x) => x.length > 1))
  if (left.size === 0 || right.size === 0) return 0
  let overlap = 0
  for (const token of left) if (right.has(token)) overlap++
  return overlap / Math.max(left.size, right.size)
}

async function fetchRemoteImage(url: string, destPath: string): Promise<boolean> {
  const data = await tryFetch(url)
  if (!data) return false
  await writeFile(destPath, Buffer.from(data))
  return true
}

function steamCoverUrl(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`
}

function steamBannerUrl(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`
}

/** Resolve cover + title-screen for a single game.
 *
 * Source priority (skip sources we don't have, never re-fetch when cached):
 *   1. Local cache file — always wins.
 *   2. libretro thumbnails — wide retro coverage, no key, fastest.
 *   3. SteamGridDB — fills PS4/Switch/modern indies (needs user-configured key).
 *   4. Epic store CDN — known Epic-launcher entries.
 *   5. Steam CDN — installed Steam games.
 *   6. Wikipedia — last-ditch text-only.
 */
async function fetchCoversFor(game: Game): Promise<CoverResult> {
  const system = LIBRETRO_SYSTEMS[game.platform]
  const coverPath = join(PATHS.covers, `${game.id}.png`)
  const bannerPath = join(PATHS.banners, `${game.id}.png`)
  const out: CoverResult = {}

  // 1. Cache
  if (existsSync(coverPath)) out.cover = coverUrl(`${game.id}.png`)
  if (existsSync(bannerPath)) out.banner = bannerUrl(`${game.id}.png`)

  // 2. libretro (skip when platform isn't indexed)
  if (system) {
    if (!out.cover && (await fetchOne(system, 'Named_Boxarts', game.title, coverPath))) {
      out.cover = coverUrl(`${game.id}.png`)
    }
    if (!out.banner && (await fetchOne(system, 'Named_Titles', game.title, bannerPath))) {
      out.banner = bannerUrl(`${game.id}.png`)
    }
  }

  // 3. SteamGridDB cover fallback — fills gaps libretro can't reach.
  // We only call it when the user opted in (has a key) so unconfigured users
  // don't pay any network round-trip.
  if (!out.cover && isSteamGridDbConfigured()) {
    if (await fetchSteamGridCover(game.title, coverPath)) {
      out.cover = coverUrl(`${game.id}.png`)
    }
  }

  // 4-6. Existing store/wiki fallbacks
  if (!out.cover || !out.banner) {
    const epic = await fetchEpicStoreCovers(game)
    const steam = epic.cover && epic.banner ? {} : await fetchSteamCovers(game)
    const needsMore =
      !(epic.cover ?? steam.cover ?? out.cover) || !(epic.banner ?? steam.banner ?? out.banner)
    const wiki = needsMore ? await fetchWikipediaCovers(game) : {}
    const resolvedCover = out.cover ?? epic.cover ?? steam.cover ?? wiki.cover
    return {
      cover: resolvedCover ?? (await generateFallbackCover(game)),
      banner: out.banner ?? epic.banner ?? steam.banner ?? wiki.banner
    }
  }

  if (!out.cover) {
    out.cover = await generateFallbackCover(game)
  }
  return out
}

function epicProductSlugs(game: Game): string[] {
  const base = steamSearchTitle(game.title)
    .replace(/\bclient\b/gi, ' ')
    .replace(/\bwin64\b/gi, ' ')
    .replace(/\bshipping\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const slugs = new Set<string>()
  const add = (value: string): void => {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    if (slug) slugs.add(slug)
  }
  add(base)
  if (/^fortnite/i.test(base)) add('fortnite')
  const fromUri = game.path.match(/\/apps\/([^?]+)/i)?.[1]
  if (fromUri) add(decodeURIComponent(fromUri))
  return Array.from(slugs)
}

function collectEpicImageUrls(value: unknown, hint = ''): EpicImageCandidate[] {
  const out: EpicImageCandidate[] = []
  if (typeof value === 'string') {
    if (/^https:\/\/cdn\d*\.unrealengine\.com\//i.test(value) && /\.(png|jpe?g|webp)(\?|#|$)/i.test(value)) {
      out.push({ url: value, hint })
    }
    return out
  }
  if (!value || typeof value !== 'object') return out
  if (Array.isArray(value)) {
    for (const item of value) out.push(...collectEpicImageUrls(item, hint))
    return out
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    out.push(...collectEpicImageUrls(nested, hint ? `${hint}.${key}` : key))
  }
  return out
}

function pickEpicImage(images: EpicImageCandidate[], patterns: RegExp[]): string | undefined {
  return images.find((image) => patterns.some((pattern) => pattern.test(`${image.hint} ${image.url}`)))?.url
}

let enriching = false
const ENRICH_CONCURRENCY = 6

/**
 * Walk all games in the library and fetch their cover art in the background.
 * Sends incremental updates to the renderer so cards "fill in" as art lands.
 *
 * Concurrency is capped so we don't pummel libretro's CDN — 6 parallel fetches
 * is more than enough to keep the wire saturated and still play nice.
 */
/**
 * Prefetch covers for a specific set of games — used at boot to warm the
 * cache for the "recents" shelf so the Home page renders with art already
 * in place instead of fading in 6 placeholders.
 *
 * Smaller concurrency than `enrichLibrary` because the splash blocks on us;
 * we want to be fast for ~8 games, not eat all libretro's quota.
 */
export async function enrichGames(gameIds: string[]): Promise<{ updated: number }> {
  const data = libraryStore.load()
  const todo = data.games.filter((g) => gameIds.includes(g.id) && !hasUsableCover(g.cover))
  if (todo.length === 0) return { updated: 0 }
  let updated = 0
  const PRIORITY_CONCURRENCY = 4
  let idx = 0
  async function worker(): Promise<void> {
    while (idx < todo.length) {
      const game = todo[idx++]
      const r = await fetchCoversFor(game)
      if (r.cover || r.banner) {
        libraryStore.patchGame(game.id, { cover: r.cover, banner: r.banner })
        updated++
        publishOne(game.id, r)
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PRIORITY_CONCURRENCY, todo.length) }, () => worker())
  )
  log.info('covers', `priority enrich complete: ${updated} of ${todo.length} updated`)
  return { updated }
}

export async function enrichLibrary(): Promise<{ updated: number; skipped: number }> {
  if (enriching) {
    log.warn('covers', 'enrichment already running')
    return { updated: 0, skipped: 0 }
  }
  enriching = true
  let updated = 0
  let skipped = 0
  try {
    const data = libraryStore.load()
    const todo = data.games.filter((g) => !hasUsableCover(g.cover))
    skipped = data.games.length - todo.length

    publishProgress('enriching', 0, data.games.length - skipped)

    // Simple worker pool — pull from a shared queue until empty
    let idx = 0
    let done = 0
    async function worker(): Promise<void> {
      while (idx < todo.length) {
        const i = idx++
        const game = todo[i]
        const r = await fetchCoversFor(game)
        if (r.cover || r.banner) {
          libraryStore.patchGame(game.id, { cover: r.cover, banner: r.banner })
          updated++
          publishOne(game.id, r)
        } else {
          skipped++
        }
        done++
        publishProgress('enriching', done, todo.length)
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(ENRICH_CONCURRENCY, todo.length) }, () => worker())
    )
    publishProgress('done', todo.length, todo.length)
    log.info('covers', `enrichment complete: ${updated} updated, ${skipped} skipped`)
    return { updated, skipped }
  } finally {
    enriching = false
  }
}

function publishProgress(
  phase: 'enriching' | 'done',
  scanned: number,
  found: number
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.library.progress, { phase, scanned, found })
  }
}

function publishOne(gameId: string, patch: CoverResult): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.library.coverUpdated, { gameId, ...patch })
  }
}

/** Force-refresh a single game's covers (e.g. user clicked "fetch covers"). */
export async function fetchSingle(gameId: string): Promise<CoverResult | null> {
  const data = libraryStore.load()
  const game = data.games.find((g) => g.id === gameId)
  if (!game) return null
  const r = await fetchCoversFor(game)
  if (r.cover || r.banner) {
    libraryStore.patchGame(gameId, { cover: r.cover, banner: r.banner })
    publishOne(gameId, r)
  }
  return r
}

/**
 * Replace the cover for a game with a user-picked local image.
 *
 * We copy the source file into our managed cache so deleting the original
 * doesn't break the cover, and so the image survives moves of the original
 * game file. The file is renamed to `<gameId>.<ext>` to keep cache cleanup
 * trivial.
 */
export async function setManualCover(
  gameId: string,
  sourcePath: string
): Promise<{ cover: string } | { error: string }> {
  const data = libraryStore.load()
  const game = data.games.find((g) => g.id === gameId)
  if (!game) return { error: 'Jogo não encontrado.' }
  if (!existsSync(sourcePath)) return { error: 'Arquivo de imagem não encontrado.' }

  // Preserve extension (jpg/png/webp all work in <img>)
  const ext = sourcePath.toLowerCase().match(/\.(png|jpg|jpeg|webp|gif)$/)?.[1] ?? 'png'
  const destPath = join(PATHS.covers, `${gameId}.${ext}`)
  try {
    const buf = await import('node:fs/promises').then((m) => m.readFile(sourcePath))
    await writeFile(destPath, buf)
    const url = coverUrl(`${gameId}.${ext}`)
    libraryStore.patchGame(gameId, { cover: url })
    publishOne(gameId, { cover: url })
    log.info('covers', `manual cover set for ${gameId}: ${sourcePath} → ${destPath}`)
    return { cover: url }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('covers', `manual cover failed: ${msg}`)
    return { error: msg }
  }
}

/**
 * Walk a game's parent directory looking for a cover image bundled alongside
 * the ROM. Homebrew often ships `label_nes.png`, `cover.png`, `box.jpg` etc.
 * — files we missed if the user seeded the catalog before bundled-cover
 * extraction landed.
 *
 * Idempotent: skips games that already have a cover, only walks 2 dirs up
 * from the ROM path so it doesn't churn through the whole disk.
 */
export async function backfillBundledCovers(): Promise<{ updated: number }> {
  const { readdir, copyFile, stat: statAsync } = await import('node:fs/promises')
  const COVER_HINTS = ['cover', 'box', 'front', 'label', 'art', 'banner', 'screen']
  const COVER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

  const data = libraryStore.load()
  let updated = 0

  for (const game of data.games) {
    if (game.cover) continue
    if (!game.path) continue
    // Only look in the gamehub-managed downloads dir — we don't want to scan
    // the user's whole D:\Jogos tree on every load.
    if (!game.path.toLowerCase().startsWith(PATHS.userData.toLowerCase())) continue

    // Walk 2 levels up from the ROM looking for an image
    const parts = game.path.split(/[\\/]/)
    const candidates: string[] = []
    for (let levelsUp = 1; levelsUp <= 2; levelsUp++) {
      candidates.push(parts.slice(0, parts.length - levelsUp).join('\\'))
    }

    let bestHit: string | null = null
    let bestAny: string | null = null
    let bestHitSize = 0
    let bestAnySize = 0

    for (const dir of candidates) {
      let entries: string[]
      try {
        entries = await readdir(dir)
      } catch {
        continue
      }
      for (const entry of entries) {
        const ext = entry.toLowerCase().substring(entry.lastIndexOf('.'))
        if (!COVER_EXTENSIONS.has(ext)) continue
        const full = join(dir, entry)
        let st
        try {
          st = await statAsync(full)
        } catch {
          continue
        }
        if (!st.isFile()) continue
        const lower = entry.toLowerCase()
        const hinted = COVER_HINTS.some((h) => lower.includes(h))
        if (hinted && st.size > bestHitSize) {
          bestHitSize = st.size
          bestHit = full
        }
        if (st.size > bestAnySize) {
          bestAnySize = st.size
          bestAny = full
        }
      }
    }

    const chosen = bestHit ?? bestAny
    if (!chosen) continue

    const ext = chosen.toLowerCase().substring(chosen.lastIndexOf('.')).slice(1) || 'png'
    const dest = join(PATHS.covers, `${game.id}.${ext}`)
    try {
      await copyFile(chosen, dest)
      libraryStore.patchGame(game.id, { cover: coverUrl(`${game.id}.${ext}`) })
      log.info('covers', `backfilled cover for ${game.title}: ${chosen}`)
      updated++
    } catch (err) {
      log.warn('covers', `backfill copy failed for ${game.id}: ${String(err)}`)
    }
  }
  if (updated > 0) log.info('covers', `backfill complete: ${updated} cover(s) recovered`)
  return { updated }
}

/** How many .png files do we have cached locally? */
export async function coverCacheStats(): Promise<{ covers: number; banners: number }> {
  const [c, b] = await Promise.all([
    readdir(PATHS.covers).catch(() => []),
    readdir(PATHS.banners).catch(() => [])
  ])
  return {
    covers: c.filter((f) => f.endsWith('.png')).length,
    banners: b.filter((f) => f.endsWith('.png')).length
  }
}

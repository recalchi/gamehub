import { writeFile } from 'node:fs/promises'
import { settingsStore } from './store'
import { log } from './logger'

/**
 * SteamGridDB cover provider.
 *
 * Public REST API at steamgriddb.com — requires a free user-generated API key
 * (Bearer token). When the user hasn't entered one, every call short-circuits
 * to null so libretro stays the primary source.
 *
 * Use as a *fallback* for platforms libretro doesn't index (PS4, Switch) or
 * games it lacks (modern indies). We hit the search endpoint to find the
 * game id, then /games/<id>/grids to get cover URLs, then download the top
 * vertical grid (600x900) into the cover cache.
 *
 * Docs: https://www.steamgriddb.com/api/v2
 */

const BASE = 'https://www.steamgriddb.com/api/v2'

interface SearchResult {
  id: number
  name: string
  release_date?: number
}

interface GridResult {
  id: number
  url: string
  thumb: string
  width: number
  height: number
  style: string
}

function authHeader(): { Authorization: string } | null {
  const key = settingsStore.load().steamGridDb?.apiKey?.trim()
  if (!key) return null
  return { Authorization: `Bearer ${key}` }
}

/** Whether the user has configured a SteamGridDB key. */
export function isSteamGridDbConfigured(): boolean {
  const s = settingsStore.load().steamGridDb
  return !!(s?.enabled && s.apiKey?.trim())
}

/** Quick auth check used by Settings → "Testar conexão". */
export async function testSteamGridDbKey(): Promise<{ ok: true; sample?: string } | { error: string }> {
  const auth = authHeader()
  if (!auth) return { error: 'Cole sua API key em Configurações → Integrações.' }
  try {
    const r = await fetch(`${BASE}/search/autocomplete/celeste`, { headers: auth })
    if (r.status === 401) return { error: 'API key recusada (401). Verifique o valor.' }
    if (!r.ok) return { error: `HTTP ${r.status}` }
    const json = (await r.json()) as { success: boolean; data: SearchResult[] }
    if (!json.success) return { error: 'API retornou success:false' }
    return { ok: true, sample: json.data[0]?.name }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Find a cover for a game by title. Downloads the best vertical grid into
 * `destPath` and returns true on success. Silent failure (returns false)
 * when integration is off, key missing, no matches, or download errors —
 * caller treats it as "no cover, move on".
 */
export async function fetchSteamGridCover(title: string, destPath: string): Promise<boolean> {
  const auth = authHeader()
  if (!auth) return false
  if (!isSteamGridDbConfigured()) return false

  try {
    const term = encodeURIComponent(title.trim().slice(0, 80))
    const searchR = await fetch(`${BASE}/search/autocomplete/${term}`, { headers: auth })
    if (!searchR.ok) {
      log.debug('steamgriddb', `search "${title}" failed HTTP ${searchR.status}`)
      return false
    }
    const search = (await searchR.json()) as { success: boolean; data: SearchResult[] }
    if (!search.success || search.data.length === 0) return false
    const gameId = search.data[0].id

    // Vertical grids (600x900) — cover aspect ratio. dimensions filter rejects
    // weird square promo art that wouldn't look right in our cards.
    const gridsR = await fetch(
      `${BASE}/grids/game/${gameId}?dimensions=600x900,660x930,512x800&types=static&limit=5`,
      { headers: auth }
    )
    if (!gridsR.ok) return false
    const grids = (await gridsR.json()) as { success: boolean; data: GridResult[] }
    if (!grids.success || grids.data.length === 0) return false

    const best = grids.data[0]
    const imgR = await fetch(best.url)
    if (!imgR.ok) return false
    const buf = Buffer.from(await imgR.arrayBuffer())
    await writeFile(destPath, buf)
    log.info('steamgriddb', `cover hit for "${title}" → game ${gameId} (${best.width}x${best.height})`)
    return true
  } catch (err) {
    log.debug('steamgriddb', `error fetching "${title}": ${String(err)}`)
    return false
  }
}

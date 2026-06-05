import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function safeDirSize(dir: string): number {
  if (!dir || !existsSync(dir)) return 0
  let total = 0
  const stack: string[] = [dir]
  let visited = 0
  // Cap traversal to avoid pathological multi-million-file installs choking
  // the import. 50k entries is plenty for any real game.
  while (stack.length > 0 && visited < 50000) {
    const current = stack.pop()!
    visited += 1
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(current, entry)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) stack.push(full)
      else total += st.size
    }
  }
  return total
}
import { createHash } from 'node:crypto'
import { libraryStore, settingsStore } from './store'
import { log } from './logger'
import type { Game } from '@shared/types'

/**
 * Local Riot Games detection.
 *
 * Riot ships its games as subfolders under a single "Riot Games" directory,
 * each containing the product launcher exe. The Riot Client itself sits next
 * to them and handles the actual launch via URI:
 *
 *   riotclient://riot-client/launch?product=<id>&patchline=live
 *
 * Known products that we map by folder/exe name:
 *   - League of Legends → product=league_of_legends
 *   - VALORANT          → product=valorant
 *   - Teamfight Tactics → product=league_of_legends, patchline=tft (lives inside LoL)
 *   - LoR (Legends of Runeterra) → product=bacon
 *   - 2XKO (early access) → product=fighter
 *
 * Launching via the URI keeps Riot's patcher/anti-cheat happy. We never
 * spawn the client exe directly.
 */

interface RiotInstall {
  product: string
  patchline: string
  displayName: string
  installDir: string
  /** Used to derive a stable library id. */
  productKey: string
}

const KNOWN_PRODUCTS: Array<{
  /** Folder name match (case-insensitive substring). */
  folder: RegExp
  /** Riot product/patchline. */
  product: string
  patchline: string
  displayName: string
  productKey: string
}> = [
  {
    folder: /league of legends/i,
    product: 'league_of_legends',
    patchline: 'live',
    displayName: 'League of Legends',
    productKey: 'lol'
  },
  {
    folder: /valorant/i,
    product: 'valorant',
    patchline: 'live',
    displayName: 'VALORANT',
    productKey: 'valorant'
  },
  {
    folder: /legends? of runeterra|runeterra/i,
    product: 'bacon',
    patchline: 'live',
    displayName: 'Legends of Runeterra',
    productKey: 'lor'
  },
  {
    folder: /2xko|fighter/i,
    product: 'fighter',
    patchline: 'live',
    displayName: '2XKO',
    productKey: '2xko'
  }
]

/**
 * Roots we look in. We pull from the user's configured `gameRoots` plus
 * standard install paths so a stock Riot install is detected even before
 * the user adds anything to GameHub.
 */
const STANDARD_ROOTS = [
  'C:\\Riot Games',
  'C:\\Program Files\\Riot Games',
  'C:\\Program Files (x86)\\Riot Games',
  'D:\\Riot Games',
  'D:\\Jogos\\Riot Games',
  'D:\\Games\\Riot Games',
  'E:\\Riot Games',
  'E:\\Jogos\\Riot Games',
  'E:\\Games\\Riot Games',
  'F:\\Riot Games',
  'F:\\Jogos\\Riot Games',
  'G:\\Riot Games'
]

/**
 * Riot ships a `RiotClientInstalls.json` next to every installed product. It
 * lists install paths the Riot Client knows about — checking it picks up
 * non-default install locations without depending on the user adding the
 * folder to gameRoots.
 */
const RIOT_INSTALLS_MANIFEST =
  'C:\\ProgramData\\Riot Games\\RiotClientInstalls.json'

function rootsFromManifest(): string[] {
  if (!existsSync(RIOT_INSTALLS_MANIFEST)) return []
  try {
    const data = JSON.parse(readFileSync(RIOT_INSTALLS_MANIFEST, 'utf8')) as Record<string, unknown>
    const out = new Set<string>()
    const associated = data.associated_client
    if (associated && typeof associated === 'object') {
      for (const key of Object.keys(associated)) {
        // Key is the install path (e.g. "C:/Riot Games/League of Legends/").
        const cleaned = key.replace(/\//g, '\\').replace(/\\+$/, '')
        // The product folder lives one level above the per-product subfolder.
        const parent = cleaned.split('\\').slice(0, -1).join('\\')
        if (parent) out.add(parent)
      }
    }
    return Array.from(out)
  } catch {
    return []
  }
}

export function detectRiotGames(): RiotInstall[] {
  const out: RiotInstall[] = []
  const roots = new Set<string>(STANDARD_ROOTS)
  // Riot Client's own manifest of known installs (covers non-default paths).
  for (const r of rootsFromManifest()) roots.add(r)
  // Also probe each gameRoot for a "Riot Games" subdir.
  for (const root of settingsStore.load().gameRoots) {
    roots.add(join(root, 'Riot Games'))
    // The root itself might already be a Riot Games dir
    roots.add(root)
  }

  for (const root of roots) {
    if (!existsSync(root)) continue
    let entries: string[]
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }
    for (const entry of entries) {
      const installDir = join(root, entry)
      let st
      try {
        st = statSync(installDir)
      } catch {
        continue
      }
      if (!st.isDirectory()) continue
      const match = KNOWN_PRODUCTS.find((p) => p.folder.test(entry))
      if (!match) continue
      // Dedup by productKey — multiple roots may surface the same install.
      if (out.some((g) => g.productKey === match.productKey)) continue
      out.push({
        product: match.product,
        patchline: match.patchline,
        displayName: match.displayName,
        installDir,
        productKey: match.productKey
      })
    }
  }
  log.info('riot', `detected ${out.length} Riot game(s)`)
  return out
}

export function riotLaunchUri(product: string, patchline: string): string {
  return `riotclient://riot-client/launch?product=${product}&patchline=${patchline}`
}

/**
 * Import detected Riot installs as library entries. Idempotent — ids are
 * derived from productKey so re-imports just refresh title/size.
 */
export async function importRiotGames(): Promise<{ added: number; updated: number }> {
  const installs = detectRiotGames()
  const existing = libraryStore.load().games
  let added = 0
  let updated = 0
  for (const inst of installs) {
    const id = `riot_${inst.productKey}`
    const wasThere = existing.find((g) => g.id === id)
    const game: Game = {
      id,
      title: inst.displayName,
      path: riotLaunchUri(inst.product, inst.patchline),
      platform: 'pc',
      emulator: 'native',
      sizeBytes: safeDirSize(inst.installDir),
      confidence: 1,
      status: 'ready',
      addedAt: wasThere?.addedAt ?? new Date().toISOString(),
      lastPlayedAt: wasThere?.lastPlayedAt,
      playTime: wasThere?.playTime ?? 0,
      favorite: wasThere?.favorite ?? false,
      cover: wasThere?.cover,
      banner: wasThere?.banner,
      description: wasThere?.description,
      flags: ['riot', 'adicionado manualmente'],
      relatedFiles: [inst.installDir]
    }
    libraryStore.addGame(game)
    if (wasThere) updated++
    else added++
  }
  log.info('riot', `imported Riot games: +${added} added, ${updated} updated`)
  // Stable id so we don't grow unbounded — keep the hash util in case
  // future products lack a productKey.
  void createHash
  return { added, updated }
}

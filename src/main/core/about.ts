import { app } from 'electron'
import { libraryStore } from './store'
import { PATHS } from './paths'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './logger'

export interface AppInfo {
  /** semver from package.json */
  version: string
  /** Electron + Chromium + Node versions for "report this bug" */
  versions: {
    electron: string
    chrome: string
    node: string
    v8: string
  }
  /** key on-disk paths */
  paths: {
    userData: string
    library: string
    logs: string
    covers: string
    saves: string
  }
  /** rolled-up stats */
  stats: {
    games: number
    emulators: number
    readyGames: number
    coversCached: number
    saveSnapshots: number
  }
}

function countFiles(dir: string, suffix = ''): number {
  try {
    return readdirSync(dir).filter((f) => f.toLowerCase().endsWith(suffix)).length
  } catch {
    return 0
  }
}

function countSnapshots(): number {
  try {
    let n = 0
    for (const game of readdirSync(PATHS.saves)) {
      const sub = join(PATHS.saves, game)
      try {
        if (!statSync(sub).isDirectory()) continue
        n += readdirSync(sub).filter((s) => {
          try {
            return statSync(join(sub, s)).isDirectory()
          } catch {
            return false
          }
        }).length
      } catch {
        /* skip */
      }
    }
    return n
  } catch {
    return 0
  }
}

export function collectAbout(): AppInfo {
  const data = libraryStore.load()
  return {
    version: app.getVersion(),
    versions: {
      electron: process.versions.electron ?? '?',
      chrome: process.versions.chrome ?? '?',
      node: process.versions.node ?? '?',
      v8: process.versions.v8 ?? '?'
    },
    paths: {
      userData: PATHS.userData,
      library: PATHS.libraryFile,
      logs: PATHS.logs,
      covers: PATHS.covers,
      saves: PATHS.saves
    },
    stats: {
      games: data.games.length,
      emulators: data.emulators.length,
      readyGames: data.games.filter((g) => g.status === 'ready').length,
      coversCached: countFiles(PATHS.covers, '.png') + countFiles(PATHS.covers, '.jpg'),
      saveSnapshots: countSnapshots()
    }
  }
}

export interface UpdateInfo {
  current: string
  latest?: string
  newer: boolean
  releaseUrl?: string
  notes?: string
  error?: string
}

/**
 * Check a release manifest URL for a newer version.
 *
 * Defaults to a placeholder URL that does NOT exist yet — set
 * `process.env.GAMEHUB_UPDATE_URL` (or pass a custom url) once the project
 * has real releases. The manifest format is intentionally simple:
 *
 *   {
 *     "version": "0.2.1",
 *     "releaseUrl": "https://github.com/.../releases/tag/v0.2.1",
 *     "notes": "Bug fixes..."
 *   }
 *
 * Either GitHub's releases JSON or a hand-rolled manifest works.
 */
const DEFAULT_MANIFEST_URL =
  process.env.GAMEHUB_UPDATE_URL ?? 'https://example.invalid/gamehub-latest.json'

export async function checkForUpdate(url: string = DEFAULT_MANIFEST_URL): Promise<UpdateInfo> {
  const current = app.getVersion()
  try {
    const r = await fetch(url, { method: 'GET' })
    if (!r.ok) {
      return { current, newer: false, error: `HTTP ${r.status}` }
    }
    const body = (await r.json()) as { version?: string; releaseUrl?: string; notes?: string }
    if (!body.version) return { current, newer: false, error: 'manifest sem campo "version"' }
    const newer = compareSemver(body.version, current) > 0
    log.info('update', `current=${current} latest=${body.version} newer=${newer}`)
    return {
      current,
      latest: body.version,
      newer,
      releaseUrl: body.releaseUrl,
      notes: body.notes
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn('update', `check failed: ${msg}`)
    return { current, newer: false, error: msg }
  }
}

/** Returns 1 if a > b, -1 if a < b, 0 if equal. Accepts "1.2.3" or "1.2.3-rc.1". */
function compareSemver(a: string, b: string): number {
  const norm = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('-')[0]
      .split('.')
      .map((x) => parseInt(x, 10) || 0)
  const aa = norm(a)
  const bb = norm(b)
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const x = aa[i] ?? 0
    const y = bb[i] ?? 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

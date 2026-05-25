import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { libraryStore } from './store'
import { PATHS } from './paths'
import { log } from './logger'
import type { HealthIssue, HealthIssueKind, HealthReport } from '@shared/types'

/**
 * Walk the library + cover/banner caches and report anything fishy:
 *   - game.path doesn't exist on disk anymore (file moved/deleted)
 *   - game.path exists but stat fails (permission / I/O error)
 *   - cover/banner files cached for games we no longer have
 */
export async function runHealthCheck(): Promise<HealthReport> {
  const started = Date.now()
  const issues: HealthIssue[] = []
  let orphanBytes = 0

  const data = libraryStore.load()
  const gameIds = new Set(data.games.map((g) => g.id))

  // 1. Check every game's path
  for (const g of data.games) {
    if (!g.path) continue
    if (!existsSync(g.path)) {
      issues.push({
        kind: 'missing-file',
        gameId: g.id,
        gameTitle: g.title,
        path: g.path,
        message: `Arquivo não existe mais no disco.`
      })
      continue
    }
    try {
      statSync(g.path)
    } catch (err) {
      issues.push({
        kind: 'unreadable-file',
        gameId: g.id,
        gameTitle: g.title,
        path: g.path,
        message: `Erro de leitura: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  }

  // 2. Walk cover + banner caches for orphans (game id no longer in library)
  const caches: Array<[string, HealthIssueKind]> = [
    [PATHS.covers, 'orphan-cover'],
    [PATHS.banners, 'orphan-banner']
  ]
  for (const [dir, kind] of caches) {
    try {
      for (const file of readdirSync(dir)) {
        const stem = file.replace(/\.[^.]+$/, '')
        if (gameIds.has(stem)) continue
        const full = join(dir, file)
        let size = 0
        try {
          size = statSync(full).size
        } catch {
          /* ignore */
        }
        orphanBytes += size
        issues.push({
          kind,
          path: full,
          message: `Arquivo de capa/banner sem jogo correspondente (${(size / 1024).toFixed(1)} KB).`
        })
      }
    } catch {
      /* dir doesn't exist yet — nothing to check */
    }
  }

  const report: HealthReport = {
    issues,
    orphanBytes,
    durationMs: Date.now() - started
  }
  log.info(
    'health',
    `check complete: ${issues.length} issues, ${(orphanBytes / 1024).toFixed(1)} KB of orphans, ${report.durationMs}ms`
  )
  return report
}

/**
 * Bulk-remove orphan cover/banner files. The action is safe — these are by
 * definition unreferenced cache files. Returns the number freed and bytes
 * reclaimed.
 */
export async function cleanOrphans(): Promise<{ removed: number; bytes: number }> {
  const report = await runHealthCheck()
  const orphans = report.issues.filter(
    (i) => i.kind === 'orphan-cover' || i.kind === 'orphan-banner'
  )
  const { unlinkSync } = await import('node:fs')
  let removed = 0
  let bytes = 0
  for (const o of orphans) {
    try {
      let size = 0
      try {
        size = statSync(o.path).size
      } catch {
        /* ignore */
      }
      unlinkSync(o.path)
      removed++
      bytes += size
    } catch (err) {
      log.warn('health', `failed to delete orphan ${o.path}: ${String(err)}`)
    }
  }
  log.info('health', `cleaned ${removed} orphans, freed ${(bytes / 1024).toFixed(1)} KB`)
  return { removed, bytes }
}

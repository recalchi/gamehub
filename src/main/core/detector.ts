import { basename, dirname, extname } from 'node:path'
import { readdirSync, statSync, existsSync } from 'node:fs'
import {
  AMBIGUOUS_EXTENSIONS,
  ARCHIVE_EXTENSIONS,
  PATH_HINTS,
  PLATFORMS
} from '@shared/platforms'
import type { PlatformId } from '@shared/types'

export interface DetectionResult {
  platform: PlatformId
  confidence: number
  flags: string[]
}

/**
 * Classify a single file path into a platform.
 *
 * Strategy (highest signal first):
 *   1. Path hints — folder names like "PS2", "Nintendo 64" are strong signals.
 *   2. Extension lookup — unambiguous extensions (`.nes`, `.gba`, `.iso` *and*
 *      path hint) win immediately.
 *   3. Sibling-file heuristics — a `.cue` next to multiple `.bin` is PS1.
 *   4. Fallback to `unknown` with confidence 0.2.
 *
 * Confidence is a 0..1 score we expose so the UI can flag suspicious entries.
 */
export function detectPlatform(filePath: string): DetectionResult {
  const flags: string[] = []
  const lower = filePath.toLowerCase()
  const ext = extname(lower).slice(1)
  const name = basename(lower)

  // PS3 disc folders contain a PS3_GAME subfolder — handle that special case first.
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    try {
      const children = readdirSync(filePath).map((c) => c.toLowerCase())
      if (children.includes('ps3_game')) {
        return { platform: 'ps3', confidence: 0.95, flags }
      }
      if (children.some((c) => c.endsWith('.iso') && c.startsWith('slus'))) {
        return { platform: 'ps2', confidence: 0.85, flags: ['folder contains PS2 ISO'] }
      }
    } catch {
      /* ignore unreadable dir */
    }
  }

  // 1. Path hint scan
  let pathHint = PATH_HINTS.find((h) => h.pattern.test(lower))

  // 1b. Xbox folders are often named just "XBOX" but contain 360 dumps. The
  // original Xbox DVD format caps at ~6.8GB; anything bigger has to be 360.
  // Promote `xbox` → `xbox360` when the file is suspiciously large for OG.
  if (pathHint?.platform === 'xbox' && ext === 'iso' && existsSync(filePath)) {
    try {
      const st = statSync(filePath)
      if (st.isFile() && st.size > 7 * 1024 * 1024 * 1024) {
        pathHint = { pattern: /./, platform: 'xbox360' }
        flags.push('ISO > 7GB — promovido para Xbox 360')
      }
    } catch {
      /* ignore */
    }
  }

  // Archives are surfaced but flagged as needing extraction
  if (ARCHIVE_EXTENSIONS.has(ext)) {
    flags.push(`compactado (.${ext}) — extrair antes de jogar`)
    if (pathHint) {
      return { platform: pathHint.platform, confidence: 0.4, flags }
    }
    return { platform: 'unknown', confidence: 0.2, flags }
  }

  // 2. Extension-based lookup
  for (const platform of Object.values(PLATFORMS)) {
    if (platform.id === 'unknown') continue
    if (platform.extensions.includes(ext)) {
      const ambiguous = AMBIGUOUS_EXTENSIONS.has(ext)
      // Disambiguate using path hint
      if (ambiguous && pathHint) {
        return { platform: pathHint.platform, confidence: 0.9, flags }
      }
      // Disambiguate using sibling-file heuristics for .cue/.bin
      if (ext === 'cue') {
        const cueHints = inspectCue(filePath)
        cueHints.flags.forEach((f) => flags.push(f))
        return {
          platform: pathHint?.platform ?? cueHints.platform ?? 'ps1',
          confidence: pathHint ? 0.9 : cueHints.platform ? 0.7 : 0.55,
          flags
        }
      }
      if (ambiguous) {
        flags.push('extensão genérica — confirme a plataforma manualmente')
        // .pkg defaults to PS3 (more common than PS4 pkg dumps); .iso defaults to PS2.
        const fallback: PlatformId = ext === 'pkg' ? 'ps3' : 'ps2'
        return { platform: fallback, confidence: 0.45, flags }
      }
      return { platform: platform.id, confidence: 0.95, flags }
    }
  }

  // 3. Pure folder name fallback
  if (pathHint) {
    flags.push('detectado pelo nome da pasta')
    return { platform: pathHint.platform, confidence: 0.35, flags }
  }

  // 4. PC executable in well-known PC roots
  if (ext === 'exe' || ext === 'bat' || ext === 'cmd' || ext === 'lnk') {
    return { platform: 'pc', confidence: 0.6, flags }
  }

  flags.push(`extensão desconhecida (.${ext || '?'})`)
  return { platform: 'unknown', confidence: 0.1, flags }

  function inspectCue(cuePath: string): { platform: PlatformId | null; flags: string[] } {
    const out: string[] = []
    try {
      const dir = dirname(cuePath)
      const stem = basename(cuePath, '.cue').toLowerCase()
      const tracks = readdirSync(dir).filter(
        (f) => f.toLowerCase().startsWith(stem) && f.toLowerCase().endsWith('.bin')
      )
      if (tracks.length > 1) out.push(`${tracks.length} tracks BIN — disco multi-track`)
      if (tracks.length === 0) out.push('cue sem .bin correspondente — arquivo suspeito')
      return { platform: 'ps1', flags: out }
    } catch {
      return { platform: null, flags: out }
    }
  }
}

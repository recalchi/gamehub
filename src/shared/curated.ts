import type { PlatformId } from './types'

/**
 * Curated catalog of legal free / open-source / public-domain games.
 *
 * Inclusion rules:
 *   - License must allow free redistribution (CC0, public domain, MIT, GPL,
 *     "freeware" with explicit author permission, etc.)
 *   - URL must be a stable direct download (GitHub release asset, archive.org,
 *     project site). We never link to suspicious mirrors.
 *   - No commercial ROMs ever, even abandonware.
 *
 * The user can supplement this with their own URLs via the "Add Game" modal
 * "Baixar de URL" tab — this catalog is just convenience curation.
 */

export interface CuratedEntry {
  id: string
  title: string
  platform: PlatformId
  /** Direct-download URL */
  url: string
  /** Plain English license note (CC0, MIT, etc.) */
  license: string
  /** One-liner about the game */
  description: string
  /** Optional homepage to learn more (opens in external browser) */
  homepage?: string
  /** Optional cover URL (we'll cache it like libretro covers) */
  cover?: string
  /** SHA256 of the downloaded file — set when we have a way to verify */
  sha256?: string
  /** Approximate size in MB, for UX before download starts */
  approxSizeMb?: number
}

export const CURATED_CATALOG: CuratedEntry[] = [
  {
    id: 'anarch-pc',
    title: 'Anarch',
    platform: 'pc',
    url: 'https://drummyfish.gitlab.io/anarch/bin/anarch_sdl_windows.zip',
    license: 'CC0 / Public Domain',
    description:
      'Doom-like FPS pequeno e portável, criado por drummyfish. Renderiza por software, roda em qualquer hardware.',
    homepage: 'https://drummyfish.gitlab.io/anarch/',
    approxSizeMb: 1
  },
  {
    id: 'tinyfugue-readme',
    title: 'GameHub Demo Readme',
    platform: 'pc',
    url: 'https://raw.githubusercontent.com/octocat/Hello-World/master/README',
    license: 'Test fixture',
    description:
      'Entrada de teste — baixa um arquivo de 13 bytes do repositório octocat/Hello-World do GitHub. Útil para validar a infraestrutura de download.',
    approxSizeMb: 1
  }
  // Add more entries here. Keep the catalog short — the goal is a polished
  // showcase, not a comprehensive index.
]

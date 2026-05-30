import type { PlatformId, PlatformInfo } from './types'

/**
 * Authoritative catalog of supported platforms.
 *
 * `extensions` lists the file extensions we treat as strong evidence for a
 * platform; `emulators` lists the launchers we prefer when one is present.
 *
 * Some platforms share extensions (PS1 / PS2 / PSP all use .iso/.bin/.chd),
 * so the detector also uses path heuristics — see `detector.ts`.
 */
export const PLATFORMS: Record<PlatformId, PlatformInfo> = {
  nes: {
    id: 'nes',
    name: 'Nintendo Entertainment System',
    shortName: 'NES',
    manufacturer: 'Nintendo',
    extensions: ['nes', 'fds', 'unf', 'unif'],
    emulators: ['mesen', 'retroarch'],
    color: '#b91c1c',
    releaseYear: 1983
  },
  snes: {
    id: 'snes',
    name: 'Super Nintendo',
    shortName: 'SNES',
    manufacturer: 'Nintendo',
    extensions: ['smc', 'sfc', 'fig', 'swc'],
    emulators: ['mesen', 'retroarch'],
    color: '#7c3aed',
    releaseYear: 1990
  },
  n64: {
    id: 'n64',
    name: 'Nintendo 64',
    shortName: 'N64',
    manufacturer: 'Nintendo',
    extensions: ['n64', 'z64', 'v64', 'ndd'],
    emulators: ['retroarch'],
    color: '#16a34a',
    releaseYear: 1996
  },
  gamecube: {
    id: 'gamecube',
    name: 'Nintendo GameCube',
    shortName: 'GameCube',
    manufacturer: 'Nintendo',
    extensions: ['gcm', 'gcz', 'rvz', 'iso'],
    emulators: ['dolphin'],
    color: '#6366f1',
    releaseYear: 2001
  },
  wii: {
    id: 'wii',
    name: 'Nintendo Wii',
    shortName: 'Wii',
    manufacturer: 'Nintendo',
    extensions: ['wbfs', 'wad', 'rvz', 'iso'],
    emulators: ['dolphin'],
    color: '#0ea5e9',
    releaseYear: 2006
  },
  gb: {
    id: 'gb',
    name: 'Game Boy',
    shortName: 'GB',
    manufacturer: 'Nintendo',
    extensions: ['gb'],
    emulators: ['mesen', 'mgba', 'retroarch'],
    color: '#a3a3a3',
    releaseYear: 1989
  },
  gbc: {
    id: 'gbc',
    name: 'Game Boy Color',
    shortName: 'GBC',
    manufacturer: 'Nintendo',
    extensions: ['gbc'],
    emulators: ['mesen', 'mgba', 'retroarch'],
    color: '#f97316',
    releaseYear: 1998
  },
  gba: {
    id: 'gba',
    name: 'Game Boy Advance',
    shortName: 'GBA',
    manufacturer: 'Nintendo',
    extensions: ['gba'],
    emulators: ['mgba', 'retroarch'],
    color: '#8b5cf6',
    releaseYear: 2001
  },
  nds: {
    id: 'nds',
    name: 'Nintendo DS',
    shortName: 'NDS',
    manufacturer: 'Nintendo',
    extensions: ['nds'],
    emulators: ['desmume', 'retroarch'],
    color: '#f43f5e',
    releaseYear: 2004
  },
  n3ds: {
    id: 'n3ds',
    name: 'Nintendo 3DS',
    shortName: '3DS',
    manufacturer: 'Nintendo',
    extensions: ['3ds', 'cci', 'cxi', '3dsx'],
    emulators: ['citra'],
    color: '#ec4899',
    releaseYear: 2011
  },
  switch: {
    id: 'switch',
    name: 'Nintendo Switch',
    shortName: 'Switch',
    manufacturer: 'Nintendo',
    extensions: ['nsp', 'xci', 'nca'],
    emulators: ['ryujinx'],
    color: '#dc2626',
    releaseYear: 2017
  },
  ps1: {
    id: 'ps1',
    name: 'PlayStation',
    shortName: 'PS1',
    manufacturer: 'Sony',
    extensions: ['bin', 'cue', 'iso', 'chd', 'pbp', 'ecm', 'img', 'mdf'],
    emulators: ['duckstation', 'epsxe', 'psxfin', 'retroarch'],
    color: '#0ea5e9',
    releaseYear: 1994
  },
  ps2: {
    id: 'ps2',
    name: 'PlayStation 2',
    shortName: 'PS2',
    manufacturer: 'Sony',
    extensions: ['iso', 'chd', 'cso', 'gz', 'mdf', 'nrg'],
    emulators: ['pcsx2'],
    color: '#1d4ed8',
    releaseYear: 2000
  },
  ps3: {
    id: 'ps3',
    name: 'PlayStation 3',
    shortName: 'PS3',
    manufacturer: 'Sony',
    extensions: ['pkg', 'iso'],
    emulators: ['rpcs3'],
    color: '#1e3a8a',
    releaseYear: 2006
  },
  ps4: {
    id: 'ps4',
    name: 'PlayStation 4',
    shortName: 'PS4',
    manufacturer: 'Sony',
    extensions: ['pkg'],
    // fpPS4 first — handles UE4 games that crash on shadPS4 (Elden Ring etc).
    // shadPS4 fallback for indies/smaller games where fpPS4 may regress.
    emulators: ['fpps4', 'shadps4'],
    color: '#0c2a6b',
    releaseYear: 2013
  },
  psp: {
    id: 'psp',
    name: 'PlayStation Portable',
    shortName: 'PSP',
    manufacturer: 'Sony',
    extensions: ['iso', 'cso', 'pbp'],
    emulators: ['ppsspp'],
    color: '#0f766e',
    releaseYear: 2004
  },
  xbox: {
    id: 'xbox',
    name: 'Xbox',
    shortName: 'Xbox',
    manufacturer: 'Microsoft',
    extensions: ['iso', 'xbe', 'xiso'],
    emulators: ['xemu'],
    color: '#22c55e',
    releaseYear: 2001
  },
  xbox360: {
    id: 'xbox360',
    name: 'Xbox 360',
    shortName: 'X360',
    manufacturer: 'Microsoft',
    extensions: ['iso', 'xex'],
    emulators: ['xenia'],
    color: '#65a30d',
    releaseYear: 2005
  },
  pc: {
    id: 'pc',
    name: 'PC',
    shortName: 'PC',
    manufacturer: 'PC',
    extensions: ['exe', 'bat', 'cmd', 'lnk', 'url', 'jar'],
    emulators: ['native'],
    color: '#f59e0b',
    releaseYear: 1981
  },
  unknown: {
    id: 'unknown',
    name: 'Desconhecido',
    shortName: '???',
    manufacturer: 'Other',
    extensions: [],
    emulators: ['unknown'],
    color: '#64748b',
    releaseYear: 9999
  }
}

export const PLATFORM_LIST: PlatformInfo[] = Object.values(PLATFORMS)
  .filter((p) => p.id !== 'unknown')
  .sort((a, b) => a.releaseYear - b.releaseYear)

/** Extensions that are ambiguous and require path / sibling-file heuristics */
export const AMBIGUOUS_EXTENSIONS = new Set(['iso', 'bin', 'cue', 'chd', 'pbp', 'cso', 'gz', 'pkg'])

/** Archive extensions — we surface them but don't auto-extract */
export const ARCHIVE_EXTENSIONS = new Set(['zip', '7z', 'rar', 'tar', 'gz'])

/**
 * Path-substring hints used when the extension alone is ambiguous.
 * Order matters — first match wins.
 */
export const PATH_HINTS: Array<{ pattern: RegExp; platform: PlatformId }> = [
  { pattern: /\b(ps1|psx|playstation 1|playstation\b(?!\s*[23]))/i, platform: 'ps1' },
  { pattern: /\b(ps2|playstation 2)\b/i, platform: 'ps2' },
  { pattern: /\b(ps3|playstation 3)\b/i, platform: 'ps3' },
  { pattern: /\b(ps4|playstation 4)\b/i, platform: 'ps4' },
  { pattern: /\b(psp|playstation portable)\b/i, platform: 'psp' },
  { pattern: /\b(gamecube|ngc|gcn)\b/i, platform: 'gamecube' },
  { pattern: /\b(wii)\b/i, platform: 'wii' },
  { pattern: /\b(xbox 360|x360|xbox360)\b/i, platform: 'xbox360' },
  { pattern: /\b(xbox)\b/i, platform: 'xbox' },
  { pattern: /\b(n64|nintendo 64)\b/i, platform: 'n64' },
  { pattern: /\b(snes|super nintendo)\b/i, platform: 'snes' },
  { pattern: /\b(nes|famicom)\b/i, platform: 'nes' },
  { pattern: /\b(gba|game boy advance)\b/i, platform: 'gba' },
  { pattern: /\b(gbc|game boy color)\b/i, platform: 'gbc' },
  { pattern: /\b(\bgb\b|game boy)\b/i, platform: 'gb' },
  { pattern: /\b(nds|nintendo ds)\b/i, platform: 'nds' },
  { pattern: /\b(3ds|nintendo 3ds)\b/i, platform: 'n3ds' },
  { pattern: /\b(switch|nx)\b/i, platform: 'switch' }
]

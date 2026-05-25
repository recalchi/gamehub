import type { DetectedEmulator, EmulatorId, PlatformId } from './types'

export interface EmulatorDefinition {
  id: EmulatorId
  name: string
  /** executable filenames (lowercase) we recognise on disk */
  executables: string[]
  /** path-substring hints to map a folder to this emulator */
  pathHints: RegExp[]
  /** platforms this emulator can launch */
  platforms: PlatformId[]
  /**
   * Build the argv list passed to the executable.
   * Defaults to `[gamePath]` for most emulators.
   */
  buildArgs?: (gamePath: string) => string[]
  /** Does this emulator need BIOS files to function? */
  needsBios?: boolean
  /** Official site for documentation, downloads, BIOS guidance. */
  website?: string
  /** Free-form help text shown in the emulator setup card. */
  setupHelp?: string
}

const passthrough = (p: string): string[] => [p]

export const EMULATORS: Record<EmulatorId, EmulatorDefinition> = {
  retroarch: {
    id: 'retroarch',
    name: 'RetroArch',
    executables: ['retroarch.exe'],
    pathHints: [/retroarch/i],
    platforms: ['nes', 'snes', 'n64', 'gb', 'gbc', 'gba', 'nds', 'ps1'],
    buildArgs: (p) => [p]
  },
  epsxe: {
    id: 'epsxe',
    name: 'ePSXe',
    executables: ['epsxe.exe'],
    pathHints: [/epsxe/i],
    platforms: ['ps1'],
    buildArgs: (p) => ['-nogui', '-loadbin', p],
    needsBios: true,
    website: 'https://www.epsxe.com/',
    setupHelp: 'Coloque a BIOS PS1 (ex.: SCPH1001.BIN) em ePSXe/bios/.'
  },
  duckstation: {
    id: 'duckstation',
    name: 'DuckStation',
    executables: ['duckstation-qt-x64-releaselTCG.exe', 'duckstation-qt-x64-release.exe', 'duckstation-nogui-x64-release.exe', 'duckstation.exe'],
    pathHints: [/duckstation/i],
    platforms: ['ps1'],
    buildArgs: (p) => [p],
    needsBios: true,
    website: 'https://www.duckstation.org/',
    setupHelp: 'BIOS PS1 em DuckStation/bios/ ou %USERPROFILE%/Documents/DuckStation/bios/.'
  },
  psxfin: {
    id: 'psxfin',
    name: 'pSX (psxfin)',
    executables: ['psxfin.exe'],
    pathHints: [/pcsx[_-]?\d|psxfin/i],
    platforms: ['ps1'],
    buildArgs: (p) => [p],
    needsBios: true,
    setupHelp: 'BIOS PS1 em psxfin/bios/ (ex.: SCPH1001.BIN).'
  },
  pcsx2: {
    id: 'pcsx2',
    name: 'PCSX2',
    executables: ['pcsx2-qt.exe', 'pcsx2.exe', 'pcsx2x64.exe'],
    pathHints: [/pcsx2/i],
    platforms: ['ps2'],
    buildArgs: (p) => ['-fullscreen', '-batch', p],
    needsBios: true,
    website: 'https://pcsx2.net/docs/setup/bios',
    setupHelp:
      'PCSX2 Qt usa %USERPROFILE%/Documents/PCSX2/bios/ por padrão. Coloque scph10000.bin (ou similar) lá.'
  },
  rpcs3: {
    id: 'rpcs3',
    name: 'RPCS3',
    executables: ['rpcs3.exe'],
    pathHints: [/rpcs3/i],
    platforms: ['ps3'],
    buildArgs: (p) => ['--no-gui', p],
    needsBios: true,
    website: 'https://rpcs3.net/quickstart',
    setupHelp:
      'Baixe PS3UPDAT.PUP da Sony e instale via "File → Install Firmware" no RPCS3 (popula dev_flash).'
  },
  dolphin: {
    id: 'dolphin',
    name: 'Dolphin',
    executables: ['dolphin.exe', 'dolphin-x64.exe'],
    pathHints: [/dolphin/i],
    platforms: ['gamecube', 'wii'],
    buildArgs: (p) => ['/b', '/e', p],
    website: 'https://dolphin-emu.org/',
    setupHelp: 'Não precisa de BIOS — Dolphin emula via HLE.'
  },
  ppsspp: {
    id: 'ppsspp',
    name: 'PPSSPP',
    executables: ['ppssppwindows.exe', 'ppssppwindows64.exe', 'ppsspp.exe'],
    pathHints: [/ppsspp/i],
    platforms: ['psp'],
    buildArgs: (p) => ['--fullscreen', p],
    website: 'https://www.ppsspp.org/',
    setupHelp: 'Não precisa de BIOS — PPSSPP emula via HLE.'
  },
  xemu: {
    id: 'xemu',
    name: 'xemu',
    executables: ['xemu.exe'],
    pathHints: [/xemu/i],
    platforms: ['xbox'],
    buildArgs: (p) => ['-full-screen', '-dvd_path', p],
    needsBios: true
  },
  mgba: {
    id: 'mgba',
    name: 'mGBA',
    executables: ['mgba.exe', 'mgba-qt.exe'],
    pathHints: [/mgba/i],
    platforms: ['gb', 'gbc', 'gba'],
    buildArgs: passthrough
  },
  desmume: {
    id: 'desmume',
    name: 'DeSmuME',
    executables: ['desmume.exe', 'desmume_x64.exe'],
    pathHints: [/desmume/i],
    platforms: ['nds'],
    buildArgs: passthrough
  },
  citra: {
    id: 'citra',
    name: 'Citra',
    executables: ['citra-qt.exe', 'citra.exe'],
    pathHints: [/citra/i],
    platforms: ['n3ds'],
    buildArgs: passthrough
  },
  ryujinx: {
    id: 'ryujinx',
    name: 'Ryujinx',
    executables: ['ryujinx.exe'],
    pathHints: [/ryujinx/i],
    platforms: ['switch'],
    buildArgs: passthrough
  },
  native: {
    id: 'native',
    name: 'Nativo (Windows)',
    executables: [],
    pathHints: [],
    platforms: ['pc'],
    buildArgs: passthrough
  },
  unknown: {
    id: 'unknown',
    name: 'Desconhecido',
    executables: [],
    pathHints: [],
    platforms: []
  }
}

export const EMULATOR_LIST: EmulatorDefinition[] = Object.values(EMULATORS).filter(
  (e) => e.id !== 'unknown'
)

export function defaultEmulator(): DetectedEmulator {
  return {
    id: 'unknown',
    name: 'Desconhecido',
    executable: '',
    installPath: '',
    platforms: [],
    source: 'auto'
  }
}

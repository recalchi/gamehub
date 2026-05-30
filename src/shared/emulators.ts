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
  buildArgs?: (gamePath: string, options?: LaunchArgOptions) => string[]
  /** Does this emulator need BIOS files to function? */
  needsBios?: boolean
  /** Official site for documentation, downloads, BIOS guidance. */
  website?: string
  /** Free-form help text shown in the emulator setup card. */
  setupHelp?: string
}

export interface LaunchArgOptions {
  fullscreen: boolean
}

const passthrough = (p: string): string[] => [p]

export const EMULATORS: Record<EmulatorId, EmulatorDefinition> = {
  retroarch: {
    id: 'retroarch',
    name: 'RetroArch',
    executables: ['retroarch.exe'],
    pathHints: [/retroarch/i],
    platforms: ['nes', 'snes', 'n64', 'gb', 'gbc', 'gba', 'nds', 'ps1'],
    buildArgs: (p, options) => (options?.fullscreen ? ['--fullscreen', p] : [p])
  },
  mesen: {
    id: 'mesen',
    name: 'Mesen',
    executables: ['mesen.exe'],
    pathHints: [/mesen/i],
    platforms: ['nes', 'snes', 'gb', 'gbc'],
    // Mesen accepts ROM path directly + auto-detects platform from extension.
    buildArgs: (p, options) => (options?.fullscreen ? ['--fullscreen', p] : [p]),
    website: 'https://www.mesen.ca/',
    setupHelp: 'Mesen emula NES/SNES/GB/GBC com HLE — não precisa de BIOS.'
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
    buildArgs: (p, options) => (options?.fullscreen ? ['-fullscreen', p] : [p]),
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
    buildArgs: (p, options) => (options?.fullscreen ? ['-fullscreen', '-batch', p] : ['-batch', p]),
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
    // Pass ONLY the boot path. We used to send --no-gui but RPCS3 silently
    // exits with that flag when anything's missing (firmware prompt, first-
    // launch wizard, input config). Empirically, launching manually = the
    // GUI shows briefly, the game starts; launching from GameHub w/ --no-gui
    // = the window flashes and closes with no diagnostics. Letting the GUI
    // open is harmless (it auto-boots the game) and recovers every case.
    buildArgs: (p) => [p],
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
    buildArgs: (p, options) => (options?.fullscreen ? ['/b', '/e', p] : ['/e', p]),
    website: 'https://dolphin-emu.org/',
    setupHelp: 'Não precisa de BIOS — Dolphin emula via HLE.'
  },
  ppsspp: {
    id: 'ppsspp',
    name: 'PPSSPP',
    executables: ['ppssppwindows.exe', 'ppssppwindows64.exe', 'ppsspp.exe'],
    pathHints: [/ppsspp/i],
    platforms: ['psp'],
    buildArgs: (p, options) => (options?.fullscreen ? ['--fullscreen', p] : [p]),
    website: 'https://www.ppsspp.org/',
    setupHelp: 'Não precisa de BIOS — PPSSPP emula via HLE.'
  },
  xemu: {
    id: 'xemu',
    name: 'xemu',
    executables: ['xemu.exe'],
    pathHints: [/xemu/i],
    platforms: ['xbox'],
    buildArgs: (p, options) => (options?.fullscreen ? ['-full-screen', '-dvd_path', p] : ['-dvd_path', p]),
    needsBios: true
  },
  xenia: {
    id: 'xenia',
    name: 'Xenia',
    executables: ['xenia_canary.exe', 'xenia.exe'],
    pathHints: [/xenia/i],
    platforms: ['xbox360'],
    buildArgs: (p, options) => (options?.fullscreen ? ['--fullscreen', p] : [p]),
    website: 'https://xenia.jp/',
    setupHelp:
      'Xenia Canary roda jogos de Xbox 360 (.iso/.xex). Não precisa de BIOS — emula via HLE.'
  },
  shadps4: {
    id: 'shadps4',
    name: 'shadPS4',
    executables: ['shadps4.exe'],
    pathHints: [/shadps4/i],
    platforms: ['ps4'],
    // shadPS4's Qt build (v0.10 WIP) always shows the game-list GUI. There's
    // no headless launch flag we can rely on — we tried `-g`/`--game` and
    // both still surfaced the chooser. Pass the eboot path positionally so
    // it's pre-selected and shadPS4 opens with the game ready to "Jogar".
    buildArgs: (p) => [p],
    website: 'https://shadps4.net/',
    setupHelp:
      'shadPS4 é experimental. Após o GameHub iniciar, clique "Jogar" na lista do shadPS4 — não há modo headless ainda.'
  },
  fpps4: {
    id: 'fpps4',
    name: 'fpPS4',
    executables: ['fpps4.exe'],
    pathHints: [/fpps?4/i],
    platforms: ['ps4'],
    // fpPS4 takes -e <eboot> -f <app_folder>. The launcher pipeline derives
    // the app folder from the eboot's parent.
    buildArgs: (p) => ['-e', p],
    website: 'https://github.com/red-prig/fpPS4',
    setupHelp:
      'fpPS4 (red-prig) — alternativa ao shadPS4. Funciona com jogos UE4 que crasham no shadPS4 (Elden Ring testado). Aponta pro eboot.bin extraído.'
  },
  mgba: {
    id: 'mgba',
    name: 'mGBA',
    executables: ['mgba.exe', 'mgba-qt.exe'],
    pathHints: [/mgba/i],
    platforms: ['gb', 'gbc', 'gba'],
    buildArgs: (p, options) => (options?.fullscreen ? ['--fullscreen', p] : [p])
  },
  desmume: {
    id: 'desmume',
    name: 'DeSmuME',
    // Modern releases ship `DeSmuME_<version>_x64.exe` — the bare
    // `desmume_x64.exe` was the 2010 build. Detector falls back on any
    // .exe whose name starts with desmume + contains x64.
    executables: ['desmume.exe', 'desmume_x64.exe', 'desmume_0.9.13_x64.exe'],
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

import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { clipboard } from 'electron'
import { log } from './logger'

/**
 * shadPS4 launch resolver.
 *
 * shadPS4 doesn't directly "play" a .pkg. The workflow is:
 *   1. INSTALL the .pkg (extracts to <install-root>/<CUSA-id>/)
 *   2. LAUNCH the resulting eboot.bin
 *
 * When we just hand it the .pkg via argv, the Qt build interprets that as
 * "install this package, then exit" — which is what the user saw (13s and
 * code 0, no game).
 *
 * This module:
 *   - looks for the eboot.bin in known install locations,
 *   - returns it if already installed (LAUNCH mode),
 *   - otherwise installs the pkg synchronously then returns the eboot path,
 *   - falls back to the pkg itself if all install attempts fail.
 *
 * Install locations differ between shadPS4 builds. We probe several:
 *   %USERPROFILE%\Documents\shadPS4\install\<CUSA>\
 *   <install>\user\install\<CUSA>\
 *   <install>\user\game_data\<CUSA>\          (older builds)
 *   %APPDATA%\shadPS4\install\<CUSA>\
 */

/**
 * Roots where shadPS4 builds have been observed to install games. The Qt
 * build (2025-08+) uses `user/game_data/<CUSA>`; older SDL builds used
 * `user/install/<CUSA>`; some forks dump to `Documents/shadPS4/games/`.
 * We probe all candidates without giving up after the first miss.
 */
/**
 * Games confirmed NOT playable on shadPS4 yet (any version, any config).
 * These crash in early init / memory allocation / shader compilation due
 * to engine features the emulator doesn't implement yet. We warn the user
 * up front instead of letting them spend hours fiddling with configs.
 *
 * Sources: shadPS4 GitHub issues + community compatibility tracker.
 * Last reviewed: 2026-05.
 */
const KNOWN_UNPLAYABLE_CUSA: Record<string, { title: string; reason: string; tryEmulator?: string }> = {
  // Elden Ring (CUSA28863) confirmed working on shadPS4 WIP Qt build
  // with custom_configs/CUSA28863.toml setting readbacks=true and
  // 720p internal — removed from blocklist.
  CUSA08519: {
    title: 'God of War (2018)',
    reason: 'Engine custom — ainda não suportado.'
  }
}

export function checkShadPs4Compatibility(
  gamePath: string
): { title: string; reason: string; tryEmulator?: string } | null {
  const cusa = extractCusaFromPath(gamePath) ?? extractCusaFromPath(dirname(gamePath))
  if (!cusa) return null
  return KNOWN_UNPLAYABLE_CUSA[cusa] ?? null
}

const INSTALL_ROOT_BUILDERS: Array<(installPath: string) => string> = [
  (ip) => join(ip, 'user', 'game_data'),
  (ip) => join(ip, 'user', 'install'),
  (ip) => join(ip, 'user', 'games'),
  (ip) => join(ip, 'user', 'GameData'),
  (ip) => join(ip, 'games'),
  () => join(homedir(), 'Documents', 'shadPS4', 'install'),
  () => join(homedir(), 'Documents', 'shadPS4', 'games'),
  () => join(homedir(), 'Documents', 'shadPS4', 'game_data'),
  () => join(homedir(), 'AppData', 'Roaming', 'shadPS4', 'install'),
  () => join(homedir(), 'AppData', 'Roaming', 'shadPS4', 'user', 'game_data')
]

export function extractCusaFromPath(path: string): string | null {
  const m = path.match(/CUSA\d+/i)
  return m ? m[0].toUpperCase() : null
}

/**
 * Walk recursively (depth-limited) looking for eboot.bin. shadPS4's install
 * layout varies between forks and may nest under Image/, sce_module/, etc.
 * We accept eboot, eboot.bin, EBOOT.BIN regardless of case.
 */
function findEbootRecursive(dir: string, depth: number, maxDepth = 3): string | null {
  if (depth > maxDepth || !existsSync(dir)) return null
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return null
  }
  // Direct file hit first
  for (const e of entries) {
    if (e.toLowerCase() === 'eboot.bin') return join(dir, e)
  }
  // Then descend into folders
  for (const e of entries) {
    const full = join(dir, e)
    try {
      const st = statSync(full)
      if (!st.isDirectory()) continue
      const hit = findEbootRecursive(full, depth + 1, maxDepth)
      if (hit) return hit
    } catch {
      /* skip */
    }
  }
  return null
}

/**
 * Look for an already-installed game by its CUSA id.
 * Returns the eboot.bin path, or null if not installed yet.
 */
export function findInstalledShadPs4Game(installPath: string, cusa: string): string | null {
  for (const builder of INSTALL_ROOT_BUILDERS) {
    const root = builder(installPath)
    // Direct CUSA folder
    const cusaFolder = join(root, cusa)
    const eboot = findEbootRecursive(cusaFolder, 0)
    if (eboot) {
      log.info('shadps4', `found installed ${cusa} at ${eboot}`)
      return eboot
    }
    // Some installers use the game title as folder name — scan one level
    // of the root for any subfolder whose name contains the CUSA.
    if (!existsSync(root)) continue
    let entries: string[]
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.toUpperCase().includes(cusa)) continue
      const folder = join(root, entry)
      const hit = findEbootRecursive(folder, 0)
      if (hit) {
        log.info('shadps4', `found installed ${cusa} at ${hit}`)
        return hit
      }
    }
  }
  return null
}

/**
 * Return every path we checked — used in error messages so the user can
 * see exactly where to look.
 */
export function listShadPs4SearchedPaths(installPath: string, cusa: string): string[] {
  return INSTALL_ROOT_BUILDERS.map((b) => join(b(installPath), cusa))
}

/**
 * shadPS4 (Qt build 2025+) has NO CLI flag to install a pkg. Passing the
 * .pkg via argv makes it try to load it as an ELF eboot — log shows
 * `linker.cpp: Provided file ... .pkg is not valid ELF file`. The only
 * supported install path is the GUI (File → Install Packages, or drag-drop).
 *
 * What we do: open shadPS4 with NO args (launches the GUI on its game
 * library screen), copy the .pkg path to the clipboard so the user can
 * just Ctrl+V into the file picker. Returns the spawned child so the
 * caller can decide whether to wait or not.
 */
/**
 * Apply recommended shadPS4 settings for a given game engine profile.
 *
 * Currently handles UE4 (Elden Ring, Days Gone, Final Fantasy VII Remake)
 * which requires readbacks + readbackLinearImages + patchShaders enabled —
 * the defaults are all OFF so most UE4 games crash on first menu interaction
 * until these are flipped.
 *
 * Backs up the previous config.toml with a `.backup-<timestamp>` suffix so
 * users can revert if our defaults misbehave.
 */
export type ShadPs4Profile = 'ue4' | 'default'

export function applyShadPs4Profile(profile: ShadPs4Profile): { ok: true; backup: string } | { error: string } {
  const configPath = join(homedir(), 'AppData', 'Roaming', 'shadPS4', 'config.toml')
  if (!existsSync(configPath)) {
    return { error: `config.toml não encontrado em ${configPath}. Abra o shadPS4 uma vez para criá-lo.` }
  }
  try {
    const backup = `${configPath}.backup-${Date.now()}`
    copyFileSync(configPath, backup)
    let text = readFileSync(configPath, 'utf8')

    // Conservative profile — only flip the two settings that UE4 games
    // (Elden Ring, Days Gone) actually need to start. The aggressive options
    // (directMemoryAccess, patchShaders, custom resolutions) regressed some
    // builds, so we leave those for the user to opt into manually if they
    // want them.
    const patches: Array<{ key: string; value: string }> =
      profile === 'ue4'
        ? [
            { key: 'readbacks', value: 'true' },
            { key: 'readbackLinearImages', value: 'true' }
          ]
        : [
            { key: 'readbacks', value: 'false' },
            { key: 'readbackLinearImages', value: 'false' }
          ]

    for (const { key, value } of patches) {
      const re = new RegExp(`^(${key}\\s*=\\s*).+$`, 'm')
      if (re.test(text)) text = text.replace(re, `$1${value}`)
    }
    writeFileSync(configPath, text, 'utf8')
    log.info('shadps4', `applied profile ${profile}, backup at ${backup}`)
    return { ok: true, backup }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('shadps4', `applyShadPs4Profile failed: ${msg}`)
    return { error: msg }
  }
}

export function openShadPs4ForManualInstall(
  shadps4Exe: string,
  pkgPath: string,
  installPath: string
): void {
  try {
    clipboard.writeText(pkgPath)
    log.info('shadps4', `copied pkg path to clipboard: ${pkgPath}`)
  } catch (err) {
    log.warn('shadps4', `clipboard write failed: ${String(err)}`)
  }
  try {
    const child = spawn(shadps4Exe, [], {
      cwd: installPath,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, QT_QPA_PLATFORM_PLUGIN_PATH: installPath }
    })
    child.unref()
    log.info('shadps4', 'opened shadPS4 GUI for manual install')
  } catch (err) {
    log.warn('shadps4', `failed to spawn shadPS4 for install: ${String(err)}`)
  }
}

/**
 * Decide what argv to hand shadPS4 for a given game path.
 *
 * Inputs:
 *   - .pkg → check if CUSA already installed; if yes, return eboot path;
 *            if no, install then return eboot.
 *   - already-extracted folder containing eboot.bin → use that directly.
 *   - eboot.bin path → pass through.
 */
export async function resolveShadPs4Launch(
  shadps4Exe: string,
  shadps4InstallPath: string,
  gamePath: string
): Promise<{ path: string; installed?: boolean } | { error: string }> {
  const lower = gamePath.toLowerCase()
  log.info('shadps4', `resolveShadPs4Launch input=${gamePath}`)

  // Up-front compatibility check — block known-broken titles before we
  // spawn the emulator and the user watches it crash.
  const incompat = checkShadPs4Compatibility(gamePath)
  if (incompat) {
    const altLine = incompat.tryEmulator
      ? `\n\n👉 ALTERNATIVA QUE FUNCIONA: ${incompat.tryEmulator}\n` +
        `   No GameHub: Emuladores → Instalar fpPS4 → depois mude o emulador ` +
        `desse jogo no detail page pra fpPS4.`
      : ''
    return {
      error:
        `${incompat.title} não roda no shadPS4 (testado).\n\n` +
        `Motivo: ${incompat.reason}${altLine}\n\n` +
        `Outros jogos PS4 confirmados no shadPS4:\n` +
        `  • Bloodborne (CUSA00207, CUSA01363) — playable, 30fps\n` +
        `  • Sonic Mania — playable\n` +
        `  • The Witness — playable`
    }
  }

  // Already an eboot.bin path — most common after pkg extraction. Verify
  // the file exists; if not, fall through to the .pkg flow which will
  // surface a useful error.
  if (lower.endsWith('eboot.bin')) {
    if (existsSync(gamePath)) {
      log.info('shadps4', `using eboot.bin direct: ${gamePath}`)
      return { path: gamePath }
    }
    log.warn('shadps4', `library entry points at missing eboot: ${gamePath}`)
    return {
      error:
        `O arquivo ${gamePath} não existe mais. Use o botão "Apontar para outro arquivo" no detail do jogo pra selecionar o eboot.bin atual.`
    }
  }

  // Folder containing eboot.bin (rare but possible if user pre-extracted)
  if (existsSync(gamePath)) {
    try {
      const st = statSync(gamePath)
      if (st.isDirectory()) {
        const eboot = findEbootRecursive(gamePath, 0)
        if (eboot) return { path: eboot }
      }
    } catch {
      /* skip */
    }
  }

  // .pkg flow
  if (lower.endsWith('.pkg')) {
    const cusa = extractCusaFromPath(gamePath) ?? extractCusaFromPath(dirname(gamePath))
    if (!cusa) {
      return {
        error:
          'Não consegui extrair o CUSA do nome do pkg. Renomeie o arquivo ou pasta pra incluir CUSAxxxxx.'
      }
    }
    // 1. Already installed?
    const installed = findInstalledShadPs4Game(shadps4InstallPath, cusa)
    if (installed) return { path: installed, installed: true }

    // 2. Not installed. shadPS4's Qt v0.10+ has no CLI install + the File
    // menu varies between builds (some don't have "Install Packages" at all).
    // The reliable path is drag-drop on the running GUI; we open it,
    // pre-stage the pkg path on the clipboard, and ALSO open the file's
    // folder in Explorer so the user can drag it into the shadPS4 window
    // without hunting.
    openShadPs4ForManualInstall(shadps4Exe, gamePath, shadps4InstallPath)
    try {
      const { shell } = await import('electron')
      // Highlights the .pkg in Explorer — saves the user a manual click.
      shell.showItemInFolder(gamePath)
    } catch (err) {
      log.warn('shadps4', `failed to open Explorer: ${String(err)}`)
    }
    return {
      error:
        `Não consegui instalar o ${cusa} automaticamente.\n\n` +
        `Sua build do shadPS4 (Qt WIP 0.10.1) não aceita .pkg nem via CLI nem via drag-drop. ` +
        `O shadPS4 v0.13.0+ removeu a build Qt oficial — só o shadPS4 v0.12.0 Qt tem ` +
        `o menu "File → Install Packages" funcionando.\n\n` +
        `=== OPÇÃO 1 (recomendada, 1 clique): ===\n` +
        `Use o Command Palette do GameHub (Ctrl+K) → "Instalar shadPS4 v0.12.0 Qt".\n` +
        `Ou abra Emuladores → Instalar shadPS4. O GameHub baixa a v0.12.0 Qt pra você.\n` +
        `Depois ele vai abrir o shadPS4 → File → Install Packages → o caminho do .pkg\n` +
        `tá no clipboard (Ctrl+V no campo).\n\n` +
        `=== OPÇÃO 2 (manual): ===\n` +
        `1. Baixe direto: https://github.com/shadps4-emu/shadPS4/releases/download/v.0.12.0/shadps4-win64-qt-0.12.0.zip\n` +
        `2. Extraia. Substitua os arquivos do seu shadPS4 atual.\n` +
        `3. Abra → File → Install Packages → cole o caminho (Ctrl+V).\n` +
        `4. Espere instalar. Feche. Volte aqui → Jogar.\n\n` +
        `=== OPÇÃO 3: extrair com pkgextract (open source, confirmado funciona) ===\n` +
        `1. Baixe https://github.com/paulomanrique/ps4-pkg-extractor/releases\n` +
        `   (pegue pkgextract-x86_64-pc-windows-msvc.zip)\n` +
        `2. No terminal/PowerShell:\n` +
        `      pkgextract.exe -o <pasta_destino> <seu.pkg>\n` +
        `3. No GameHub: botão "Apontar para outro arquivo" → selecione o\n` +
        `   eboot.bin que ficou na pasta de destino.\n\n` +
        `=== OPÇÃO 4: já tem o jogo extraído em algum lugar? ===\n` +
        `No detail desse jogo (essa tela), use o botão "Apontar para outro arquivo"\n` +
        `e selecione o eboot.bin da pasta extraída. Funciona sem reinstalar nada.\n\n` +
        `Locais que o shadPS4 procura jogos:\n` +
        `${listShadPs4SearchedPaths(shadps4InstallPath, cusa).map((p) => '  ' + p).join('\n')}\n\n` +
        `Caminho do .pkg já está no seu clipboard.`
    }
  }

  // Fallback: hand it as-is and hope.
  return { path: gamePath }
}

import { createWriteStream, writeFileSync } from 'node:fs'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { BrowserWindow } from 'electron'
import { PATHS } from './paths'
import { settingsStore } from './store'
import { extractArchive } from './archiveTools'
import { log } from './logger'
import { IPC } from '@shared/ipc'
import type { EmulatorId } from '@shared/types'

/**
 * Automatic emulator installer.
 *
 * For now this only handles DuckStation — the modern, stable PS1 emulator
 * that ePSXe/psxfin can't compete with. It's free, portable, downloaded as a
 * single .zip from GitHub Releases, and works on first launch without any
 * plugin configuration.
 *
 * Install layout: %APPDATA%/gamehub/auto-emulators/<id>/
 * We register the resolved executable as an `emulatorOverrides` entry so the
 * existing scanner picks it up on next run.
 */

interface InstallSpec {
  id: EmulatorId
  /** GitHub `owner/repo` — we resolve the latest release asset via the API. Optional when `resolveUrl` is provided. */
  githubRepo?: string
  /** substring (case-insensitive) the release asset's name must contain */
  assetMatch?: string
  /** archive filename we save the asset to */
  archiveName: string
  /** filename inside the extracted tree that is the main executable */
  expectedExecutable: string
  /** hardcoded fallback URL when the API call fails (rate limit, network etc.) */
  fallbackUrl: string
  /**
   * Optional custom resolver — overrides the default GitHub-API lookup. Used
   * for emulators distributed outside GitHub (Dolphin's dolphin-emu.org).
   * Returns the absolute download URL.
   */
  resolveUrl?: () => Promise<string | null>
  /**
   * Files to drop next to the executable after extraction to force portable
   * mode. DuckStation uses a sentinel `portable.txt` to read BIOS/config from
   * the install dir instead of the user's Documents folder. Without this, BIOS
   * we copy into the install dir is invisible to the emulator.
   */
  portableMarkers?: string[]
}

const SPECS: Partial<Record<EmulatorId, InstallSpec>> = {
  duckstation: {
    id: 'duckstation',
    githubRepo: 'stenzek/duckstation',
    assetMatch: 'duckstation-windows-x64-release.zip',
    archiveName: 'duckstation-windows-x64-release.zip',
    expectedExecutable: 'duckstation-qt-x64-releaseltcg.exe',
    fallbackUrl:
      'https://github.com/stenzek/duckstation/releases/download/preview/duckstation-windows-x64-release.zip',
    portableMarkers: ['portable.txt']
  },
  ppsspp: {
    id: 'ppsspp',
    githubRepo: 'hrydgard/ppsspp',
    // Modern releases ship `PPSSPP-vX.Y.Z-Windows-x64.zip`. The older
    // `ppsspp_win.zip` naming is gone, so we anchor on the Windows-x64 suffix.
    assetMatch: 'windows-x64.zip',
    archiveName: 'ppsspp-windows-x64.zip',
    expectedExecutable: 'ppssppwindows64.exe',
    fallbackUrl:
      'https://github.com/hrydgard/ppsspp/releases/download/v1.20.4/PPSSPP-v1.20.4-Windows-x64.zip'
  },
  desmume: {
    id: 'desmume',
    githubRepo: 'TASEmulators/desmume',
    // Without `win64` the substring `desmume-` matches the macOS DMG first
    // (alphabetical) — anchor on the Windows asset specifically.
    assetMatch: 'win64.zip',
    archiveName: 'desmume-win64.zip',
    expectedExecutable: 'desmume_x64.exe',
    fallbackUrl:
      'https://github.com/TASEmulators/desmume/releases/download/release_0_9_13/desmume-0.9.13-win64.zip'
  },
  fpps4: {
    id: 'fpps4',
    githubRepo: 'red-prig/fpPS4',
    assetMatch: 'fpps4_v',
    archiveName: 'fpps4.zip',
    expectedExecutable: 'fpps4.exe',
    fallbackUrl:
      'https://github.com/red-prig/fpPS4/releases/download/v0.0.1/fpPS4_v0.0.1.zip'
  },
  shadps4: {
    id: 'shadps4',
    githubRepo: 'shadps4-emu/shadPS4',
    // Pin to v0.12.0 Qt — the last release with the Qt GUI build.
    // v0.13.0+ ships SDL/imgui only, and we've confirmed those builds either
    // lack "Install Packages" in the menu or have it broken. Auto-install
    // resolver hits this URL directly (skipping the latest-asset search).
    assetMatch: 'win64-qt-0.12.0.zip',
    archiveName: 'shadps4-win64-qt.zip',
    expectedExecutable: 'shadps4.exe',
    fallbackUrl:
      'https://github.com/shadps4-emu/shadPS4/releases/download/v.0.12.0/shadps4-win64-qt-0.12.0.zip'
  },
  xenia: {
    id: 'xenia',
    githubRepo: 'xenia-canary/xenia-canary-releases',
    assetMatch: 'xenia_canary_windows.zip',
    archiveName: 'xenia_canary_windows.zip',
    expectedExecutable: 'xenia_canary.exe',
    fallbackUrl:
      'https://github.com/xenia-canary/xenia-canary-releases/releases/latest/download/xenia_canary_windows.zip'
  },
  mesen: {
    id: 'mesen',
    githubRepo: 'SourMesen/Mesen2',
    // Asset name pattern: `Mesen_<version>_Windows.zip`
    assetMatch: '_windows.zip',
    archiveName: 'mesen-windows.zip',
    expectedExecutable: 'mesen.exe',
    fallbackUrl:
      'https://github.com/SourMesen/Mesen2/releases/download/2.1.1/Mesen_2.1.1_Windows.zip'
  },
  mgba: {
    // mGBA ships .7z portable builds on GitHub releases — works thanks to our
    // on-demand 7zr.exe (archiveTools auto-fetches if needed).
    id: 'mgba',
    githubRepo: 'mgba-emu/mgba',
    assetMatch: 'win64.7z',
    archiveName: 'mgba-win64.7z',
    expectedExecutable: 'mgba.exe',
    fallbackUrl:
      'https://github.com/mgba-emu/mgba/releases/download/0.10.5/mGBA-0.10.5-win64.7z'
  },
  dolphin: {
    // Dolphin is the odd one out — distributed at dolphin-emu.org instead of
    // GitHub. The page exposes a JSON-ish list of dev builds at
    // https://dolphin-emu.org/download/list/dev/<page>/. We scrape it to pick
    // the latest x64 .7z; if that fails we fall back to a known stable URL.
    id: 'dolphin',
    archiveName: 'dolphin-x64.7z',
    expectedExecutable: 'dolphin.exe',
    fallbackUrl:
      'https://dl.dolphin-emu.org/releases/2407/dolphin-2407-x64.7z',
    resolveUrl: resolveDolphinLatest
  }
}

/**
 * Scrape dolphin-emu.org for the latest x64 dev build URL.
 *
 * The download list page renders a table of releases with links like
 *   /download/dev/<hash>/dolphin-master-<branch>-x64.7z
 * We do a single fetch + regex match. No HTML parser needed — the markup
 * is very stable. If the request fails or the regex misses, return null
 * so the caller falls back to the hardcoded stable URL.
 */
async function resolveDolphinLatest(): Promise<string | null> {
  try {
    const r = await fetch('https://dolphin-emu.org/download/', {
      headers: { 'User-Agent': 'gamehub-launcher' }
    })
    if (!r.ok) return null
    const html = await r.text()
    // Match the first absolute .7z URL containing x64 in the path/filename.
    const m = html.match(/https?:\/\/dl\.dolphin-emu\.org\/[^"'\s<>]+x64\.7z/i)
    if (m) {
      log.info('autoInstall', `dolphin: resolved latest = ${m[0]}`)
      return m[0]
    }
    return null
  } catch (err) {
    log.warn('autoInstall', `dolphin: scrape failed: ${String(err)}`)
    return null
  }
}

/**
 * Resolve the most recent release's matching asset URL.
 *
 * GitHub's `/releases/latest` skips pre-releases and DuckStation only ships
 * preview (pre-release) builds — so we hit `/releases` instead and pick the
 * first entry, which is always the newest by published date. If the API
 * returns nothing useful (rate-limit, offline) we fall back to the hardcoded
 * URL so install still works.
 */
async function resolveLatestAssetUrl(spec: InstallSpec): Promise<string> {
  // Custom resolver takes precedence — used for non-GitHub distros (Dolphin).
  if (spec.resolveUrl) {
    const url = await spec.resolveUrl()
    if (url) return url
    log.info('autoInstall', `${spec.id}: custom resolver returned null, using fallback`)
    return spec.fallbackUrl
  }
  if (!spec.githubRepo || !spec.assetMatch) return spec.fallbackUrl
  const apiUrl = `https://api.github.com/repos/${spec.githubRepo}/releases?per_page=5`
  try {
    const r = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'gamehub-launcher' }
    })
    if (!r.ok) throw new Error(`GitHub API HTTP ${r.status}`)
    const releases = (await r.json()) as Array<{
      tag_name: string
      name: string
      published_at: string
      assets: Array<{ name: string; browser_download_url: string }>
    }>
    const needle = spec.assetMatch.toLowerCase()
    for (const release of releases) {
      const asset = release.assets.find((a) => a.name.toLowerCase().includes(needle))
      if (asset) {
        log.info(
          'autoInstall',
          `${spec.id}: resolved latest = ${release.tag_name} (${release.published_at}) → ${asset.name}`
        )
        return asset.browser_download_url
      }
    }
    log.warn('autoInstall', `${spec.id}: no asset matching "${spec.assetMatch}" in 5 latest releases`)
  } catch (err) {
    log.warn('autoInstall', `${spec.id}: GitHub API lookup failed: ${String(err)}`)
  }
  log.info('autoInstall', `${spec.id}: falling back to hardcoded URL ${spec.fallbackUrl}`)
  return spec.fallbackUrl
}

export interface AutoInstallProgress {
  emulatorId: EmulatorId
  emulatorName: string
  state: 'downloading' | 'extracting' | 'registering' | 'done' | 'failed'
  received: number
  total?: number
  error?: string
}

function publish(p: AutoInstallProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.system.autoInstallProgress, p)
  }
}

function isAutoInstallable(id: EmulatorId): boolean {
  return id in SPECS
}

export function canAutoInstall(id: EmulatorId): boolean {
  return isAutoInstallable(id)
}

/**
 * If this emulator was auto-installed by GameHub and we know it needs portable
 * markers (e.g. DuckStation reading BIOS from <install>/bios/), make sure
 * those marker files exist. Safe to call every launch — it's a no-op when
 * nothing's missing.
 *
 * We gate this on the install path living under our auto-emulators dir so we
 * never modify a user's hand-installed copy in some other location.
 */
export function ensurePortableMarkers(id: EmulatorId, installPath: string): void {
  const spec = SPECS[id]
  if (!spec?.portableMarkers || spec.portableMarkers.length === 0) return
  const autoRoot = join(PATHS.userData, 'auto-emulators').toLowerCase()
  if (!installPath.toLowerCase().startsWith(autoRoot)) return
  for (const marker of spec.portableMarkers) {
    const markerPath = join(installPath, marker)
    if (existsSync(markerPath)) continue
    try {
      writeFileSync(markerPath, '', 'utf8')
      log.info('autoInstall', `wrote portable marker ${markerPath}`)
    } catch (err) {
      log.warn('autoInstall', `failed to write portable marker ${markerPath}: ${String(err)}`)
    }
  }
}

/**
 * Download + extract + register an emulator. Idempotent: if the executable
 * already exists at the expected path, we short-circuit and just re-register.
 */
export async function installEmulator(
  id: EmulatorId,
  displayName: string
): Promise<{ ok: true; executable: string } | { error: string }> {
  const spec = SPECS[id]
  if (!spec) return { error: `Auto-install não suportado para ${id}.` }

  const installDir = join(PATHS.userData, 'auto-emulators', id)
  await mkdir(installDir, { recursive: true })

  // Idempotent shortcut
  const existing = await findExecutable(installDir, spec.expectedExecutable)
  if (existing) {
    register(id, existing)
    publish({ emulatorId: id, emulatorName: displayName, state: 'done', received: 0 })
    return { ok: true, executable: existing }
  }

  const archivePath = join(installDir, spec.archiveName)

  // Step 1: download (resolve latest URL via GitHub API; fallback baked in)
  publish({ emulatorId: id, emulatorName: displayName, state: 'downloading', received: 0 })
  const downloadUrl = await resolveLatestAssetUrl(spec)
  try {
    await downloadFile(downloadUrl, archivePath, (received, total) => {
      publish({
        emulatorId: id,
        emulatorName: displayName,
        state: 'downloading',
        received,
        total
      })
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('autoInstall', `${id} download failed: ${msg}`)
    publish({
      emulatorId: id,
      emulatorName: displayName,
      state: 'failed',
      received: 0,
      error: msg
    })
    return { error: `Falha no download: ${msg}` }
  }

  // Step 2: extract (zip via PowerShell, 7z via on-demand 7zr.exe — both
  // handled by archiveTools.extractArchive based on magic-byte detection).
  publish({ emulatorId: id, emulatorName: displayName, state: 'extracting', received: 0 })
  try {
    const ok = await extractArchive(archivePath, installDir)
    if (!ok) throw new Error('extractArchive returned false (unsupported format or 7zr.exe unavailable)')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('autoInstall', `${id} extract failed: ${msg}`)
    // Delete the broken archive so the next attempt doesn't short-circuit on
    // a corrupted file (e.g. mis-matched asset cached from a prior bad spec).
    await unlink(archivePath).catch(() => {})
    publish({
      emulatorId: id,
      emulatorName: displayName,
      state: 'failed',
      received: 0,
      error: msg
    })
    return { error: `Falha na extração: ${msg}` }
  }
  // Cleanup the archive (free ~50MB of disk)
  await unlink(archivePath).catch(() => {})

  const executable = await findExecutable(installDir, spec.expectedExecutable)
  if (executable && spec.portableMarkers) {
    // Drop portable-mode sentinel files next to the exe so the emulator reads
    // its BIOS/config from the install dir instead of %USERPROFILE%/Documents.
    // Without this, BIOS we share into <install>/bios/ is invisible to the
    // emulator and the user hits "Nenhuma imagem de BIOS encontrada".
    const exeDir = dirname(executable)
    for (const marker of spec.portableMarkers) {
      const markerPath = join(exeDir, marker)
      try {
        if (!existsSync(markerPath)) {
          writeFileSync(markerPath, '', 'utf8')
          log.info('autoInstall', `wrote portable marker ${markerPath}`)
        }
      } catch (err) {
        log.warn('autoInstall', `failed to write portable marker ${markerPath}: ${String(err)}`)
      }
    }
  }
  if (!executable) {
    const msg = `executável ${spec.expectedExecutable} não encontrado em ${installDir} após extração`
    log.error('autoInstall', msg)
    publish({
      emulatorId: id,
      emulatorName: displayName,
      state: 'failed',
      received: 0,
      error: msg
    })
    return { error: msg }
  }

  // Step 3: register override so the scanner picks it up
  publish({ emulatorId: id, emulatorName: displayName, state: 'registering', received: 0 })
  register(id, executable)
  log.info('autoInstall', `${id} installed at ${executable}`)

  publish({ emulatorId: id, emulatorName: displayName, state: 'done', received: 0 })
  return { ok: true, executable }
}

function register(id: EmulatorId, executable: string): void {
  const settings = settingsStore.load()
  settingsStore.save({
    ...settings,
    emulatorOverrides: { ...settings.emulatorOverrides, [id]: executable }
  })
}

async function downloadFile(
  url: string,
  destPath: string,
  onProgress: (received: number, total?: number) => void
): Promise<void> {
  const r = await fetch(url, { redirect: 'follow' })
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status} ${r.statusText}`)
  const total = Number(r.headers.get('content-length')) || undefined

  const stream = createWriteStream(destPath)
  const reader = r.body.getReader()
  let received = 0
  let lastEmit = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      stream.write(Buffer.from(value))
      received += value.length
      const now = Date.now()
      if (now - lastEmit > 250) {
        lastEmit = now
        onProgress(received, total)
      }
    }
    stream.end()
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve())
      stream.on('error', reject)
    })
  } catch (err) {
    stream.destroy()
    await unlink(destPath).catch(() => {})
    throw err
  }
  onProgress(received, total)
}

/**
 * Walk the install dir looking for the expected exe — most archives place it
 * one level deep (e.g. `duckstation/duckstation-qt-x64-releaseLTCG.exe`),
 * some flat at root. Limit recursion to keep this fast.
 *
 * Match strategy:
 *   1. Exact filename match (case-insensitive) — best signal.
 *   2. If nothing exact, try prefix match — handles versioned releases
 *      where DeSmuME ships `DeSmuME_0.9.13_x64.exe` instead of the
 *      bare `desmume_x64.exe` the spec asked for.
 *   3. Substring match — last resort.
 */
async function findExecutable(root: string, expected: string): Promise<string | null> {
  const target = expected.toLowerCase()
  // Derive a "stem" for fuzzy matching — strip the .exe and any common
  // suffixes like `_x64` so versioned filenames still match.
  const stem = target.replace(/\.exe$/, '').replace(/[_-]?x64$/, '')
  const exactHits: string[] = []
  const prefixHits: string[] = []
  const substringHits: string[] = []

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 3) return
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      let st
      try {
        st = await stat(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        await walk(full, depth + 1)
        continue
      }
      const lower = entry.toLowerCase()
      if (!lower.endsWith('.exe')) continue
      if (lower === target) {
        exactHits.push(full)
      } else if (lower.startsWith(stem) && lower.includes('x64')) {
        prefixHits.push(full)
      } else if (lower.includes(stem) && lower.includes('x64')) {
        substringHits.push(full)
      }
    }
  }
  if (!existsSync(root)) return null
  await walk(root, 0)
  // Priority: exact > prefix > substring. Within each, prefer the shortest
  // path so we pick the most specific exe (e.g. main vs bundled tools).
  const pick = (arr: string[]): string | null =>
    arr.sort((a, b) => a.length - b.length)[0] ?? null
  return pick(exactHits) ?? pick(prefixHits) ?? pick(substringHits)
}

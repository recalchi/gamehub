import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { BrowserWindow, screen, shell } from 'electron'
import { buildLaunchArgs } from './emulators'
import { libraryStore, settingsStore } from './store'
import { shareBiosAcrossEmulators } from './bios'
import { canAutoInstall, ensurePortableMarkers } from './autoInstall'
import { findPs3GameFolder, mountPs3Iso, unmountPs3Iso } from './ps3Disc'
import { recordCrash } from './crashTracker'
import { resolveShadPs4Launch } from './shadps4'
import { discordRpcClearIfMatches, discordRpcSetActivity } from './discordRpc'
import { startPerformanceMonitor, stopPerformanceMonitor } from './performance'
import { moveMainWindowToDisplay } from './windowing'
import { log } from './logger'
import { EMULATORS } from '@shared/emulators'
import { PLATFORMS } from '@shared/platforms'
import { IPC } from '@shared/ipc'
import type {
  DisplayTarget,
  EmulatorId,
  Game,
  LaunchResult,
  LaunchTerminateResult,
  PlatformId
} from '@shared/types'

/** A spawn that exits non-zero this quickly is almost certainly a launch failure
 *  rather than a normal "user closed the game" — surface it to the renderer. */
const FAILURE_THRESHOLD_SECONDS = 10
const EXTERNAL_STORE_PRESENCE_SAFETY_MS = 8 * 60 * 60 * 1000

/** Cap stderr/stdout retained per launch. Emulators can spam thousands of lines;
 *  the last few are what diagnoses missing DLLs, bad BIOS, parse errors. */
const OUTPUT_BUFFER_LINES = 200
const execFileAsync = promisify(execFile)

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function broadcastFailure(
  game: Game,
  code: number | null,
  seconds: number,
  emulatorName: string,
  output?: string,
  installOffer?: { emulatorId: EmulatorId; emulatorName: string }
): void {
  broadcast(IPC.launch.failed, {
    gameId: game.id,
    gameTitle: game.title,
    code,
    seconds,
    emulatorName,
    output,
    installOffer
  })
}

/**
 * When all locally installed emulators for a platform have failed, surface a
 * one-click "install a better emulator" offer to the renderer — but only if we
 * have an auto-install path for one that the user hasn't already tried.
 */
function suggestAutoInstall(platform: PlatformId, tried: Set<EmulatorId>):
  | { emulatorId: EmulatorId; emulatorName: string }
  | undefined {
  const platformDef = PLATFORMS[platform]
  if (!platformDef) return undefined
  for (const id of platformDef.emulators) {
    if (tried.has(id)) continue
    if (!canAutoInstall(id)) continue
    const def = EMULATORS[id]
    if (!def) continue
    return { emulatorId: id, emulatorName: def.name }
  }
  return undefined
}

/** Fixed-size ring buffer of output lines. */
class RingBuffer {
  private lines: string[] = []
  private partial = ''
  constructor(private readonly max: number) {}
  push(chunk: Buffer | string): void {
    this.partial += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    const split = this.partial.split(/\r?\n/)
    this.partial = split.pop() ?? ''
    for (const line of split) {
      this.lines.push(line)
      if (this.lines.length > this.max) this.lines.shift()
    }
  }
  flush(): string {
    if (this.partial) {
      this.lines.push(this.partial)
      this.partial = ''
      if (this.lines.length > this.max) this.lines.shift()
    }
    return this.lines.join('\n')
  }
}

// ActiveLaunch lives in @shared/types now (so the performance monitor can use
// the same processName fallback). Re-export so the rest of the main process
// keeps the same import path.
export type { ActiveLaunch } from '@shared/types'
import type { ActiveLaunch as ActiveLaunchType } from '@shared/types'

const active = new Map<string, ActiveLaunchType>()
const forceStopping = new Set<string>()

export function listActiveLaunches(): ActiveLaunchType[] {
  return Array.from(active.values())
}

/**
 * Force-stop an active launch from GameHub.
 *
 * Strategy (Windows):
 *  1) Try taskkill tree on the tracked pid (fast + reliable for direct child).
 *  2) Discover additional matching PIDs by exact executable path (safer than name).
 *  3) As last resort, match by process name around launch time window.
 */
export async function terminateLaunch(gameId: string): Promise<LaunchTerminateResult> {
  const launch = active.get(gameId)
  if (!launch) {
    return { ok: false, gameId, terminatedPids: [], error: 'Jogo não está em execução.' }
  }

  const candidates = new Set<number>()
  if (launch.pid) candidates.add(launch.pid)
  const discovered = await discoverLikelyLaunchPids(launch)
  for (const pid of discovered) candidates.add(pid)

  if (candidates.size === 0) {
    return {
      ok: false,
      gameId,
      terminatedPids: [],
      error: 'Sem PID observável para encerrar este lançamento.'
    }
  }

  forceStopping.add(gameId)
  const killed = new Set<number>()
  const failures: string[] = []
  for (const pid of candidates) {
    const r = await killProcessTree(pid)
    if (r.ok) killed.add(pid)
    else failures.push(`pid ${pid}: ${r.error ?? 'falha desconhecida'}`)
  }

  // Safety: if we killed something but no exit callback fired yet, clear stale
  // session after a short grace period so the UI doesn't stay "Jogando".
  if (killed.size > 0) {
    setTimeout(() => {
      if (active.has(gameId)) markEnded(gameId)
    }, 1500)
    return {
      ok: true,
      gameId,
      terminatedPids: Array.from(killed),
      note:
        failures.length > 0
          ? `Encerrado com ressalvas (${failures.length} tentativa(s) falharam).`
          : 'Encerrado com sucesso.'
    }
  }

  forceStopping.delete(gameId)
  return {
    ok: false,
    gameId,
    terminatedPids: [],
    error: failures.join(' | ') || 'Não foi possível encerrar o processo.'
  }
}

async function killProcessTree(
  pid: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 'SIGTERM')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
  try {
    await execFileAsync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      timeout: 8000
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // "process not found" means it's already gone, which is effectively ok.
    if (/not found|cannot find|n.o existe/i.test(msg)) return { ok: true }
    return { ok: false, error: msg }
  }
}

async function discoverLikelyLaunchPids(launch: ActiveLaunchType): Promise<number[]> {
  if (process.platform !== 'win32') return []
  const safeExePath = launch.executablePath?.replace(/'/g, "''") ?? ''
  const safeProcessName = launch.processName?.replace(/'/g, "''") ?? ''
  const safeStartedAt = launch.startedAt.replace(/'/g, "''")
  const safePid = launch.pid ?? 0
  const script = `
$targetPid = ${safePid}
$exePath = '${safeExePath}'
$procName = '${safeProcessName}'
$startedAt = [datetime]'${safeStartedAt}'
$cutoff = $startedAt.AddMinutes(-3)
$all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
$hits = @()
if ($targetPid -gt 0) {
  $hits += $all | Where-Object { $_.ProcessId -eq $targetPid }
}
if ($exePath) {
  $hits += $all | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -ieq $exePath }
}
if ($hits.Count -eq 0 -and $procName) {
  $nameA = if ($procName.ToLower().EndsWith('.exe')) { $procName } else { "$procName.exe" }
  $nameB = if ($procName.ToLower().EndsWith('.exe')) { $procName.Substring(0, $procName.Length - 4) } else { $procName }
  $hits += $all | Where-Object {
    ($_.Name -ieq $nameA -or $_.Name -ieq $nameB) -and
    ([Management.ManagementDateTimeConverter]::ToDateTime($_.CreationDate) -ge $cutoff)
  }
}
($hits | Select-Object -ExpandProperty ProcessId -Unique) -join ','
`
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 5000 }
    )
    return (stdout.trim() ? stdout.trim().split(',') : [])
      .map((raw) => Number(raw.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
  } catch {
    return []
  }
}

function markStarted(launch: ActiveLaunchType & { platform?: string }): void {
  active.set(launch.gameId, launch)
  broadcast(IPC.launch.started, launch)
  startPerformanceMonitor(launch)
  const launchSettings = settingsStore.load().launch
  if (launchSettings.gameHubDisplay !== 'current') {
    moveMainWindowToDisplay(launchSettings.gameHubDisplay)
  }
  if (launchSettings.minimizeGameHubOnLaunch) {
    for (const win of BrowserWindow.getAllWindows()) {
      win.minimize()
    }
  }
  if (launch.platform) {
    void discordRpcSetActivity({
      title: launch.gameTitle,
      platform: launch.platform,
      startedAt: new Date(launch.startedAt).getTime()
    })
  }
}

function maybeMoveGameWindow(pid: number | undefined, target: DisplayTarget, fullscreen: boolean): void {
  if (!pid || target === 'current') return
  const display = resolveGameDisplay(target)
  if (!display) return
  const area = display.workArea
  const script = `
$sig='[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp); public delegate bool EnumWindowsProc(IntPtr h, IntPtr lp); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h); [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hgt, bool repaint); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);'
Add-Type -MemberDefinition $sig -Name Win32WindowMover -Namespace GameHub
$targetPid=${pid}; $bounds=@{x=${area.x};y=${area.y};w=${area.width};h=${area.height}}
$cb=[GameHub.Win32WindowMover+EnumWindowsProc]{
  param([IntPtr]$hwnd,[IntPtr]$lp)
  [uint32]$p=0; [GameHub.Win32WindowMover]::GetWindowThreadProcessId($hwnd,[ref]$p) | Out-Null
  if($p -eq $targetPid -and [GameHub.Win32WindowMover]::IsWindowVisible($hwnd)){
    [GameHub.Win32WindowMover]::ShowWindow($hwnd,${fullscreen ? 3 : 1}) | Out-Null
    [GameHub.Win32WindowMover]::MoveWindow($hwnd,$bounds.x,$bounds.y,$bounds.w,$bounds.h,$true) | Out-Null
    return $false
  }
  return $true
}
Start-Sleep -Milliseconds 1400
[GameHub.Win32WindowMover]::EnumWindows($cb,[IntPtr]::Zero) | Out-Null
`
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    windowsHide: true,
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
}

function resolveGameDisplay(target: DisplayTarget): Electron.Display | null {
  const displays = screen.getAllDisplays()
  if (displays.length === 0) return null
  if (target === 'primary') return screen.getPrimaryDisplay()
  if (target === 'secondary') return displays.find((d) => d.id !== screen.getPrimaryDisplay().id) ?? displays[0]
  if (target === 'current') return screen.getDisplayMatching(BrowserWindow.getAllWindows()[0]?.getBounds() ?? displays[0].bounds)
  const index = Number(target.replace('display-', '')) - 1
  return displays[index] ?? displays[0]
}

function markEnded(
  gameId: string,
  options: { clearPresence?: boolean; restoreGameHub?: boolean } = {}
): void {
  const clearPresence = options.clearPresence ?? true
  const restoreGameHub = options.restoreGameHub ?? true
  const launch = active.get(gameId)
  if (!launch) return
  active.delete(gameId)
  stopPerformanceMonitor(gameId)
  broadcast(IPC.launch.ended, { gameId, gameTitle: launch.gameTitle })
  if (active.size === 0) {
    if (restoreGameHub && settingsStore.load().launch.restoreGameHubAfterExit) {
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isMinimized()) win.restore()
      }
    }
    if (clearPresence) void discordRpcSetActivity(null)
  }
}

function recordPlaySession(game: Game, startedAt: number): number {
  const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
  const current = libraryStore.load().games.find((g) => g.id === game.id)
  libraryStore.patchGame(game.id, {
    playTime: (current?.playTime ?? game.playTime ?? 0) + seconds,
    lastPlayedAt: new Date().toISOString()
  })
  return seconds
}

/**
 * Pick the next available emulator for this platform we haven't tried yet.
 *
 * The platforms catalog lists emulators in quality order — duckstation before
 * epsxe before psxfin etc. — so iterating that list yields a sensible fallback
 * sequence without us having to encode preference here.
 */
function pickFallback(game: Game, tried: Set<EmulatorId>): EmulatorId | undefined {
  const platform = PLATFORMS[game.platform]
  if (!platform) return undefined
  const detected = libraryStore.load().emulators
  for (const candidate of platform.emulators) {
    if (tried.has(candidate)) continue
    const found = detected.find((e) => e.id === candidate)
    if (found && existsSync(found.executable)) return candidate
  }
  return undefined
}

/**
 * Spawn the appropriate emulator for a game and return immediately.
 *
 * We don't wait for the emulator to exit — that's a fire-and-forget pattern
 * because long-running emulators would block the IPC reply. We do increment
 * playTime when the emulator process is observed to exit.
 *
 * If the emulator crashes quickly (<10s, non-zero exit), we automatically retry
 * with the next available emulator for the same platform — and persist the
 * working choice so subsequent launches go straight to it. This makes launchers
 * survive bad ePSXe plugin configs, partially-installed PCSX2, etc. without
 * any user intervention.
 */
/**
 * Console emulators expect raw disc images (.iso/.bin/.cue/.chd) — they cannot
 * read a compressed archive directly. If we hand PCSX2 a .7z it'll open its UI,
 * sit there confused, and the user blames the launcher. Catch this before
 * spawn so we can show a clear "extract me first" message.
 */
const COMPRESSED_EXTENSIONS = new Set(['.7z', '.rar', '.zip'])

function isCompressedArchive(path: string): boolean {
  const lower = path.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return COMPRESSED_EXTENSIONS.has(lower.slice(dot))
}

export async function launchGame(
  game: Game,
  tried: Set<EmulatorId> = new Set()
): Promise<LaunchResult> {
  if (!game.emulator || game.emulator === 'unknown') {
    return { ok: false, error: 'Nenhum emulador associado a este jogo.' }
  }
  if (game.emulator === 'native') {
    // Steam-imported entries store a steam:// URI as path — hand off to
    // Steam itself instead of trying to spawn the URI as an exe.
    if (game.path.startsWith('steam://')) {
      return launchExternalStore(game, 'Steam')
    }
    if (game.path.startsWith('com.epicgames.launcher://')) {
      return launchExternalStore(game, 'Epic Games')
    }
    if (game.path.startsWith('riotclient://')) {
      return launchExternalStore(game, 'Riot Client')
    }
    return launchNative(game)
  }
  // Block compressed-archive launches up front — no console emulator can read
  // a .7z/.rar/.zip directly, and trying to launch one wastes 100+ seconds of
  // the user's time while the emulator's UI sits idle.
  if (isCompressedArchive(game.path)) {
    return {
      ok: false,
      error: `Arquivo compactado (${game.path.slice(game.path.lastIndexOf('.'))}) — extraia para .iso/.bin/.cue antes de jogar.`
    }
  }
  tried.add(game.emulator)

  const data = libraryStore.load()
  const emu = data.emulators.find((e) => e.id === game.emulator)
  if (!emu || !existsSync(emu.executable)) {
    return {
      ok: false,
      error: `Emulador ${EMULATORS[game.emulator]?.name ?? game.emulator} não encontrado.`
    }
  }
  if (!existsSync(game.path)) {
    return { ok: false, error: `Arquivo do jogo não encontrado: ${game.path}` }
  }

  // RPCS3 can't read raw PS3 ISOs — they need to be mounted as virtual drives
  // so RPCS3 sees the PS3_GAME folder tree. Do this transparently before
  // spawn. If the path is already a PS3_GAME folder (extracted dump) we use
  // it directly. If the .iso is encrypted, mountPs3Iso returns an error.
  let launchPath = game.path
  let mountedIsoToClean: string | null = null
  if (game.emulator === 'rpcs3') {
    const resolved = await resolveRpcs3Path(game.path)
    if ('error' in resolved) {
      return { ok: false, error: resolved.error }
    }
    launchPath = resolved.path
    if (resolved.mountedIso) mountedIsoToClean = resolved.mountedIso
  }

  // shadPS4 can't play a .pkg directly — it installs it then exits, which
  // is why the launch "succeeded" in 13s with no game running. We resolve
  // .pkg paths to the post-install eboot.bin, installing the pkg first if
  // needed. Subsequent launches skip straight to the eboot.
  if (game.emulator === 'shadps4') {
    const resolved = await resolveShadPs4Launch(emu.executable, emu.installPath, game.path)
    if ('error' in resolved) {
      return { ok: false, error: resolved.error }
    }
    launchPath = resolved.path
  }

  // fpPS4 takes -e <eboot> -f <app_folder>. We override the default args so
  // the app folder (eboot's parent directory) is passed alongside, which
  // fpPS4 needs to mount the game's filesystem (/app0).
  let fpps4ExtraArgs: string[] = []
  if (game.emulator === 'fpps4') {
    if (!game.path.toLowerCase().endsWith('eboot.bin')) {
      return {
        ok: false,
        error:
          'fpPS4 precisa apontar pro eboot.bin extraído. Use "Apontar para outro arquivo" no detail do jogo.'
      }
    }
    const appFolder = game.path.replace(/[\\/]eboot\.bin$/i, '')
    fpps4ExtraArgs = ['-f', appFolder]
  }

  // Ensure portable-mode markers exist (DuckStation needs `portable.txt` to
  // read BIOS from <install>/bios/ instead of Documents). Cheap no-op if
  // already written.
  ensurePortableMarkers(emu.id, emu.installPath)
  // Make sure BIOS is in place for THIS emulator right now — covers the case
  // where the user just auto-installed DuckStation, hasn't re-scanned, and the
  // BIOS share never ran for it.
  shareBiosAcrossEmulators(data.emulators)

  const launchSettings = settingsStore.load().launch
  const args = [
    ...buildLaunchArgs(game.emulator, launchPath, {
      fullscreen: launchSettings.fullscreenGames
    }),
    ...fpps4ExtraArgs
  ]
  const command = `"${emu.executable}" ${args.map((a) => `"${a}"`).join(' ')}`
  log.info('launcher', `launching ${game.title}`, { command, emulator: emu.id, tried: Array.from(tried) })

  try {
    const startedAt = Date.now()
    // `detached: true` + `stdio: 'pipe'` keeps stderr capture alive without
    // tying GameHub's exit to the child. We don't unref() in this mode because
    // that would drop the pipe handles on Windows before the child writes.
    // Qt-based emulators (RPCS3, PCSX2-Qt, DuckStation-Qt) fail with "no Qt
    // platform plugin could be initialized" when a different Qt6 in PATH gets
    // loaded first. Pin the plugin search to the emulator's install dir.
    const env = { ...process.env, QT_QPA_PLATFORM_PLUGIN_PATH: emu.installPath }
    const child = spawn(emu.executable, args, {
      cwd: emu.installPath,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env
    })
    const output = new RingBuffer(OUTPUT_BUFFER_LINES)
    child.stdout?.on('data', (chunk: Buffer) => output.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => output.push(chunk))
    markStarted({
      gameId: game.id,
      gameTitle: game.title,
      emulatorName: emu.name,
      pid: child.pid,
      // Strip the .exe so the performance monitor can fall back to
      // Get-Process -Name <processName> if the launched PID dies or the
      // emulator spawns a worker subprocess (which is what was causing
      // shadPS4 to show "--" mid-game).
      processName: emu.executable.split(/[\\/]/).pop()?.replace(/\.exe$/i, '').toLowerCase(),
      executablePath: emu.executable,
      startedAt: new Date(startedAt).toISOString(),
      platform: game.platform
    })
    if (launchSettings.moveGameWindowAfterLaunch) {
      maybeMoveGameWindow(child.pid, launchSettings.gameDisplay, launchSettings.fullscreenGames)
    }
    child.on('error', (err) => {
      log.error('launcher', `child errored: ${err.message}`, { tail: output.flush().slice(-2000) })
      markEnded(game.id)
      if (mountedIsoToClean) void unmountPs3Iso(mountedIsoToClean)
      void handleFailureOrFallback(game, null, 0, emu.name, emu.id, output.flush(), tried)
    })
    child.on('exit', (code) => {
      const userStopped = forceStopping.delete(game.id)
      const seconds = recordPlaySession(game, startedAt)
      const tail = output.flush()
      log.info('launcher', `emulator exited code=${code} after ${seconds}s`)
      markEnded(game.id)
      if (mountedIsoToClean) {
        void unmountPs3Iso(mountedIsoToClean)
      }
      // Persist a crash report when the exit looks like a real crash. The
      // tracker decides — clean exits after >30s are ignored, everything
      // else is recorded with a parsed signature + category.
      if (!userStopped) {
        const report = recordCrash({
          gameId: game.id,
          gameTitle: game.title,
          emulatorId: emu.id,
          emulatorName: emu.name,
          exitCode: code,
          uptimeSeconds: seconds,
          output: tail
        })
        if (report) {
          broadcast(IPC.system.crashRecorded, report)
        }
      }
      // Short-lived non-zero exit = almost certainly a launch failure
      // (missing BIOS, bad ISO, missing DLL). Try the next emulator for the
      // platform before bothering the user.
      if (!userStopped && code !== 0 && code !== null && seconds < FAILURE_THRESHOLD_SECONDS) {
        if (tail) log.warn('launcher', `failure output tail`, { tail: tail.slice(-2000) })
        void handleFailureOrFallback(game, code, seconds, emu.name, emu.id, tail, tried)
      } else if (seconds >= FAILURE_THRESHOLD_SECONDS && tried.size > 1) {
        // This launch survived past the failure threshold using a fallback —
        // remember the working emulator so next time we skip straight to it.
        rememberWorkingEmulator(game, emu.id)
      }
    })
    return { ok: true, pid: child.pid, command }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('launcher', `spawn failed: ${msg}`)
    if (mountedIsoToClean) void unmountPs3Iso(mountedIsoToClean)
    return { ok: false, error: msg }
  }
}

async function handleFailureOrFallback(
  game: Game,
  code: number | null,
  seconds: number,
  emulatorName: string,
  failedEmuId: EmulatorId,
  tail: string,
  tried: Set<EmulatorId>
): Promise<void> {
  // In manual mode the user is in charge — never silently retry with a
  // different emulator. Just surface the failure so they can pick a new one.
  if (settingsStore.load().emulatorSelection === 'manual') {
    broadcastFailure(game, code, seconds, emulatorName, tail)
    return
  }
  const next = pickFallback(game, tried)
  if (!next) {
    // Out of locally installed options — offer an auto-installable upgrade
    // (e.g. DuckStation for PS1) if one exists.
    const offer = suggestAutoInstall(game.platform, tried)
    broadcastFailure(game, code, seconds, emulatorName, tail, offer)
    return
  }
  const nextDef = EMULATORS[next]
  log.info('launcher', `auto-fallback ${failedEmuId} → ${next} for ${game.title}`)
  // Give the next emulator a fighting chance: if it's missing BIOS but a
  // compatible one exists in another emulator we found, copy it over before
  // we spawn.
  const detected = libraryStore.load().emulators
  shareBiosAcrossEmulators(detected)
  broadcast(IPC.launch.fallback, {
    gameId: game.id,
    gameTitle: game.title,
    fromEmulator: emulatorName,
    toEmulator: nextDef?.name ?? next
  })
  // Re-spawn with the new emulator. We patch the game record so launchGame
  // uses the right id, but only persist permanently once the fallback succeeds
  // (i.e. the new emulator runs past FAILURE_THRESHOLD_SECONDS).
  const result = await launchGame({ ...game, emulator: next }, tried)
  if (!result.ok) {
    broadcastFailure(
      game,
      code,
      seconds,
      emulatorName,
      tail + `\n\n[fallback ${next} também falhou: ${result.error}]`
    )
  }
}

/**
 * Persist the emulator that just worked so future launches skip the duds.
 *
 * We update both the per-game record (so this specific game keeps the choice)
 * and the per-platform default (so other games on the same platform also
 * benefit). The per-platform default is honored at scan time.
 */
function rememberWorkingEmulator(game: Game, workingEmuId: EmulatorId): void {
  const settings = settingsStore.load()
  // Respect manual mode: don't overwrite the user's per-game/per-platform pick
  // even if a fallback worked, because the user explicitly chose what to run.
  if (settings.emulatorSelection === 'manual') return
  if (game.emulator !== workingEmuId) {
    libraryStore.patchGame(game.id, { emulator: workingEmuId })
  }
  if (settings.platformEmulators[game.platform] !== workingEmuId) {
    settingsStore.save({
      ...settings,
      platformEmulators: { ...settings.platformEmulators, [game.platform]: workingEmuId }
    })
    log.info(
      'launcher',
      `platform default for ${game.platform} is now ${workingEmuId} (after fallback success)`
    )
  }
}

/**
 * Resolve what to actually hand RPCS3. Accepts:
 *   - .iso → mount + return PS3_GAME folder (decrypted dumps only)
 *   - folder containing PS3_GAME → return as-is
 *   - .pkg → return as-is (RPCS3 treats as installable game)
 */
async function resolveRpcs3Path(
  gamePath: string
): Promise<{ path: string; mountedIso?: string } | { error: string }> {
  const lower = gamePath.toLowerCase()
  if (lower.endsWith('.pkg')) return { path: gamePath }
  if (lower.endsWith('.iso')) {
    const r = await mountPs3Iso(gamePath)
    if ('error' in r) return { error: r.error }
    return { path: r.bootPath, mountedIso: gamePath }
  }
  // Folder — find the disc root (parent of PS3_GAME) or EBOOT.BIN directly.
  const discRoot = findPs3GameFolder(gamePath)
  if (discRoot) {
    const eboot = join(discRoot, 'PS3_GAME', 'USRDIR', 'EBOOT.BIN')
    if (existsSync(eboot)) return { path: eboot }
    return { path: discRoot }
  }
  return { path: gamePath }
}

async function launchExternalStore(game: Game, storeName: string): Promise<LaunchResult> {
  try {
    await shell.openExternal(game.path)
    const startedAt = Date.now()
    markStarted({
      gameId: game.id,
      gameTitle: game.title,
      emulatorName: storeName,
      startedAt: new Date(startedAt).toISOString(),
      platform: game.platform
    })
    // Real exit detection would need process polling — out of scope.
    // Keep Discord presence active after the bookkeeping timeout because the
    // Steam child process is not observable from the steam:// launch URI.
    setTimeout(() => {
      recordPlaySession(game, startedAt)
      markEnded(game.id, { clearPresence: false, restoreGameHub: false })
    }, 60_000)
    setTimeout(() => {
      void discordRpcClearIfMatches(game.title, startedAt)
    }, EXTERNAL_STORE_PRESENCE_SAFETY_MS)
    return { ok: true, command: game.path }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function launchNative(game: Game): Promise<LaunchResult> {
  if (!existsSync(game.path)) {
    return { ok: false, error: `Arquivo não encontrado: ${game.path}` }
  }
  try {
    const startedAt = Date.now()
    const child = spawn(game.path, [], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const output = new RingBuffer(OUTPUT_BUFFER_LINES)
    child.stdout?.on('data', (chunk: Buffer) => output.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => output.push(chunk))
    markStarted({
      gameId: game.id,
      gameTitle: game.title,
      emulatorName: 'Windows',
      pid: child.pid,
      processName: game.path.split(/[\\/]/).pop()?.replace(/\.exe$/i, '').toLowerCase(),
      executablePath: game.path,
      startedAt: new Date(startedAt).toISOString(),
      platform: game.platform
    })
    const launchSettings = settingsStore.load().launch
    if (launchSettings.moveGameWindowAfterLaunch) {
      maybeMoveGameWindow(child.pid, launchSettings.gameDisplay, launchSettings.fullscreenGames)
    }
    child.on('error', () => markEnded(game.id))
    child.on('exit', (code) => {
      const userStopped = forceStopping.delete(game.id)
      const seconds = recordPlaySession(game, startedAt)
      const tail = output.flush()
      markEnded(game.id)
      if (!userStopped && code !== 0 && code !== null && seconds < FAILURE_THRESHOLD_SECONDS) {
        if (tail) log.warn('launcher', `native failure output tail`, { tail: tail.slice(-2000) })
        broadcastFailure(game, code, seconds, 'Windows', tail)
      }
    })
    return { ok: true, pid: child.pid, command: game.path }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function openFolder(path: string): Promise<void> {
  await shell.openPath(path)
}

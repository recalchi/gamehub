import { execFile, spawn, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PATHS } from './paths'
import { log } from './logger'

const execFileAsync = promisify(execFile)

/**
 * Read FPS data from RivaTuner Statistics Server (RTSS) shared memory.
 *
 * Approach: compile a tiny C# console helper once into userData/cache/
 * (using the csc.exe that ships with every Windows 10+ install) and invoke
 * it on each probe. This avoids the PowerShell `Add-Type` overhead entirely
 * and is dramatically more reliable than feeding commands into a long-lived
 * powershell.exe via stdin (which had pipe-buffering quirks).
 *
 * Each probe is ~30-100ms. Cached for 700ms so the perf monitor's 2s sample
 * loop doesn't hammer the helper.
 */

export interface RtssEntry {
  pid: number
  processName: string
  fps: number
}

export interface RtssStatus {
  installed: boolean
  running: boolean
  installPath?: string
  /** Diagnostic info surfaced to the UI so the user can see what's wrong. */
  diagnostic: {
    helperBuilt: boolean
    helperPath: string
    lastProbeAt?: string
    lastProbeError?: string
    lastEntryCount: number
    helperBuildError?: string
    /** SHM status code reported by the C# helper: NO_SHM | NO_SIG | EMPTY | OK */
    shmStatus?: string
    /** Free-text detail line from the helper. */
    shmDetail?: string
  }
}

const KNOWN_RTSS_PATHS = [
  'C:\\Program Files (x86)\\RivaTuner Statistics Server\\RTSS.exe',
  'C:\\Program Files\\RivaTuner Statistics Server\\RTSS.exe',
  'C:\\Program Files (x86)\\MSI Afterburner\\RTSS\\RTSS.exe',
  'C:\\Program Files\\MSI Afterburner\\RTSS\\RTSS.exe',
  'D:\\Program Files (x86)\\RivaTuner Statistics Server\\RTSS.exe',
  'D:\\Program Files\\RivaTuner Statistics Server\\RTSS.exe',
  'E:\\Program Files (x86)\\RivaTuner Statistics Server\\RTSS.exe'
]

const CSC_CANDIDATES = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
]

const HELPER_DIR = join(PATHS.cache, 'rtss')
const HELPER_EXE = join(HELPER_DIR, 'rtss-probe.exe')
const HELPER_SRC = join(HELPER_DIR, 'rtss-probe.cs')

/**
 * Bump this whenever HELPER_CS changes, so an existing cached exe gets
 * rebuilt. Without this you'd keep running the old probe forever.
 */
const HELPER_VERSION = 5
const HELPER_VERSION_FILE = join(HELPER_DIR, 'version')

const diagnostic: RtssStatus['diagnostic'] = {
  helperBuilt: false,
  helperPath: HELPER_EXE,
  lastEntryCount: 0
}

let cache: { ts: number; entries: RtssEntry[] } = { ts: 0, entries: [] }
const CACHE_MS = 700
let helperBuildPromise: Promise<boolean> | null = null

function locateCsc(): string | null {
  for (const candidate of CSC_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function readBuiltVersion(): number {
  try {
    return Number(readFileSync(HELPER_VERSION_FILE, 'utf8')) || 0
  } catch {
    return 0
  }
}

async function ensureHelperBuilt(): Promise<boolean> {
  if (
    diagnostic.helperBuilt &&
    existsSync(HELPER_EXE) &&
    readBuiltVersion() === HELPER_VERSION
  ) {
    return true
  }
  if (helperBuildPromise) return helperBuildPromise
  helperBuildPromise = (async () => {
    try {
      mkdirSync(HELPER_DIR, { recursive: true })
      writeFileSync(HELPER_SRC, HELPER_CS, 'utf8')
      const csc = locateCsc()
      if (!csc) {
        const err = 'csc.exe not found (.NET Framework 4 missing)'
        diagnostic.helperBuildError = err
        log.warn('rtss', err)
        return false
      }
      log.info('rtss', `compiling helper with ${csc}`)
      await execFileAsync(
        csc,
        [
          '/nologo',
          '/target:exe',
          '/platform:anycpu',
          `/out:${HELPER_EXE}`,
          HELPER_SRC
        ],
        { windowsHide: true, timeout: 30000 }
      )
      const ok = existsSync(HELPER_EXE)
      diagnostic.helperBuilt = ok
      if (!ok) {
        diagnostic.helperBuildError = 'csc.exe ran but exe not found'
        log.warn('rtss', diagnostic.helperBuildError)
        return false
      }
      try {
        writeFileSync(HELPER_VERSION_FILE, String(HELPER_VERSION), 'utf8')
      } catch {
        // version file is just an optimization
      }
      log.info('rtss', `helper built at ${HELPER_EXE} (v${HELPER_VERSION})`)
      return true
    } catch (err) {
      diagnostic.helperBuildError = String(err)
      log.warn('rtss', `helper build failed: ${String(err)}`)
      return false
    } finally {
      helperBuildPromise = null
    }
  })()
  return helperBuildPromise
}

function parseEntries(stdout: string): RtssEntry[] {
  const out: RtssEntry[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith('__STATUS__')) {
      const parts = line.split('\t')
      diagnostic.shmStatus = parts[1]?.trim() || undefined
      diagnostic.shmDetail = parts[2]?.trim() || undefined
      continue
    }
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const pid = Number(parts[0])
    const name = parts[1]?.trim()
    const fps = Number(parts[2])
    if (!Number.isFinite(pid) || pid <= 0 || !name) continue
    if (!Number.isFinite(fps) || fps <= 0 || fps > 1000) continue
    out.push({ pid, processName: name, fps })
  }
  return out
}

export async function readRtss(): Promise<RtssEntry[]> {
  if (process.platform !== 'win32') return []
  const now = Date.now()
  if (now - cache.ts < CACHE_MS) return cache.entries

  const built = await ensureHelperBuilt()
  if (!built) {
    diagnostic.lastProbeAt = new Date().toISOString()
    diagnostic.lastProbeError = diagnostic.helperBuildError ?? 'helper not built'
    return []
  }

  try {
    const { stdout } = await execFileAsync(HELPER_EXE, [], {
      windowsHide: true,
      timeout: 3500,
      maxBuffer: 256 * 1024
    })
    const entries = parseEntries(stdout)
    diagnostic.lastProbeAt = new Date().toISOString()
    diagnostic.lastProbeError = undefined
    diagnostic.lastEntryCount = entries.length
    cache = { ts: now, entries }
    return entries
  } catch (err) {
    // Helper may have crashed (Windows Defender, AV, or CLR exception) AFTER
    // already printing useful diagnostic to stdout. execFileAsync rejects with
    // an error that carries `stdout`/`stderr` from the child — recover those
    // so the UI still gets shmStatus instead of just "Command failed".
    const e = err as { stdout?: string; stderr?: string; message?: string }
    if (typeof e?.stdout === 'string' && e.stdout.length > 0) {
      parseEntries(e.stdout)
    }
    diagnostic.lastProbeAt = new Date().toISOString()
    diagnostic.lastProbeError = String(e?.message ?? err)
    log.debug?.('rtss', `probe failed: ${String(err)}`)
    return cache.entries
  }
}

export async function fpsForProcess(
  pid?: number,
  processName?: string
): Promise<number | undefined> {
  const entries = await readRtss()
  if (entries.length === 0) return undefined
  const want = processName?.toLowerCase().replace(/\.exe$/, '')
  const match =
    (pid ? entries.find((e) => e.pid === pid) : undefined) ??
    (want
      ? entries.find((e) => e.processName.toLowerCase().replace(/\.exe$/, '') === want)
      : undefined)
  return match?.fps
}

function findRtssExe(): string | undefined {
  for (const candidate of KNOWN_RTSS_PATHS) {
    if (existsSync(candidate)) return candidate
  }
  // Last-ditch: query the registry. RTSS writes its install path there.
  // We do this synchronously via the Windows `reg.exe` command — small cost,
  // only on cold start.
  try {
    for (const key of [
      'HKLM\\SOFTWARE\\Unwinder\\RTSS',
      'HKLM\\SOFTWARE\\WOW6432Node\\Unwinder\\RTSS'
    ]) {
      const res = spawnSync('reg.exe', ['query', key, '/v', 'InstallPath'], {
        windowsHide: true,
        encoding: 'utf8'
      })
      const match = res.stdout?.match(/InstallPath\s+REG_SZ\s+(.+)/i)
      if (match) {
        const dir = match[1].trim()
        const exe = join(dir, 'RTSS.exe')
        if (existsSync(exe)) return exe
      }
    }
  } catch {
    // ignore
  }
  return undefined
}

async function processIsRunning(name: string): Promise<boolean> {
  if (process.platform !== 'win32') return false
  return await new Promise<boolean>((resolve) => {
    const proc = spawn('tasklist.exe', ['/FI', `IMAGENAME eq ${name}`, '/NH'], {
      windowsHide: true
    })
    let out = ''
    proc.stdout.on('data', (c) => (out += String(c)))
    proc.on('exit', () => resolve(out.toLowerCase().includes(name.toLowerCase())))
    proc.on('error', () => resolve(false))
  })
}

export async function rtssStatus(): Promise<RtssStatus> {
  const installPath = findRtssExe()
  // Cheap checks only — must return fast so the UI can render the banner
  // immediately. The probe (which may build csc, spawn the helper, etc.)
  // runs in the background; subsequent rtssStatus polls pick up its result
  // via the shared `diagnostic` object.
  const taskListRunning = await processIsRunning('RTSS.exe')
  // Trigger probe in background, but don't await it.
  void readRtss().catch(() => undefined)
  // RTSS is "running" if tasklist sees the exe — full stop. The probe error
  // is independent of whether RTSS itself is alive: NO_SIG / Command failed
  // both mean WE can't read SHM, not that RTSS is dead. Conflating them was
  // what made the banner say "instalado mas não está rodando" while RTSS was
  // clearly open on screen.
  const running = diagnostic.lastEntryCount > 0 || taskListRunning
  return {
    installed: !!installPath,
    running,
    installPath,
    diagnostic: { ...diagnostic }
  }
}

export async function ensureRtssRunning(): Promise<
  'already-running' | 'started' | 'not-installed' | 'spawn-failed'
> {
  // Trigger helper build early so we surface compile errors sooner.
  await ensureHelperBuilt()
  const installPath = findRtssExe()
  if (!installPath) return 'not-installed'
  const taskListRunning = await processIsRunning('RTSS.exe')
  if (taskListRunning) {
    // Already in the process list — re-probe shared memory so caller sees
    // whether we can actually read data from it.
    await readRtss()
    return 'already-running'
  }
  // RTSS hooks into other processes (overlay injection) so it requires
  // admin. Spawning the .exe directly from a non-elevated parent silently
  // fails. Use `Start-Process -Verb RunAs` so Windows surfaces a real UAC
  // prompt the user can approve.
  try {
    log.info('rtss', `attempting elevated start of ${installPath}`)
    const ps = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Start-Process -FilePath '${installPath.replace(/'/g, "''")}' -Verb RunAs -WindowStyle Hidden`
      ],
      { windowsHide: true, timeout: 30000 }
    )
    if (ps.status !== 0) {
      const errText = (ps.stderr ?? Buffer.from('')).toString().trim()
      log.warn('rtss', `elevated start failed code=${ps.status}: ${errText}`)
      return 'spawn-failed'
    }
    // Wait up to 8s for RTSS to publish its shared memory.
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 500))
      if (await processIsRunning('RTSS.exe')) break
    }
    const verifyRunning = await processIsRunning('RTSS.exe')
    if (!verifyRunning) {
      log.warn('rtss', 'elevation OK but RTSS.exe never appeared (UAC denied?)')
      return 'spawn-failed'
    }
    // Force a fresh probe to populate diagnostics.
    cache = { ts: 0, entries: [] }
    await readRtss()
    return 'started'
  } catch (err) {
    log.warn('rtss', `auto-start failed: ${String(err)}`)
    return 'spawn-failed'
  }
}

export function shutdownRtssDaemon(): void {
  // Helper is a one-shot process per probe; nothing to clean up. Kept for
  // API compatibility with the previous persistent-daemon implementation.
}

/**
 * C# source for the bundled probe helper. Compiled on first read with
 * `csc.exe` (ships with Windows). Prints `pid\\tname\\tfps` per line.
 */
const HELPER_CS = `
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Globalization;

class RtssProbe {
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern IntPtr OpenFileMapping(uint dwDesiredAccess, bool bInheritHandle, string lpName);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern IntPtr MapViewOfFile(IntPtr hFileMapping, uint dwDesiredAccess, uint dwOffsetHigh, uint dwOffsetLow, UIntPtr dwNumberOfBytesToMap);
  [DllImport("kernel32.dll")]
  static extern bool UnmapViewOfFile(IntPtr lpBaseAddress);
  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr hObject);

  const uint FILE_MAP_READ = 0x0004;
  const uint FILE_MAP_ALL_ACCESS = 0xF001F;

  static void Main() {
    // First line of output is a status: __STATUS__\\tCODE\\tdetail
    //   codes: NO_SHM | NO_SIG | EMPTY | OK
    // Then one line per active entry: pid\\tname\\tfps
    string[] names = {
      "RTSSSharedMemoryV2",
      "Global\\\\RTSSSharedMemoryV2",
      "Local\\\\RTSSSharedMemoryV2",
      "Session\\\\1\\\\RTSSSharedMemoryV2",
      "RTSSSharedMemory",
      "Global\\\\RTSSSharedMemory",
      "Local\\\\RTSSSharedMemory"
    };
    string status = "NO_SHM";
    var detailParts = new StringBuilder();
    string detail = "";
    var entries = new StringBuilder();
    int matchedAppArr = 0;
    int activeCount = 0;
    foreach (var mapName in names) {
      // Try ALL_ACCESS first — some RTSS builds publish the mapping with a
      // security descriptor that requires write rights even to read. If that
      // returns access-denied, fall back to read-only.
      var h = OpenFileMapping(FILE_MAP_ALL_ACCESS, false, mapName);
      if (h == IntPtr.Zero) {
        h = OpenFileMapping(FILE_MAP_READ, false, mapName);
      }
      if (h == IntPtr.Zero) {
        int err = Marshal.GetLastWin32Error();
        if (detailParts.Length > 0) detailParts.Append(", ");
        detailParts.Append(mapName).Append(" err=").Append(err);
        // Only rebuild detail from err list if we haven't already captured a
        // sig=0x... line (that's the smoking gun for MIC denial and we don't
        // want a noisy err=2 trail to bury it).
        if (!detail.StartsWith("sig=")) detail = detailParts.ToString();
        continue;
      }
      var view = MapViewOfFile(h, FILE_MAP_READ, 0, 0, UIntPtr.Zero);
      if (view == IntPtr.Zero) {
        int err = Marshal.GetLastWin32Error();
        detail = "MapViewOfFile err=" + err + " for " + mapName;
        CloseHandle(h);
        continue;
      }
      try {
        uint sig = (uint)Marshal.ReadInt32(view, 0);
        if (sig != 0x53535452u) {
          status = "NO_SIG";
          // Preserve the sig value as the FINAL detail — when sig is 0 it
          // almost always means our medium-IL process is being denied data
          // by Mandatory Integrity Control vs RTSS's high-IL mapping.
          string sigDetail = "sig=0x" + sig.ToString("X8") + " in " + mapName;
          if (detailParts.Length > 0) {
            detail = sigDetail + "; tried: " + detailParts.ToString();
          } else {
            detail = sigDetail;
          }
          // Continue trying other names — but break out of the inner block
          // properly (the finally clause unmaps/closes the handle).
          continue;
        }
        uint appEntrySize = (uint)Marshal.ReadInt32(view, 8);
        uint appArrOffset = (uint)Marshal.ReadInt32(view, 12);
        uint appArrSize = (uint)Marshal.ReadInt32(view, 16);
        matchedAppArr = (int)appArrSize;
        if (appEntrySize == 0 || appArrSize == 0 || appArrSize > 256) {
          status = "EMPTY";
          detail = "appEntrySize=" + appEntrySize + " appArrSize=" + appArrSize + " in " + mapName;
          continue;
        }
        for (int i = 0; i < appArrSize; i++) {
          long off = (long)appArrOffset + (long)i * (long)appEntrySize;
          int pid = Marshal.ReadInt32(view, (int)off);
          if (pid == 0) continue;
          activeCount++;
          byte[] nameBuf = new byte[260];
          Marshal.Copy(IntPtr.Add(view, (int)off + 4), nameBuf, 0, 260);
          int z = Array.IndexOf<byte>(nameBuf, 0); if (z < 0) z = 260;
          string name = Encoding.ASCII.GetString(nameBuf, 0, z);
          int sl = Math.Max(name.LastIndexOf('\\\\'), name.LastIndexOf('/'));
          if (sl >= 0 && sl < name.Length - 1) name = name.Substring(sl + 1);
          uint t0 = (uint)Marshal.ReadInt32(view, (int)off + 0x10C);
          uint t1 = (uint)Marshal.ReadInt32(view, (int)off + 0x110);
          uint frames = (uint)Marshal.ReadInt32(view, (int)off + 0x114);
          if (t1 <= t0 || frames == 0) continue;
          double fps = (double)frames * 1000.0 / (double)(t1 - t0);
          if (fps <= 0 || fps > 1000) continue;
          entries.Append(pid); entries.Append('\\t');
          entries.Append(name); entries.Append('\\t');
          entries.Append(fps.ToString("F1", CultureInfo.InvariantCulture));
          entries.Append('\\n');
        }
        if (entries.Length > 0) {
          status = "OK";
          detail = "appArrSize=" + matchedAppArr + " active=" + activeCount;
        } else {
          status = "EMPTY";
          detail = "appArrSize=" + matchedAppArr + " active=" + activeCount;
        }
        break;
      } finally {
        UnmapViewOfFile(view);
        CloseHandle(h);
      }
    }
    Console.Write("__STATUS__\\t" + status + "\\t" + detail + "\\n");
    Console.Write(entries.ToString());
  }
}
`.trim()

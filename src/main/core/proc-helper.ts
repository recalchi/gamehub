/**
 * Tiny C# helper that queries a single process by PID and prints JSON.
 *
 * Why it exists: this user's machine reproducibly fails to spawn PowerShell
 * (`powershell.exe` exits non-zero with no stderr — likely anti-cheat or
 * Defender interference). Without a usable PowerShell, the perf monitor's
 * fast-path silently failed every tick and the panel sat on `--` forever.
 *
 * This helper uses pure System.Diagnostics.Process — no PowerShell, no WMI,
 * no profile loading. ~20ms cold start, single binary, csc.exe-compiled on
 * first use just like the RTSS probe.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PATHS } from './paths'
import { log } from './logger'

const execFileAsync = promisify(execFile)

export interface ProcQueryResult {
  name: string
  ws: number
  pvt: number
  cpu: number
  responding: boolean
  title?: string
}

const HELPER_DIR = join(PATHS.cache, 'proc')
const HELPER_EXE = join(HELPER_DIR, 'proc-query.exe')
const HELPER_SRC = join(HELPER_DIR, 'proc-query.cs')
const HELPER_VERSION = 1
const HELPER_VERSION_FILE = join(HELPER_DIR, 'version')

const CSC_CANDIDATES = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
]

let buildPromise: Promise<boolean> | null = null
let built = false

function locateCsc(): string | null {
  for (const c of CSC_CANDIDATES) if (existsSync(c)) return c
  return null
}

function readBuiltVersion(): number {
  try {
    return Number(readFileSync(HELPER_VERSION_FILE, 'utf8')) || 0
  } catch {
    return 0
  }
}

async function ensureBuilt(): Promise<boolean> {
  if (built && existsSync(HELPER_EXE) && readBuiltVersion() === HELPER_VERSION) return true
  if (buildPromise) return buildPromise
  buildPromise = (async () => {
    try {
      mkdirSync(HELPER_DIR, { recursive: true })
      writeFileSync(HELPER_SRC, HELPER_CS, 'utf8')
      const csc = locateCsc()
      if (!csc) {
        log.warn('proc-helper', 'csc.exe not found')
        return false
      }
      await execFileAsync(
        csc,
        ['/nologo', '/target:exe', '/platform:anycpu', `/out:${HELPER_EXE}`, HELPER_SRC],
        { windowsHide: true, timeout: 30000 }
      )
      built = existsSync(HELPER_EXE)
      if (built) {
        writeFileSync(HELPER_VERSION_FILE, String(HELPER_VERSION), 'utf8')
        log.info('proc-helper', `built at ${HELPER_EXE}`)
      }
      return built
    } catch (err) {
      log.warn('proc-helper', `build failed: ${String(err)}`)
      return false
    } finally {
      buildPromise = null
    }
  })()
  return buildPromise
}

export async function queryProcessByPid(pid: number): Promise<ProcQueryResult | null> {
  if (process.platform !== 'win32') return null
  if (!(await ensureBuilt())) return null
  try {
    const { stdout } = await execFileAsync(HELPER_EXE, [String(pid)], {
      windowsHide: true,
      timeout: 2000,
      maxBuffer: 64 * 1024
    })
    const trimmed = stdout.trim()
    if (!trimmed.startsWith('{')) return null
    return JSON.parse(trimmed) as ProcQueryResult
  } catch {
    return null
  }
}

const HELPER_CS = `
using System;
using System.Diagnostics;
using System.Globalization;
using System.Text;

class ProcQuery {
  static void Main(string[] args) {
    if (args.Length < 1) { Environment.Exit(1); }
    int pid;
    if (!int.TryParse(args[0], out pid)) { Environment.Exit(1); }
    Process p;
    try { p = Process.GetProcessById(pid); }
    catch { Environment.Exit(2); return; }
    var sb = new StringBuilder();
    sb.Append("{");
    sb.Append("\\"name\\":\\"").Append(Esc(p.ProcessName)).Append("\\",");
    long ws = 0; try { ws = p.WorkingSet64; } catch {}
    long pvt = 0; try { pvt = p.PrivateMemorySize64; } catch {}
    sb.Append("\\"ws\\":").Append(ws).Append(",");
    sb.Append("\\"pvt\\":").Append(pvt).Append(",");
    double cpu = 0; try { cpu = p.TotalProcessorTime.TotalSeconds; } catch {}
    sb.Append("\\"cpu\\":").Append(cpu.ToString("F3", CultureInfo.InvariantCulture)).Append(",");
    bool resp = true; try { resp = p.Responding; } catch {}
    sb.Append("\\"responding\\":").Append(resp ? "true" : "false");
    try {
      string title = p.MainWindowTitle ?? "";
      if (title.Length > 0) {
        sb.Append(",\\"title\\":\\"").Append(Esc(title)).Append("\\"");
      }
    } catch {}
    sb.Append("}");
    Console.Write(sb.ToString());
  }
  static string Esc(string s) {
    return (s ?? "").Replace("\\\\", "\\\\\\\\").Replace("\\"", "\\\\\\"");
  }
}
`.trim()

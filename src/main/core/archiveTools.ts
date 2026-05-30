import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, open, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { PATHS } from './paths'
import { log } from './logger'

/**
 * Unified archive extractor.
 *
 * Handles `.zip` via Windows-native PowerShell `Expand-Archive` (always
 * available on Win10+) and `.7z` via the standalone `7zr.exe` (~590KB, public
 * domain) we download on demand from 7-zip.org and cache in userData/tools/.
 *
 * Format detection prefers magic-byte inspection over file extension so we
 * can handle downloaded archives that have no extension (some game hosts
 * serve `Content-Disposition: filename=foo.zip` while the URL path is just
 * `foo`).
 */

const SEVEN_ZIP_URL = 'https://www.7-zip.org/a/7zr.exe'
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]) // "PK\x03\x04"
const SEVEN_ZIP_MAGIC = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) // "7z\xBC\xAF'\x1C"

export type ArchiveFormat = 'zip' | '7z' | 'unknown'

/** Peek the first 6 bytes of a file to identify the format. */
export async function detectArchiveFormat(filePath: string): Promise<ArchiveFormat> {
  let fh
  try {
    fh = await open(filePath, 'r')
    const buf = Buffer.alloc(6)
    await fh.read(buf, 0, 6, 0)
    if (buf.slice(0, 4).equals(ZIP_MAGIC)) return 'zip'
    if (buf.slice(0, 6).equals(SEVEN_ZIP_MAGIC)) return '7z'
    return 'unknown'
  } catch {
    return 'unknown'
  } finally {
    await fh?.close()
  }
}

let sevenZipPromise: Promise<string | null> | null = null

/**
 * Ensure `7zr.exe` is available in our tools dir. Lazily fetches from
 * 7-zip.org the first time it's needed; subsequent calls return immediately.
 * Memoised so concurrent extracts don't race the download.
 *
 * Returns the path on success, or null if the download failed (caller can
 * surface a helpful error). Safe to retry on next call after a failure.
 */
export function ensureSevenZipBinary(): Promise<string | null> {
  if (sevenZipPromise) return sevenZipPromise
  sevenZipPromise = (async () => {
    const toolsDir = join(PATHS.userData, 'tools')
    await mkdir(toolsDir, { recursive: true })
    const dest = join(toolsDir, '7zr.exe')
    if (existsSync(dest)) {
      try {
        const st = await stat(dest)
        // Sanity check — real 7zr.exe is ≈590KB; anything <100KB is a stub
        // from a failed previous download.
        if (st.size > 100_000) return dest
      } catch {
        /* fall through and re-download */
      }
    }
    try {
      log.info('archiveTools', `downloading 7zr.exe from ${SEVEN_ZIP_URL}`)
      const r = await fetch(SEVEN_ZIP_URL, { redirect: 'follow' })
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`)
      const stream = createWriteStream(dest)
      const reader = r.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        stream.write(Buffer.from(value))
      }
      stream.end()
      await new Promise<void>((resolve, reject) => {
        stream.on('finish', () => resolve())
        stream.on('error', reject)
      })
      const st = await stat(dest)
      log.info('archiveTools', `7zr.exe ready (${st.size} bytes) at ${dest}`)
      return dest
    } catch (err) {
      log.error('archiveTools', `failed to fetch 7zr.exe: ${String(err)}`)
      // Clean up any partial file so the next retry doesn't get a half-baked exe
      await unlink(dest).catch(() => {})
      // Reset memo so a later call can retry
      sevenZipPromise = null
      return null
    }
  })()
  return sevenZipPromise
}

/**
 * Extract an archive (.zip or .7z, format auto-detected) into `destDir`.
 * Returns true on success.
 */
export async function extractArchive(archivePath: string, destDir: string): Promise<boolean> {
  await mkdir(destDir, { recursive: true })
  const format = await detectArchiveFormat(archivePath)
  if (format === 'zip') return extractZipWithPowerShell(archivePath, destDir)
  if (format === '7z') return extractWithSevenZip(archivePath, destDir)
  log.warn('archiveTools', `unrecognized archive format at ${archivePath}`)
  return false
}

function extractZipWithPowerShell(archive: string, destination: string): Promise<boolean> {
  return new Promise((resolve) => {
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath "${archive}" -DestinationPath "${destination}" -Force`
    ]
    const child = spawn('powershell.exe', args, { windowsHide: true })
    let stderr = ''
    child.stderr?.on('data', (b: Buffer) => {
      stderr += b.toString('utf8')
    })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => {
      if (code === 0) resolve(true)
      else {
        log.warn('archiveTools', `Expand-Archive failed code=${code}: ${stderr.trim()}`)
        resolve(false)
      }
    })
  })
}

async function extractWithSevenZip(archive: string, destination: string): Promise<boolean> {
  const exe = await ensureSevenZipBinary()
  if (!exe) {
    log.warn('archiveTools', 'cannot extract .7z — 7zr.exe unavailable')
    return false
  }
  return new Promise((resolve) => {
    // -y: assume Yes on all prompts; -bso0/-bsp0: silence stdout/progress;
    // x: extract with paths; -o: output dir (no space after -o)
    const args = ['x', '-y', '-bso0', '-bsp0', `-o${destination}`, archive]
    const child = spawn(exe, args, { windowsHide: true })
    let stderr = ''
    child.stderr?.on('data', (b: Buffer) => {
      stderr += b.toString('utf8')
    })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => {
      if (code === 0) resolve(true)
      else {
        log.warn('archiveTools', `7zr.exe failed code=${code}: ${stderr.trim()}`)
        resolve(false)
      }
    })
  })
}

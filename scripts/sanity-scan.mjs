// Quick standalone sanity check: run the detector against D:\Jogos without
// spinning up Electron. Useful for verifying platform classification on the
// user's actual library.
//
// Usage:  node scripts/sanity-scan.mjs [root]

import { readdirSync, statSync } from 'node:fs'
import { join, extname, basename, dirname } from 'node:path'

const ROOT = process.argv[2] || 'D:\\Jogos'

// ---- inlined minimal copy of the detector/platform tables ----
const EXT_MAP = {
  nes: 'NES',
  smc: 'SNES', sfc: 'SNES',
  n64: 'N64', z64: 'N64', v64: 'N64',
  gba: 'GBA', gb: 'GB', gbc: 'GBC',
  nds: 'NDS',
  iso: '?',
  bin: '?', cue: 'PS1 (cue)', chd: '?',
  cso: 'PSP', pbp: 'PSP',
  rvz: 'GameCube/Wii', wbfs: 'Wii', gcm: 'GameCube',
  pkg: 'PS3',
  xbe: 'Xbox',
  '7z': 'archive', zip: 'archive', rar: 'archive',
  exe: 'PC'
}
const HINTS = [
  [/ps1|psx/i, 'PS1'],
  [/ps2/i, 'PS2'],
  [/ps3/i, 'PS3'],
  [/psp/i, 'PSP'],
  [/gamecube|ngc/i, 'GameCube'],
  [/wii/i, 'Wii'],
  [/xbox.?360/i, 'Xbox 360'],
  [/xbox/i, 'Xbox'],
  [/n64/i, 'N64'],
  [/snes/i, 'SNES'],
  [/nes\b/i, 'NES'],
  [/gba/i, 'GBA'],
  [/nds/i, 'NDS']
]
const SKIP = new Set(['bios', 'cheats', 'config', 'covers', 'memcards', 'cards', 'savestates', 'sstates', 'shaders', 'plugins', 'patches', 'dev_hdd0', 'qt6', 'd3d12', 'log', 'screenshots', 'textures'])

function walk(dir, out, depth = 0) {
  if (depth > 6) return
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const e of entries) {
    const full = join(dir, e)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) {
      if (SKIP.has(e.toLowerCase())) continue
      walk(full, out, depth + 1)
      continue
    }
    out.push(full)
  }
}

function classify(path) {
  const ext = extname(path).slice(1).toLowerCase()
  const hint = HINTS.find(([re]) => re.test(path))
  const guess = EXT_MAP[ext]
  if (!guess) return null
  if (guess === '?') return hint?.[1] ?? 'unknown'
  return hint?.[1] ?? guess
}

console.log(`Scanning ${ROOT}...\n`)
const files = []
walk(ROOT, files)

const byPlatform = {}
let withFile = 0
for (const f of files) {
  const platform = classify(f)
  if (!platform) continue
  withFile++
  byPlatform[platform] = (byPlatform[platform] ?? 0) + 1
}

console.log(`Total files visited:        ${files.length}`)
console.log(`Files matched as games:     ${withFile}\n`)
console.log('By platform:')
for (const [p, c] of Object.entries(byPlatform).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${p.padEnd(20)} ${c}`)
}
console.log('\nFirst 12 matches:')
let shown = 0
for (const f of files) {
  const p = classify(f)
  if (!p) continue
  console.log(`  [${p.padEnd(14)}] ${basename(f)}`)
  if (++shown >= 12) break
}

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = String(pkg.version)
const releaseDir = join(root, 'release')
const unpackedDir = join(releaseDir, 'win-unpacked')
const zipName = `GameHub-portable-x64-${version}.zip`
const zipPath = join(releaseDir, zipName)

if (!existsSync(unpackedDir)) {
  throw new Error(`Portable source folder not found: ${unpackedDir}`)
}

if (existsSync(zipPath)) rmSync(zipPath, { force: true })

// Use native tar.exe (Windows 10/11) to avoid extra NPM deps.
execFileSync('tar', ['-a', '-c', '-f', zipPath, '-C', unpackedDir, '.'], {
  stdio: 'inherit'
})

console.log(`Portable package created: ${zipPath}`)

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const releaseDir = join(root, 'release')
const unpackedDir = join(releaseDir, 'win-unpacked')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = String(pkg.version)

const zipName = 'GameHub-portable-x64.zip'
const versionedZipName = `GameHub-portable-x64-${version}.zip`
const zipPath = join(releaseDir, zipName)
const versionedZipPath = join(releaseDir, versionedZipName)

if (!existsSync(unpackedDir)) {
  throw new Error(`Portable source folder not found: ${unpackedDir}`)
}

if (existsSync(zipPath)) rmSync(zipPath, { force: true })
if (existsSync(versionedZipPath)) rmSync(versionedZipPath, { force: true })

// Use native tar.exe (Windows 10/11) to avoid extra NPM deps.
// `--force-local` is required because tar otherwise treats `D:\path\file.zip`
// as a `host:path` remote URI and tries to ssh to "D:".
execFileSync('tar', ['--force-local', '-a', '-c', '-f', zipPath, '-C', unpackedDir, '.'], {
  stdio: 'inherit'
})

// Mirror to a versioned filename so previous releases stay archived next to
// the rolling "latest" alias. Same content, cheap (filesystem copy).
copyFileSync(zipPath, versionedZipPath)

console.log(`Portable package created:`)
console.log(`  ${zipPath}`)
console.log(`  ${versionedZipPath}`)

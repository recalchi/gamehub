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

const compressScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$source = $env:GAMEHUB_PORTABLE_SOURCE
$destination = $env:GAMEHUB_PORTABLE_ZIP
if (-not $source -or -not $destination) {
  throw 'GAMEHUB_PORTABLE_SOURCE and GAMEHUB_PORTABLE_ZIP are required.'
}
if (Test-Path -LiteralPath $destination) {
  Remove-Item -LiteralPath $destination -Force
}
[System.IO.Compression.ZipFile]::CreateFromDirectory($source, $destination, [System.IO.Compression.CompressionLevel]::Optimal, $false)
`

execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', compressScript], {
  env: {
    ...process.env,
    GAMEHUB_PORTABLE_SOURCE: unpackedDir,
    GAMEHUB_PORTABLE_ZIP: zipPath
  },
  stdio: 'inherit'
})

// Mirror to a versioned filename so previous releases stay archived next to
// the rolling "latest" alias. Same content, cheap (filesystem copy).
copyFileSync(zipPath, versionedZipPath)

console.log(`Portable package created:`)
console.log(`  ${zipPath}`)
console.log(`  ${versionedZipPath}`)

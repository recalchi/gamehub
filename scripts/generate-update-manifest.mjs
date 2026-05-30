import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = String(pkg.version)
const channel = process.env.UPDATE_CHANNEL || 'stable'
const minSupportedVersion = process.env.MIN_SUPPORTED_VERSION || version
const releaseDir = join(root, 'release')
const exeName = `GameHub-Setup-x64-${version}.exe`
const exePath = join(releaseDir, exeName)
const latestYmlPath = join(releaseDir, 'latest.yml')
const portableName = `GameHub-portable-x64-${version}.zip`
const portablePath = join(releaseDir, portableName)

if (!existsSync(exePath)) {
  throw new Error(`Installer not found: ${exePath}`)
}

const installer = readFileSync(exePath)
const sha256 = createHash('sha256').update(installer).digest('hex')
const size = statSync(exePath).size

let releaseDate = new Date().toISOString()
if (existsSync(latestYmlPath)) {
  const latest = readFileSync(latestYmlPath, 'utf8')
  const m = latest.match(/^releaseDate:\s*['"]?(.+?)['"]?\s*$/m)
  if (m?.[1]) releaseDate = m[1]
}

const releaseNotes = process.env.RELEASE_NOTES || ''
const artifactUrl = `https://github.com/recalchi/gamehub/releases/download/v${version}/${exeName}`
const releaseUrl = `https://github.com/recalchi/gamehub/releases/tag/v${version}`

const manifest = {
  version,
  releaseDate,
  channel,
  artifactUrl,
  installerArtifact: exeName,
  sha256,
  size,
  portableArtifact: existsSync(portablePath) ? portableName : undefined,
  releaseNotes,
  minSupportedVersion,
  releaseUrl
}

writeFileSync(join(releaseDir, 'releases.json'), JSON.stringify(manifest, null, 2), 'utf8')
writeFileSync(join(releaseDir, `${exeName}.sha256`), `${sha256}  ${exeName}\n`, 'utf8')
if (existsSync(portablePath)) {
  const portableBuffer = readFileSync(portablePath)
  const portableSha256 = createHash('sha256').update(portableBuffer).digest('hex')
  writeFileSync(join(releaseDir, `${portableName}.sha256`), `${portableSha256}  ${portableName}\n`, 'utf8')
}
console.log(`Manifest generated: release/releases.json (${version})`)

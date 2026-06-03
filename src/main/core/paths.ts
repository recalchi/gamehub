import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'

/**
 * Resolve and create the userdata folders.
 *
 * In production these live under %APPDATA%/gamehub. In dev electron-vite still
 * points `app.getPath('userData')` to a per-app folder, so we don't pollute
 * the project tree.
 */
function ensure(dir: string): string {
  mkdirSync(dir, { recursive: true })
  return dir
}

if (process.argv.includes('--smoke-media-playback')) {
  app.setPath('userData', ensure(join(tmpdir(), 'gamehub-media-playback-smoke')))
}

const userData = app.getPath('userData')

export const PATHS = {
  userData,
  data: ensure(join(userData, 'data')),
  logs: ensure(join(userData, 'logs')),
  covers: ensure(join(userData, 'covers')),
  banners: ensure(join(userData, 'banners')),
  mediaDownloads: ensure(join(userData, 'media-downloads')),
  saves: ensure(join(userData, 'saves')),
  mods: ensure(join(userData, 'mods')),
  cache: ensure(join(userData, 'cache')),
  settingsFile: join(userData, 'settings.json'),
  libraryFile: join(userData, 'library.json'),
  gameJourneyFile: join(userData, 'game-journey.json'),
  mediaLibraryFile: join(userData, 'media-library.json'),
  mediaWatchedFile: join(userData, 'media-watched.json'),
  modInstallsFile: join(userData, 'mod-installs.json')
}

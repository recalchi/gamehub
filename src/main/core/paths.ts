import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

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

const userData = app.getPath('userData')

export const PATHS = {
  userData,
  data: ensure(join(userData, 'data')),
  logs: ensure(join(userData, 'logs')),
  covers: ensure(join(userData, 'covers')),
  banners: ensure(join(userData, 'banners')),
  saves: ensure(join(userData, 'saves')),
  cache: ensure(join(userData, 'cache')),
  settingsFile: join(userData, 'settings.json'),
  libraryFile: join(userData, 'library.json')
}

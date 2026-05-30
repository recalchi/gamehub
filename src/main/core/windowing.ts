import { BrowserWindow, screen } from 'electron'
import type { DisplayInfo, DisplayTarget } from '@shared/types'

export function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    index,
    label: `${index + 1}${display.id === primaryId ? ' - principal' : ''}`,
    isPrimary: display.id === primaryId,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor
  }))
}

export function moveMainWindowToDisplay(target: DisplayTarget): boolean {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) return false
  const display = resolveDisplay(target, win)
  if (!display) return false
  if (win.isFullScreen()) win.setFullScreen(false)
  const [width, height] = win.getSize()
  const area = display.workArea
  win.setBounds({
    x: area.x + Math.max(0, Math.round((area.width - width) / 2)),
    y: area.y + Math.max(0, Math.round((area.height - height) / 2)),
    width: Math.min(width, area.width),
    height: Math.min(height, area.height)
  })
  win.show()
  win.focus()
  return true
}

export function boundsForDisplay(target: DisplayTarget): { x: number; y: number } | null {
  if (target === 'current') return null
  const display = resolveDisplay(target)
  if (!display) return null
  return { x: display.workArea.x + 40, y: display.workArea.y + 40 }
}

function resolveDisplay(target: DisplayTarget, win?: BrowserWindow): Electron.Display | null {
  const displays = screen.getAllDisplays()
  if (displays.length === 0) return null
  if (target === 'current') {
    if (!win) return displays[0]
    return screen.getDisplayMatching(win.getBounds())
  }
  if (target === 'primary') return screen.getPrimaryDisplay()
  if (target === 'secondary') return displays.find((d) => d.id !== screen.getPrimaryDisplay().id) ?? displays[0]
  const index = Number(target.replace('display-', '')) - 1
  return displays[index] ?? displays[0]
}

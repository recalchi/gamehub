const path = require('node:path')
const { existsSync } = require('node:fs')
const { rcedit } = require('rcedit')

/**
 * electron-builder afterPack hook:
 * force-embed our custom icon into the main Windows executable even when
 * signAndEditExecutable is disabled in builder config.
 */
module.exports = async (context) => {
  const isWindows = context.electronPlatformName === 'win32'
  if (!isWindows) return

  const appOutDir = context.appOutDir
  const productFilename = context.packager?.appInfo?.productFilename || 'GameHub'
  const exePath = path.join(appOutDir, `${productFilename}.exe`)
  const iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico')

  if (!existsSync(exePath)) {
    console.warn(`[afterPackIcon] executable not found: ${exePath}`)
    return
  }
  if (!existsSync(iconPath)) {
    console.warn(`[afterPackIcon] icon not found: ${iconPath}`)
    return
  }

  await rcedit(exePath, {
    icon: iconPath
  })
  console.log(`[afterPackIcon] icon embedded into ${exePath}`)
}

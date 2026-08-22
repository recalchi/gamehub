export interface SplashBootPlan {
  statusLabel: string
  progress: number
  navigationReason: string
}

/**
 * The splash must never start a full filesystem scan. Large game drives and
 * emulator folders can stall Electron's main process during boot, so startup
 * should mount the cached library first and leave rescans to explicit actions.
 */
export function planSplashBoot(cachedGameCount: number): SplashBootPlan {
  if (cachedGameCount > 0) {
    return {
      statusLabel: 'Biblioteca local pronta',
      progress: 100,
      navigationReason: 'cached-library'
    }
  }

  return {
    statusLabel: 'Pronto para configurar biblioteca',
    progress: 100,
    navigationReason: 'empty-library'
  }
}

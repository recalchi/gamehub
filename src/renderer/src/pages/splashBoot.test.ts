import { describe, expect, it } from 'vitest'
import { planSplashBoot } from './splashBoot'

describe('planSplashBoot', () => {
  it('opens from cached library without requesting a filesystem scan', () => {
    expect(planSplashBoot(635)).toEqual({
      statusLabel: 'Biblioteca local pronta',
      progress: 100,
      navigationReason: 'cached-library'
    })
  })

  it('keeps first-run boot responsive and lets the user configure the library', () => {
    expect(planSplashBoot(0)).toEqual({
      statusLabel: 'Pronto para configurar biblioteca',
      progress: 100,
      navigationReason: 'empty-library'
    })
  })
})

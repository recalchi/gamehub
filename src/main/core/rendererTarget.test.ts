import { describe, expect, it } from 'vitest'
import { DEFAULT_DEV_RENDERER_URL, resolveRendererTarget } from './rendererTarget'

describe('resolveRendererTarget', () => {
  it('uses the electron-vite renderer URL when it is provided', () => {
    expect(resolveRendererTarget({ ELECTRON_RENDERER_URL: 'http://localhost:5174/' })).toEqual({
      type: 'url',
      value: 'http://localhost:5174/'
    })
  })

  it('falls back to the default dev renderer URL in electron-vite development', () => {
    expect(resolveRendererTarget({ NODE_ENV_ELECTRON_VITE: 'development' })).toEqual({
      type: 'url',
      value: DEFAULT_DEV_RENDERER_URL
    })
  })

  it('allows a local dev renderer override', () => {
    expect(
      resolveRendererTarget({
        NODE_ENV_ELECTRON_VITE: 'development',
        GAMEHUB_DEV_RENDERER_URL: 'http://localhost:5180/'
      })
    ).toEqual({
      type: 'url',
      value: 'http://localhost:5180/'
    })
  })

  it('uses the packaged renderer outside development', () => {
    expect(resolveRendererTarget({})).toEqual({ type: 'file' })
  })
})

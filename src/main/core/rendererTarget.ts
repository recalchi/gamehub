export type RendererTarget =
  | { type: 'url'; value: string }
  | { type: 'file' }

export const DEFAULT_DEV_RENDERER_URL = 'http://localhost:5173/'

function cleanUrl(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function resolveRendererTarget(env: NodeJS.ProcessEnv = process.env): RendererTarget {
  const explicitUrl = cleanUrl(env.ELECTRON_RENDERER_URL)
  if (explicitUrl) return { type: 'url', value: explicitUrl }

  const overrideUrl = cleanUrl(env.GAMEHUB_DEV_RENDERER_URL)
  if (overrideUrl) return { type: 'url', value: overrideUrl }

  if (env.NODE_ENV_ELECTRON_VITE === 'development') {
    return { type: 'url', value: DEFAULT_DEV_RENDERER_URL }
  }

  return { type: 'file' }
}

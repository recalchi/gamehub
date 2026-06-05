/**
 * Streaming provider registry. Each provider is a small module exposing
 * metadata + (optionally) a `fetchTrending` implementation. UI calls
 * `listProviders()` and `fetchTrending(id)` through IPC.
 *
 * Adding a new provider: write a file under this folder exporting a
 * `StreamingProviderModule`, then push it into the `PROVIDERS` array.
 */
import { primeVideoProvider } from './prime-video'
import type { StreamingTrendingItem } from '@shared/types'

export interface StreamingProviderModule {
  id: string
  name: string
  /** Web link that opens the provider's home (used for "Abrir" buttons). */
  homeUrl: string
  /** Search deep-link with `{query}` placeholder. */
  searchUrl: string
  /** Returns a small "em alta" list. May throw — caller handles errors. */
  fetchTrending(): Promise<StreamingTrendingItem[]>
}

export const PROVIDERS: StreamingProviderModule[] = [primeVideoProvider]

export function findProvider(id: string): StreamingProviderModule | null {
  return PROVIDERS.find((p) => p.id === id) ?? null
}

export async function fetchProviderTrending(id: string): Promise<StreamingTrendingItem[]> {
  const provider = findProvider(id)
  if (!provider) return []
  try {
    return await provider.fetchTrending()
  } catch {
    // Trending is best-effort. Don't break UI on transient network errors.
    return []
  }
}

import type { StreamingTrendingItem } from '@shared/types'
import type { StreamingProviderModule } from './index'

/**
 * Prime Video provider. The full "logged-in trending" flow requires either
 * a BrowserView partition with the user's Amazon cookies (scrape) or an
 * unofficial mobile API — both out of scope for the MVP. For now we surface
 * a curated set of high-profile titles so the UI doesn't feel dead, and we
 * keep the door open for the real fetch path.
 *
 * Replace `fetchTrending` once the BrowserView-based scrape is wired up;
 * the UI contract (StreamingTrendingItem[]) doesn't change.
 */
export const primeVideoProvider: StreamingProviderModule = {
  id: 'prime-video',
  name: 'Prime Video',
  homeUrl: 'https://www.primevideo.com/',
  searchUrl: 'https://www.primevideo.com/search/ref=atv_nb_sr?phrase={query}',
  async fetchTrending(): Promise<StreamingTrendingItem[]> {
    // Stable placeholder set. Swap with live scrape later.
    return STATIC_TRENDING
  }
}

const STATIC_TRENDING: StreamingTrendingItem[] = [
  {
    id: 'prime:fallout',
    providerId: 'prime-video',
    title: 'Fallout',
    url: 'https://www.primevideo.com/detail/Fallout/',
    description: 'Série live-action baseada no universo dos jogos.',
    year: 2024
  },
  {
    id: 'prime:the-boys',
    providerId: 'prime-video',
    title: 'The Boys',
    url: 'https://www.primevideo.com/detail/The-Boys/',
    description: 'Super-heróis corruptos no mundo real.',
    year: 2019
  },
  {
    id: 'prime:reacher',
    providerId: 'prime-video',
    title: 'Reacher',
    url: 'https://www.primevideo.com/detail/Reacher/',
    description: 'Investigador militar viaja por cidades pequenas.',
    year: 2022
  },
  {
    id: 'prime:rings-of-power',
    providerId: 'prime-video',
    title: 'The Lord of the Rings: The Rings of Power',
    url: 'https://www.primevideo.com/detail/0H7B1MQ3F2NFNVRX5N7AOZP9PT/',
    description: 'Prequel da Terra-média.',
    year: 2022
  }
]

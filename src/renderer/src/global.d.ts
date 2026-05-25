import type { GameHubApi } from '../../preload/index'

declare global {
  interface Window {
    api: GameHubApi
  }
}

export {}

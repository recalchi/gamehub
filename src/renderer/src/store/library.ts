import { create } from 'zustand'
import type {
  AppSettings,
  DetectedEmulator,
  Game,
  ScanProgress,
  ScanResult
} from '@shared/types'

interface LibraryState {
  initialized: boolean
  games: Game[]
  emulators: DetectedEmulator[]
  settings: AppSettings | null
  progress: ScanProgress
  lastScan?: ScanResult
  init: () => Promise<void>
  scan: (opts?: { fresh?: boolean }) => Promise<ScanResult>
  toggleFavorite: (id: string) => Promise<void>
  launch: (id: string) => Promise<{ ok: boolean; error?: string }>
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>
}

const emptyProgress: ScanProgress = { phase: 'idle', scanned: 0, found: 0 }

export const useLibraryStore = create<LibraryState>((set, get) => ({
  initialized: false,
  games: [],
  emulators: [],
  settings: null,
  progress: emptyProgress,

  async init() {
    if (get().initialized) return
    const [data, settings] = await Promise.all([
      window.api.library.list(),
      window.api.settings.get()
    ])
    window.api.library.onProgress((p) => set({ progress: p }))
    // Cover service streams individual updates as art lands — merge them into
    // the in-memory list without re-fetching the whole library.
    window.api.library.onCoverUpdated(({ gameId, cover, banner }) => {
      set({
        games: get().games.map((g) =>
          g.id === gameId ? { ...g, cover: cover ?? g.cover, banner: banner ?? g.banner } : g
        )
      })
    })
    set({
      games: data.games,
      emulators: data.emulators,
      settings,
      initialized: true
    })
  },

  async scan(opts) {
    set({ progress: { phase: 'enumerating', scanned: 0, found: 0 } })
    const result = await window.api.library.scan(opts)
    set({
      games: result.games,
      emulators: result.emulators,
      lastScan: result,
      progress: { phase: 'done', scanned: result.games.length, found: result.games.length }
    })
    // Fire-and-forget cover enrichment — updates stream back via onCoverUpdated.
    void window.api.library.enrich().catch(() => {
      /* network may be offline; silent fail is fine */
    })
    return result
  },

  async toggleFavorite(id) {
    const updated = await window.api.library.toggleFavorite(id)
    if (!updated) return
    set({ games: get().games.map((g) => (g.id === id ? updated : g)) })
  },

  async launch(id) {
    const result = await window.api.launch.game(id)
    return { ok: result.ok, error: result.error }
  },

  async saveSettings(patch) {
    const next = await window.api.settings.update(patch)
    set({ settings: next })
  }
}))

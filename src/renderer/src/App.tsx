import { useEffect } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Splash from './pages/Splash'
import Home from './pages/Home'
import Library from './pages/Library'
import GameDetail from './pages/GameDetail'
import Settings from './pages/Settings'
import SearchPage from './pages/Search'
import Controllers from './pages/Controllers'
import Emulators from './pages/Emulators'
import BigPicture from './pages/BigPicture'
import Catalog from './pages/Catalog'
import Stats from './pages/Stats'
import ShortcutsOverlay from './components/ShortcutsOverlay'
import LaunchFailureToast from './components/LaunchFailureToast'
import OnboardingTour from './components/OnboardingTour'
import { useLibraryStore } from './store/library'
import { useGamepad } from './hooks/useGamepad'
import Sidebar from './components/Sidebar'

export default function App(): JSX.Element {
  const navigate = useNavigate()
  const init = useLibraryStore((s) => s.init)
  const initialized = useLibraryStore((s) => s.initialized)

  useEffect(() => {
    init()
  }, [init])

  // Apply the user's accent color as a CSS variable so every `text-accent` /
  // `bg-accent` class re-themes automatically. We also derive a slightly
  // brighter "glow" companion for shadows/highlights.
  const accentColor = useLibraryStore((s) => s.settings?.accentColor)
  useEffect(() => {
    if (!accentColor) return
    const rgb = hexToRgbSpaceSeparated(accentColor)
    if (!rgb) return
    document.documentElement.style.setProperty('--accent', rgb)
    // Glow = same hue, shifted a bit toward cyan for the existing aesthetic
    document.documentElement.style.setProperty('--accent-glow', rgb)
  }, [accentColor])

  // Global gamepad shortcuts (Back/Select/Start)
  useGamepad({
    onBack: () => window.history.back(),
    onMenu: () => navigate('/settings')
  })

  // F11 toggles fullscreen via main process
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault()
        window.api.system.toggleFullscreen()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-ink-950 text-slate-100">
      <Routes>
        <Route path="/" element={<Splash />} />
        {/* Big Picture is its own root route — no sidebar, no chrome */}
        <Route path="/tv" element={<BigPicture />} />
        <Route
          path="/*"
          element={
            <div className="flex h-full">
              <Sidebar />
              <main className="flex-1 overflow-y-auto relative noise">
                <AnimatePresence mode="wait">
                  <Routes>
                    <Route path="home" element={<Home />} />
                    <Route path="library" element={<Library />} />
                    <Route path="library/:platform" element={<Library />} />
                    <Route path="game/:id" element={<GameDetail />} />
                    <Route path="search" element={<SearchPage />} />
                    <Route path="controllers" element={<Controllers />} />
                    <Route path="emulators" element={<Emulators />} />
                    <Route path="catalog" element={<Catalog />} />
                    <Route path="stats" element={<Stats />} />
                    <Route path="settings" element={<Settings />} />
                  </Routes>
                </AnimatePresence>
              </main>
            </div>
          }
        />
      </Routes>
      {!initialized && null}
      <ShortcutsOverlay />
      <LaunchFailureToast />
      <OnboardingTour />
    </div>
  )
}

/** "#5eead4" → "94 234 212". Tailwind's `rgb(var(--x) / <alpha>)` recipe wants
 *  the value in this space-separated form so opacity utilities still work. */
function hexToRgbSpaceSeparated(hex: string): string | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

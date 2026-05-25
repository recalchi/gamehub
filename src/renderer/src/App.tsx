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
import ShortcutsOverlay from './components/ShortcutsOverlay'
import LaunchFailureToast from './components/LaunchFailureToast'
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
    </div>
  )
}

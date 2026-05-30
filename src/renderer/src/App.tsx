import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { applyReducedMotionIfRequested, setReducedMotionMode } from './motion/tokens'
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
import Achievements from './pages/Achievements'
import Cinema from './pages/Cinema'
import ShortcutsOverlay from './components/ShortcutsOverlay'
import LaunchFailureToast from './components/LaunchFailureToast'
import LaunchFallbackToast from './components/LaunchFallbackToast'
import ControllerConnectionToast from './components/ControllerConnectionToast'
import OnboardingTour from './components/OnboardingTour'
import DropZone from './components/DropZone'
import CommandPalette from './components/CommandPalette'
import UiSoundProvider from './components/UiSoundProvider'
import WindowDragSurface from './components/WindowDragSurface'
import { useLibraryStore } from './store/library'
import { useSpatialGamepadNavigation } from './hooks/useSpatialGamepadNavigation'
import Sidebar from './components/Sidebar'

export default function App(): JSX.Element {
  const initialized = useLibraryStore((s) => s.initialized)

  // Splash drives the boot — calling init() here too duplicated the
  // library.list IPC roundtrip and raced the splash's progress sync,
  // which is the bulk of the "slow boot" the user noticed.

  // Honor prefers-reduced-motion before any motion.div renders.
  useEffect(() => {
    applyReducedMotionIfRequested()
  }, [])

  const reducedMode = useLibraryStore((s) => s.settings?.appearance.reducedMotionMode ?? 'system')

  // Flip the motion-token transitions whenever the user changes their preference.
  // 'system' = follow OS prefers-reduced-motion; 'always'/'never' = manual override.
  useEffect(() => {
    setReducedMotionMode(reducedMode)
  }, [reducedMode])

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

  // Global controller navigation: D-pad/stick moves focus, A confirms,
  // B backs out, Start opens settings, shoulders scroll shelves.
  useSpatialGamepadNavigation()

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
    // MotionConfig reducedMotion="user" makes EVERY motion.* element honor the
    // OS prefers-reduced-motion setting automatically — including infinite
    // background pulses, hover effects, and shared-element springs. Combined
    // with applyReducedMotionIfRequested above (which flattens our custom
    // token transitions), every animation source respects the preference.
    <MotionConfig reducedMotion={reducedMode === 'always' ? 'always' : reducedMode === 'never' ? 'never' : 'user'}>
      <div className="relative h-screen w-screen overflow-hidden bg-ink-950 text-slate-100">
        <WindowDragSurface />
        <Routes>
          <Route path="/" element={<Splash />} />
          {/* Big Picture is its own root route — no sidebar, no chrome */}
          <Route path="/tv" element={<BigPicture />} />
          <Route path="/*" element={<Shell />} />
        </Routes>
        {!initialized && null}
        <ShortcutsOverlay />
        <LaunchFailureToast />
        <LaunchFallbackToast />
        <ControllerConnectionToast />
        <OnboardingTour />
        <DropZone />
        <CommandPalette />
        <UiSoundProvider />
      </div>
    </MotionConfig>
  )
}

/**
 * Authenticated shell — sidebar + animated route content.
 *
 * AnimatePresence wraps the nested <Routes> with `key={location.pathname}` on
 * the inner element. Without that key Framer Motion's diff doesn't see route
 * changes and never plays exit/enter — which is why pages used to swap with
 * zero transition. `mode="wait"` keeps the exiting page in DOM until its exit
 * animation finishes, so the new page only starts entering on a clean canvas.
 */
function Shell(): JSX.Element {
  const location = useLocation()

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative noise">
        {/* No AnimatePresence wrap — every attempt to bridge it through
            react-router's <Routes> failed (popLayout broken w/ non-motion
            child; mode=wait left blank pages after navigation). Pages still
            do their own internal mount animations through RouteTransition,
            which is a pass-through wrapper here. */}
        <Routes location={location}>
          <Route path="home" element={<Home />} />
          <Route path="library" element={<Library />} />
          <Route path="library/:platform" element={<Library />} />
          <Route path="game/:id" element={<GameDetail />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="controllers" element={<Controllers />} />
          <Route path="emulators" element={<Emulators />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="cinema" element={<Cinema />} />
          <Route path="achievements" element={<Achievements />} />
          <Route path="stats" element={<Stats />} />
          <Route path="settings" element={<Settings />} />
        </Routes>
      </main>
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

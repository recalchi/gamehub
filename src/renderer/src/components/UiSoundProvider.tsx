import { useEffect, useRef } from 'react'
import { useLibraryStore } from '../store/library'
import type { UiSoundSettings } from '@shared/types'
import { getOrCreateContext, playUiSound } from '../audio/engine'
import { rumble } from '../audio/haptics'

type UiSoundKind = 'navigation' | 'confirm' | 'back' | 'toggle' | 'launch'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

const DEFAULT_SOUNDS: UiSoundSettings = {
  enabled: true,
  volume: 0.42,
  navigation: true,
  confirm: true,
  back: true,
  toggle: true,
  launch: true
}

/**
 * Global UI sound layer.
 *
 * Generates every sound procedurally via the audio engine — no .ogg assets,
 * no decode latency, no clipping when sounds stack. The engine's reverb +
 * soft-clip bus give the kit a coherent "feel" so nav/confirm/back share
 * the same room.
 *
 * Autoplay: AudioContext is created lazily inside the first user gesture
 * (any pointerdown/keydown/touch), so it never throws a "user gesture
 * required" warning. After that it stays armed for the session.
 */
export default function UiSoundProvider(): null {
  const configuredSounds = useLibraryStore((s) => s.settings?.sounds)
  const settingsRef = useRef<UiSoundSettings>(DEFAULT_SOUNDS)
  const audioRef = useRef<AudioContext | null>(null)
  const lastHoveredRef = useRef<HTMLElement | null>(null)
  const lastPlayedAtRef = useRef<Record<UiSoundKind, number>>({
    navigation: 0,
    confirm: 0,
    back: 0,
    toggle: 0,
    launch: 0
  })

  useEffect(() => {
    settingsRef.current = { ...DEFAULT_SOUNDS, ...(configuredSounds ?? {}) }
  }, [configuredSounds])

  useEffect(() => {
    // Lazy-arm the AudioContext on first gesture — otherwise Chrome
    // suspends it until the user clicks something.
    async function armOnGesture(): Promise<void> {
      if (audioRef.current) return
      await getOrCreateContext(audioRef)
    }
    window.addEventListener('pointerdown', armOnGesture, { once: true })
    window.addEventListener('keydown', armOnGesture, { once: true })
    window.addEventListener('touchstart', armOnGesture, { once: true })

    function play(kind: UiSoundKind): void {
      const settings = settingsRef.current
      if (!settings.enabled || !settings[kind]) return

      const now = performance.now()
      // Stricter rate-limit on nav since hover events fire constantly when
      // a grid scrolls under the cursor.
      const minGap = kind === 'navigation' ? 70 : 45
      if (now - lastPlayedAtRef.current[kind] < minGap) return
      lastPlayedAtRef.current[kind] = now

      const ctx = audioRef.current
      if (!ctx || ctx.state !== 'running') {
        // Context not armed yet — silently skip; the next gesture will arm it.
        return
      }
      playUiSound(ctx, kind, { gain: clamp(settings.volume / 0.42, 0, 2) })
    }

    function fromTarget(target: EventTarget | null): HTMLElement | null {
      return target instanceof HTMLElement ? target : null
    }

    function closestInteractive(target: EventTarget | null): HTMLElement | null {
      return fromTarget(target)?.closest<HTMLElement>(FOCUSABLE_SELECTOR) ?? null
    }

    function handlePointerOver(event: PointerEvent): void {
      const el = closestInteractive(event.target)
      if (!el || el.dataset.uiSound === 'none') return
      if (lastHoveredRef.current === el) return
      lastHoveredRef.current = el
      play('navigation')
    }

    function handleFocusIn(event: FocusEvent): void {
      const el = closestInteractive(event.target)
      if (!el || el.dataset.uiSound === 'none') return
      play('navigation')
    }

    function handleClick(event: MouseEvent): void {
      const el = closestInteractive(event.target)
      if (!el || el.dataset.uiSound === 'none') return
      if (el.dataset.uiSound === 'toggle') {
        play('toggle')
        return
      }
      if (el.dataset.uiSound === 'back') {
        play('back')
        return
      }
      play('confirm')
    }

    function handleChange(event: Event): void {
      const el = fromTarget(event.target)
      if (!el || el.dataset.uiSound === 'none') return
      if (el.matches('input, select, textarea')) play('toggle')
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' || event.key === 'Backspace') play('back')
    }

    function handleCustomSound(event: Event): void {
      const detail = (event as CustomEvent<{ kind?: UiSoundKind }>).detail
      if (detail?.kind) play(detail.kind)
    }

    const launchCleanup = window.api.launch.onStarted(() => {
      play('launch')
      rumble('launch')
    })
    const failCleanup = window.api.launch.onFailed(() => {
      rumble('fail')
    })

    document.addEventListener('pointerover', handlePointerOver, true)
    document.addEventListener('focusin', handleFocusIn, true)
    document.addEventListener('click', handleClick, true)
    document.addEventListener('change', handleChange, true)
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('gamehub:ui-sound', handleCustomSound)

    return () => {
      launchCleanup()
      failCleanup()
      window.removeEventListener('pointerdown', armOnGesture)
      window.removeEventListener('keydown', armOnGesture)
      window.removeEventListener('touchstart', armOnGesture)
      document.removeEventListener('pointerover', handlePointerOver, true)
      document.removeEventListener('focusin', handleFocusIn, true)
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('change', handleChange, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('gamehub:ui-sound', handleCustomSound)
    }
  }, [])

  return null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

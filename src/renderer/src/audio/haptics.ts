/**
 * Gamepad haptic feedback.
 *
 * Uses the Gamepad API's `vibrationActuator.playEffect()` — supported by
 * Xbox/PS5 controllers on Chrome/Edge/Electron. Falls back to silent no-op
 * on browsers/devices without it (most keyboards-only setups).
 *
 * We never throw. If no pad is connected or the API isn't there, we just
 * skip. That keeps callers from having to check anything before triggering
 * a "launch" or "fail" rumble.
 */

export type RumblePreset = 'tap' | 'confirm' | 'launch' | 'fail'

interface RumbleSpec {
  duration: number
  startDelay: number
  strongMagnitude: number
  weakMagnitude: number
}

const PRESETS: Record<RumblePreset, RumbleSpec> = {
  // Micro tap — focused card / hover. ~20ms, mostly weak motor (the high-
  // freq one) so it feels like a tick rather than a punch.
  tap: { duration: 25, startDelay: 0, strongMagnitude: 0.0, weakMagnitude: 0.3 },
  // Two short pulses — selection confirmed.
  confirm: { duration: 60, startDelay: 0, strongMagnitude: 0.1, weakMagnitude: 0.55 },
  // Heavy thump — game launched. Strong motor leads, weak adds texture.
  launch: { duration: 220, startDelay: 0, strongMagnitude: 0.85, weakMagnitude: 0.55 },
  // Buzz — emulator crashed / launch failed. Long + harsh.
  fail: { duration: 320, startDelay: 0, strongMagnitude: 1.0, weakMagnitude: 0.95 }
}

function activeGamepads(): Gamepad[] {
  if (typeof navigator === 'undefined' || !('getGamepads' in navigator)) return []
  const pads = navigator.getGamepads()
  return pads.filter((p): p is Gamepad => p !== null && p.connected)
}

export function rumble(preset: RumblePreset): void {
  const spec = PRESETS[preset]
  for (const pad of activeGamepads()) {
    // `vibrationActuator` is not in older typings; cast to any to access.
    const actuator = (pad as Gamepad & { vibrationActuator?: GamepadHapticActuator })
      .vibrationActuator
    if (!actuator || typeof actuator.playEffect !== 'function') continue
    try {
      void actuator.playEffect('dual-rumble', spec)
    } catch {
      /* device unsupported / throttled — ignore */
    }
  }
}

/** Stop any in-progress rumble on every connected pad. */
export function rumbleReset(): void {
  for (const pad of activeGamepads()) {
    const actuator = (pad as Gamepad & { vibrationActuator?: GamepadHapticActuator })
      .vibrationActuator
    if (!actuator) continue
    try {
      void actuator.reset?.()
    } catch {
      /* ignore */
    }
  }
}

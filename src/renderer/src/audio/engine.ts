/**
 * Premium procedural audio engine for GameHub.
 *
 * Why procedural and not samples: zero asset weight, perfectly synced with
 * UI events (no decode latency), and we control every parameter — so a chime
 * can match the accent color, the splash boot can scale to any wall-clock
 * timing without re-rendering OGGs, etc.
 *
 * Premium-feel design pillars:
 *   1. Layered voices (sub, body, air) instead of single oscillators.
 *   2. ADSR envelope (not just attack-decay) for natural release tails.
 *   3. Convolver reverb with a generated impulse response — adds the room
 *      that turns a beep into a chime.
 *   4. Soft-clip waveshaper on the master bus so peaks compress musically
 *      instead of clipping digitally.
 *   5. Stereo width via StereoPannerNode + tiny detune between L/R layers.
 *
 * All voices schedule against `ctx.currentTime` so multiple chimes can be
 * cued ahead — the AudioContext clock is the single source of truth.
 */

export interface ChimeOptions {
  /** When to start, in AudioContext seconds. Default = ctx.currentTime. */
  startAt?: number
  /** Master gain multiplier, 0..1. Default 0.5. */
  gain?: number
  /** Stereo width, 0 = mono, 1 = full split. Default 0.4. */
  width?: number
  /** Send level to the reverb bus, 0..1. Default 0.32. */
  reverbSend?: number
}

interface EngineRefs {
  ctx: AudioContext
  masterIn: GainNode
  reverbSend: GainNode
}

const cache = new WeakMap<AudioContext, EngineRefs>()

/**
 * Build (or fetch) the engine routing for a given AudioContext.
 *
 * Routing:
 *   voice → voiceGain → [dry → soft-clip → output]
 *                    ↘  [send → convolver(reverb) → soft-clip → output]
 *
 * One soft-clip stage at the very end keeps overlapping chimes from
 * digitally clipping when they pile up (e.g. boot tail + first nav sound).
 */
function ensureEngine(ctx: AudioContext): EngineRefs {
  const cached = cache.get(ctx)
  if (cached) return cached

  const masterIn = ctx.createGain()
  masterIn.gain.value = 1

  // Reverb bus — convolver with a small hall IR generated on the fly.
  const reverbSend = ctx.createGain()
  reverbSend.gain.value = 1
  const reverb = ctx.createConvolver()
  reverb.buffer = generateImpulseResponse(ctx, 1.4, 2.3)
  const reverbReturn = ctx.createGain()
  reverbReturn.gain.value = 0.55
  reverbSend.connect(reverb)
  reverb.connect(reverbReturn)

  // Soft-clip at the output so summed voices behave when they peak.
  const shaper = ctx.createWaveShaper()
  shaper.curve = generateSoftClipCurve(1.4)
  shaper.oversample = '2x'

  masterIn.connect(shaper)
  reverbReturn.connect(shaper)
  shaper.connect(ctx.destination)

  const refs: EngineRefs = { ctx, masterIn, reverbSend }
  cache.set(ctx, refs)
  return refs
}

/** Generate a decaying-noise impulse response — cheap small hall. */
function generateImpulseResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate
  const length = Math.floor(rate * seconds)
  const buffer = ctx.createBuffer(2, length, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      // Slight L/R decorrelation gives a wider stereo image than mono noise.
      const seed = ch === 0 ? Math.random() * 2 - 1 : Math.random() * 2 - 1
      data[i] = seed * Math.pow(1 - i / length, decay)
    }
  }
  return buffer
}

/**
 * Soft-clip curve — `tanh`-style asymmetric saturation. Coefficient `k`
 * controls how aggressive the knee is; 1.4 is a gentle musical squeeze.
 */
function generateSoftClipCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024
  // Explicitly back the typed array with a fresh ArrayBuffer so the type
  // is Float32Array<ArrayBuffer> (what WaveShaperNode.curve expects in TS5)
  // rather than Float32Array<ArrayBufferLike>.
  const curve = new Float32Array(new ArrayBuffer(n * 4))
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(k * x) / Math.tanh(k)
  }
  return curve
}

/**
 * Play a single layered voice — a "note" with three oscillator layers
 * (sub octave sine + body triangle + air sine) routed through an ADSR
 * envelope and stereo + reverb sends.
 *
 * Frequencies in Hz; layers are computed from the fundamental. Returns
 * the absolute end time so callers can chain notes precisely.
 */
export function playLayeredNote(
  ctx: AudioContext,
  opts: {
    freq: number
    startAt: number
    duration: number
    /** Voice level relative to master, 0..1. Default 0.18. */
    gain?: number
    /** Stereo pan, -1..1. Default 0 (centre). */
    pan?: number
    /** Send level to reverb, 0..1. Default uses engine default. */
    reverbSend?: number
    /** ADSR — defaults: attack 0.015, decay 0.18, sustain 0.55, release 0.35 */
    envelope?: { attack?: number; decay?: number; sustain?: number; release?: number }
    /** Override the body waveform. Default 'triangle'. */
    bodyType?: OscillatorType
  }
): number {
  const engine = ensureEngine(ctx)
  const { freq, startAt, duration } = opts
  const gain = opts.gain ?? 0.18
  const pan = opts.pan ?? 0
  const env = {
    attack: opts.envelope?.attack ?? 0.018,
    decay: opts.envelope?.decay ?? 0.2,
    sustain: opts.envelope?.sustain ?? 0.55,
    release: opts.envelope?.release ?? 0.4
  }

  // Voice gain → stereo pan → master (+ reverb send)
  const voice = ctx.createGain()
  voice.gain.value = 0
  const panner = ctx.createStereoPanner()
  panner.pan.value = pan
  voice.connect(panner)
  panner.connect(engine.masterIn)

  if (opts.reverbSend !== 0) {
    const send = ctx.createGain()
    send.gain.value = opts.reverbSend ?? 0.32
    voice.connect(send)
    send.connect(engine.reverbSend)
  }

  // ADSR — sustain is a fraction of attack peak.
  const peak = gain
  const sustainLevel = peak * env.sustain
  const releaseEnd = startAt + duration + env.release
  voice.gain.setValueAtTime(0.0001, startAt)
  voice.gain.exponentialRampToValueAtTime(peak, startAt + env.attack)
  voice.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustainLevel), startAt + env.attack + env.decay)
  voice.gain.setValueAtTime(Math.max(0.0001, sustainLevel), startAt + duration)
  voice.gain.exponentialRampToValueAtTime(0.0001, releaseEnd)

  // Three layers — each contributes to the same voice gain so the envelope
  // shapes them together. Detune body slightly L/R for stereo body width.
  const layers: Array<{ osc: OscillatorNode; gain: GainNode; ratio: number }> = []

  // Sub: 1 octave down, sine, weak.
  const sub = ctx.createOscillator()
  sub.type = 'sine'
  sub.frequency.value = freq * 0.5
  const subGain = ctx.createGain()
  subGain.gain.value = 0.35
  layers.push({ osc: sub, gain: subGain, ratio: 0.5 })

  // Body: fundamental, configurable waveform.
  const body = ctx.createOscillator()
  body.type = opts.bodyType ?? 'triangle'
  body.frequency.value = freq
  const bodyGain = ctx.createGain()
  bodyGain.gain.value = 1
  layers.push({ osc: body, gain: bodyGain, ratio: 1 })

  // Air: 2 octaves up, sine, very weak — adds shimmer.
  const air = ctx.createOscillator()
  air.type = 'sine'
  air.frequency.value = freq * 4
  const airGain = ctx.createGain()
  airGain.gain.value = 0.15
  layers.push({ osc: air, gain: airGain, ratio: 4 })

  // Low-pass filter sweep — opens during attack, closes during decay.
  // Without this every note sounds the same; with it, percussive notes
  // sparkle in and mellow out, which is what makes chimes feel "expensive".
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.7
  filter.frequency.setValueAtTime(freq * 2, startAt)
  filter.frequency.exponentialRampToValueAtTime(freq * 8, startAt + env.attack)
  filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 800), startAt + env.attack + env.decay)

  for (const layer of layers) {
    layer.osc.connect(layer.gain)
    layer.gain.connect(filter)
    // Slight detune on the body layer to fatten the sound.
    if (layer.ratio === 1) {
      layer.osc.detune.value = (Math.random() - 0.5) * 8
    }
    layer.osc.start(startAt)
    layer.osc.stop(releaseEnd + 0.05)
  }
  filter.connect(voice)

  return releaseEnd
}

/**
 * Play a short noise burst — used as an attack transient layered under
 * the first note of a chime to give it "presence". Without it, pure tones
 * sound thin even with reverb.
 */
export function playNoiseTransient(
  ctx: AudioContext,
  opts: { startAt: number; duration?: number; gain?: number; color?: 'white' | 'pink' }
): void {
  const engine = ensureEngine(ctx)
  const duration = opts.duration ?? 0.12
  const gain = opts.gain ?? 0.05

  const buffer = ctx.createBuffer(2, Math.floor(ctx.sampleRate * duration), ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    let pinkB0 = 0
    let pinkB1 = 0
    let pinkB2 = 0
    for (let i = 0; i < data.length; i++) {
      let sample = Math.random() * 2 - 1
      if (opts.color === 'pink') {
        // 3-pole Voss-McCartney-ish pink filter — cheap and good enough.
        pinkB0 = 0.99765 * pinkB0 + sample * 0.099046
        pinkB1 = 0.96300 * pinkB1 + sample * 0.2965164
        pinkB2 = 0.57000 * pinkB2 + sample * 1.0526913
        sample = (pinkB0 + pinkB1 + pinkB2 + sample * 0.1848) * 0.35
      }
      data[i] = sample * Math.pow(1 - i / data.length, 3)
    }
  }

  const src = ctx.createBufferSource()
  src.buffer = buffer

  // High-pass to remove low-end rumble that competes with the sub layer.
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 1200
  hp.Q.value = 0.7

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, opts.startAt)
  g.gain.exponentialRampToValueAtTime(gain, opts.startAt + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, opts.startAt + duration)

  src.connect(hp)
  hp.connect(g)
  g.connect(engine.masterIn)

  src.start(opts.startAt)
  src.stop(opts.startAt + duration + 0.02)
}

/**
 * Splash logo chime — three swelling sine pads + a noise transient at the
 * front, all with long release into the reverb. Designed to land in ~1.4s
 * and time perfectly with the boot chime fired right after.
 */
export function playSplashLogo(ctx: AudioContext, opts: ChimeOptions = {}): number {
  const startAt = opts.startAt ?? ctx.currentTime
  const width = opts.width ?? 0.35
  const reverbSend = opts.reverbSend ?? 0.42

  // Sub swell — long fundamental that anchors the whole sequence.
  playLayeredNote(ctx, {
    freq: 110,
    startAt,
    duration: 1.0,
    gain: 0.22 * (opts.gain ?? 1),
    bodyType: 'sine',
    envelope: { attack: 0.18, decay: 0.4, sustain: 0.6, release: 0.7 },
    reverbSend
  })

  // Front transient — gives the attack physical presence.
  playNoiseTransient(ctx, { startAt, duration: 0.18, gain: 0.045, color: 'pink' })

  // Arpeggio: D minor 7 voicing — D F A C, ascending across 600ms.
  const notes = [293.66, 349.23, 440.0, 587.33]
  let lastEnd = 0
  notes.forEach((freq, i) => {
    const noteStart = startAt + 0.28 + i * 0.1
    const end = playLayeredNote(ctx, {
      freq,
      startAt: noteStart,
      duration: 0.34,
      gain: 0.13 * (opts.gain ?? 1),
      pan: ((i - 1.5) / 1.5) * width,
      envelope: { attack: 0.012, decay: 0.18, sustain: 0.4, release: 0.55 },
      reverbSend
    })
    lastEnd = Math.max(lastEnd, end)
  })
  return Math.max(lastEnd, startAt + 1.5)
}

/**
 * Splash boot chime — 5-note ascending fifth-stacked melody that lands
 * after the logo. Tighter envelopes than the logo so it feels like the
 * system "snapping on" after the brand intro.
 */
export function playSplashBoot(ctx: AudioContext, opts: ChimeOptions = {}): number {
  const startAt = opts.startAt ?? ctx.currentTime
  const width = opts.width ?? 0.5
  const reverbSend = opts.reverbSend ?? 0.28

  // Power-up sub — short low thump.
  playLayeredNote(ctx, {
    freq: 73.42,
    startAt,
    duration: 0.4,
    gain: 0.16 * (opts.gain ?? 1),
    bodyType: 'sine',
    envelope: { attack: 0.05, decay: 0.25, sustain: 0.3, release: 0.5 },
    reverbSend: 0.18
  })

  // Attack noise — air movement, like a fan kicking on.
  playNoiseTransient(ctx, { startAt, duration: 0.22, gain: 0.038, color: 'white' })

  // The melody — a pentatonic-ish run with widening stereo.
  const notes = [220.0, 293.66, 440.0, 587.33, 880.0]
  let lastEnd = 0
  notes.forEach((freq, i) => {
    const noteStart = startAt + 0.05 + i * 0.075
    const end = playLayeredNote(ctx, {
      freq,
      startAt: noteStart,
      duration: 0.18,
      gain: 0.11 * (opts.gain ?? 1),
      pan: ((i / (notes.length - 1)) - 0.5) * 2 * width,
      envelope: { attack: 0.006, decay: 0.12, sustain: 0.35, release: 0.4 },
      bodyType: i < 2 ? 'triangle' : 'sine',
      reverbSend
    })
    lastEnd = Math.max(lastEnd, end)
  })
  return Math.max(lastEnd, startAt + 1.0)
}

/**
 * UI sound — pluck-style note for nav/confirm/toggle/back. Very short
 * (~120ms) so it never trails into the next interaction. Each kind has
 * a distinct timbre + pitch so the user learns the language fast.
 */
export function playUiSound(
  ctx: AudioContext,
  kind: 'navigation' | 'confirm' | 'back' | 'toggle' | 'launch',
  opts: { gain?: number } = {}
): void {
  const startAt = ctx.currentTime
  const gain = opts.gain ?? 1
  switch (kind) {
    case 'navigation': {
      // Tiny tick — perfect-fifth interval, very low reverb.
      playLayeredNote(ctx, {
        freq: 880,
        startAt,
        duration: 0.04,
        gain: 0.06 * gain,
        bodyType: 'sine',
        envelope: { attack: 0.003, decay: 0.06, sustain: 0.15, release: 0.08 },
        reverbSend: 0.08
      })
      return
    }
    case 'confirm': {
      // Two-note rising perfect fourth — "yes" feel.
      playLayeredNote(ctx, {
        freq: 587.33,
        startAt,
        duration: 0.06,
        gain: 0.1 * gain,
        bodyType: 'triangle',
        envelope: { attack: 0.004, decay: 0.08, sustain: 0.3, release: 0.12 },
        reverbSend: 0.18
      })
      playLayeredNote(ctx, {
        freq: 783.99,
        startAt: startAt + 0.04,
        duration: 0.08,
        gain: 0.1 * gain,
        bodyType: 'sine',
        envelope: { attack: 0.004, decay: 0.1, sustain: 0.35, release: 0.18 },
        reverbSend: 0.22
      })
      return
    }
    case 'back': {
      // Descending minor third — "leaving" feel.
      playLayeredNote(ctx, {
        freq: 523.25,
        startAt,
        duration: 0.05,
        gain: 0.08 * gain,
        bodyType: 'triangle',
        envelope: { attack: 0.003, decay: 0.07, sustain: 0.25, release: 0.1 },
        reverbSend: 0.14
      })
      playLayeredNote(ctx, {
        freq: 440,
        startAt: startAt + 0.045,
        duration: 0.08,
        gain: 0.08 * gain,
        bodyType: 'sine',
        envelope: { attack: 0.003, decay: 0.09, sustain: 0.25, release: 0.15 },
        reverbSend: 0.18
      })
      return
    }
    case 'toggle': {
      // Two-quick-tick — like a switch flicking.
      playNoiseTransient(ctx, { startAt, duration: 0.03, gain: 0.03 * gain, color: 'white' })
      playLayeredNote(ctx, {
        freq: 1046.5,
        startAt: startAt + 0.012,
        duration: 0.04,
        gain: 0.07 * gain,
        bodyType: 'square',
        envelope: { attack: 0.002, decay: 0.05, sustain: 0.1, release: 0.06 },
        reverbSend: 0.1
      })
      return
    }
    case 'launch': {
      // Spotlight whoosh — short noise sweep + two stacked low notes.
      playNoiseTransient(ctx, { startAt, duration: 0.4, gain: 0.06 * gain, color: 'pink' })
      playLayeredNote(ctx, {
        freq: 146.83,
        startAt,
        duration: 0.6,
        gain: 0.18 * gain,
        bodyType: 'sine',
        envelope: { attack: 0.08, decay: 0.3, sustain: 0.45, release: 0.5 },
        reverbSend: 0.4
      })
      playLayeredNote(ctx, {
        freq: 293.66,
        startAt: startAt + 0.06,
        duration: 0.55,
        gain: 0.14 * gain,
        bodyType: 'triangle',
        envelope: { attack: 0.04, decay: 0.25, sustain: 0.4, release: 0.45 },
        reverbSend: 0.35
      })
      return
    }
  }
}

/** Resume + return a context, lazily creating it. Safe to call repeatedly. */
export async function getOrCreateContext(
  ref: { current: AudioContext | null }
): Promise<AudioContext | null> {
  const AudioContextCtor =
    typeof window !== 'undefined'
      ? window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined
  if (!AudioContextCtor) return null
  if (!ref.current || ref.current.state === 'closed') {
    ref.current = new AudioContextCtor()
  }
  if (ref.current.state === 'suspended') {
    try {
      await ref.current.resume()
    } catch {
      // Autoplay block — caller should retry after a user gesture.
    }
  }
  return ref.current
}

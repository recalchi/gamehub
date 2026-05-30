import { useRef, useState } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { Heart, AlertTriangle, Lock, Play } from 'lucide-react'
import type { Game } from '@shared/types'
import { PLATFORMS } from '@shared/platforms'
import { layoutSpring, M } from '../motion/tokens'
import { rumble } from '../audio/haptics'

interface GameCardProps {
  game: Game
  focused?: boolean
  index?: number
  onClick?: () => void
}

const STATUS_BADGE: Record<string, { label: string; tone: string; icon?: typeof Play }> = {
  ready: { label: 'Pronto', tone: 'bg-emerald-400/20 text-emerald-300' },
  installed: { label: 'Instalado', tone: 'bg-emerald-400/20 text-emerald-300' },
  'not-downloaded': { label: 'Não baixado', tone: 'bg-slate-500/30 text-slate-300' },
  corrupted: { label: 'Suspeito', tone: 'bg-amber-400/20 text-amber-300', icon: AlertTriangle },
  'missing-emulator': { label: 'Sem emulador', tone: 'bg-rose-400/20 text-rose-300', icon: Lock },
  'missing-bios': { label: 'BIOS', tone: 'bg-amber-400/20 text-amber-300' },
  unknown: { label: '???', tone: 'bg-slate-500/30 text-slate-300' }
}

/**
 * GameCard — interactive cover with cinematic hover micro-animations.
 *
 * On hover the card does FIVE things at once, each subtle:
 *   1. Lifts (-6px) + scales (1.03) on a spring — body tells eye "I'm clickable"
 *   2. Cover image zooms inside the frame (1.08) — visual depth, no clip
 *   3. Cursor-tracked 3D tilt (max ±6° on each axis) — parallax sells volume
 *   4. Accent-color glow ring fades in around the border
 *   5. Specular shine sweeps across the cover (light gradient at cursor)
 *
 * All five short-circuit when `prefers-reduced-motion: reduce` is set —
 * the card still highlights via plain border, no transforms.
 */
export default function GameCard({ game, focused, index, onClick }: GameCardProps): JSX.Element {
  const platform = PLATFORMS[game.platform]
  const badge = STATUS_BADGE[game.status] ?? STATUS_BADGE.unknown
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)

  // Mouse-tracked tilt — motion values stay outside React state to avoid
  // re-render storms on every mouse move. Springs smooth the raw values
  // so transitions in/out feel weighted, not jittery.
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)
  const sx = useSpring(mx, { stiffness: 280, damping: 26, mass: 0.4 })
  const sy = useSpring(my, { stiffness: 280, damping: 26, mass: 0.4 })

  // Map 0..1 to ±6deg, with the axes intentionally crossed so the card
  // feels like it's actually being pushed at the cursor.
  const rotX = useTransform(sy, [0, 1], [6, -6])
  const rotY = useTransform(sx, [0, 1], [-6, 6])
  // Shine highlight position follows the cursor in % units.
  const shineX = useTransform(sx, [0, 1], ['0%', '100%'])
  const shineY = useTransform(sy, [0, 1], ['0%', '100%'])

  function handleMouseMove(e: React.MouseEvent<HTMLButtonElement>): void {
    if (reduceMotion) return
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    mx.set((e.clientX - rect.left) / rect.width)
    my.set((e.clientY - rect.top) / rect.height)
  }

  function handleMouseLeave(): void {
    setHovered(false)
    // Return tilt to centre when leaving — without this the next hover
    // starts from the previous corner and looks jerky.
    mx.set(0.5)
    my.set(0.5)
  }

  return (
    <motion.button
      ref={ref}
      data-focused={focused}
      data-index={index}
      onClick={onClick}
      onMouseEnter={() => {
        setHovered(true)
        // Haptic tap on connected pads — no-op on keyboard/mouse only.
        rumble('tap')
      }}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      whileHover={reduceMotion ? undefined : { y: -6, scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22, mass: 0.6 }}
      style={{
        rotateX: reduceMotion ? 0 : rotX,
        rotateY: reduceMotion ? 0 : rotY,
        transformStyle: 'preserve-3d',
        transformPerspective: 800,
        background: `linear-gradient(160deg, ${platform.color}22 0%, rgba(10,12,20,0.8) 60%)`
      }}
      className="focus-card relative shrink-0 w-44 h-64 rounded-xl overflow-hidden border border-white/10 bg-ink-800 group text-left will-change-transform"
    >
      {/* Cover or placeholder — layoutId shared with GameDetail, so clicking
          the card morphs this exact element into the detail's hero cover.
          The inner motion.div zooms on hover for cinematic depth without
          clipping the rounded border. */}
      <motion.div
        layoutId={`game-cover-${game.id}`}
        transition={layoutSpring}
        animate={reduceMotion ? {} : { scale: hovered ? 1.08 : 1 }}
        className="absolute inset-0"
        style={{
          background: game.cover
            ? `url(${game.cover}) center/cover`
            : `linear-gradient(135deg, ${platform.color}cc, ${platform.color}55)`
        }}
      />
      {!game.cover && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center px-3">
            <div className="text-xs font-mono text-white/60 tracking-widest uppercase mb-2">
              {platform.shortName}
            </div>
            <div className="text-white font-display font-semibold leading-tight text-balance">
              {game.title}
            </div>
          </div>
        </div>
      )}

      {/* Specular shine — radial gradient that tracks cursor. Pointer-events
          off so it never intercepts clicks; opacity gated on hover state. */}
      {!reduceMotion && (
        <motion.div
          className="absolute inset-0 pointer-events-none mix-blend-overlay"
          animate={{ opacity: hovered ? 0.55 : 0 }}
          transition={M.micro}
          style={{
            background: useTransform(
              [shineX, shineY] as [typeof shineX, typeof shineY],
              ([x, y]) =>
                `radial-gradient(circle at ${x} ${y}, rgba(255,255,255,0.45) 0%, transparent 38%)`
            )
          }}
        />
      )}

      {/* Accent glow ring — emerges from inside on hover, never overlaps the
          shared cover so the layoutId animation stays clean. */}
      <motion.div
        className="absolute inset-0 rounded-xl pointer-events-none"
        animate={{
          boxShadow: hovered
            ? `0 0 0 1px rgb(var(--accent) / 0.55), 0 18px 38px -10px rgb(var(--accent) / 0.45)`
            : '0 0 0 0px rgb(var(--accent) / 0)'
        }}
        transition={M.micro}
      />

      {/* Top-right: favorite */}
      {game.favorite && (
        <div className="absolute top-2 right-2 text-accent">
          <Heart className="w-4 h-4 fill-current drop-shadow" />
        </div>
      )}

      {/* Bottom: gradient + meta. Lift the gradient a touch on hover so
          the title text breathes more — same trick streaming services use. */}
      <motion.div
        animate={{ y: hovered && !reduceMotion ? -3 : 0 }}
        transition={M.micro}
        className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/95 via-black/60 to-transparent"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${badge.tone}`}>
            {badge.label}
          </span>
          <span className="text-[10px] text-white/60 uppercase tracking-wider">
            {platform.shortName}
          </span>
        </div>
        <motion.div
          layoutId={`game-title-${game.id}`}
          transition={layoutSpring}
          className="text-sm font-semibold leading-tight text-white line-clamp-2"
        >
          {game.title}
        </motion.div>
      </motion.div>

      {/* Hover play button — appears bottom-right when hovered (without
          obscuring the title). Different from `focused` overlay which is
          the keyboard/gamepad spatial-nav indicator. */}
      {!reduceMotion && (
        <motion.div
          className="absolute bottom-3 right-3 pointer-events-none"
          initial={false}
          animate={{
            opacity: hovered ? 1 : 0,
            scale: hovered ? 1 : 0.6,
            y: hovered ? 0 : 8
          }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        >
          <div className="w-9 h-9 rounded-full bg-accent text-ink-950 flex items-center justify-center shadow-[0_0_20px_rgba(94,234,212,0.7)]">
            <Play className="w-4 h-4 fill-current" />
          </div>
        </motion.div>
      )}

      {/* Focus play overlay — keyboard/gamepad spatial-nav, distinct from hover. */}
      {focused && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none"
        >
          <div className="w-12 h-12 rounded-full bg-accent/90 text-ink-950 flex items-center justify-center shadow-[0_0_24px_rgba(94,234,212,0.7)]">
            <Play className="w-5 h-5 fill-current" />
          </div>
        </motion.div>
      )}
    </motion.button>
  )
}

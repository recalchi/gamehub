import { AnimatePresence, motion } from 'framer-motion'
import type { Game, GameBackgroundPreset } from '@shared/types'
import { PLATFORMS } from '@shared/platforms'

const BACKDROP_PRESETS: Record<
  GameBackgroundPreset,
  {
    imageOpacity: number
    blur: number
    scale: number
    saturation: number
    colorWash: string
    colorGlow: string
    leftDark: number
    centerDark: number
    rightDark: number
    verticalMid: number
  }
> = {
  soft: {
    imageOpacity: 0.28,
    blur: 62,
    scale: 1.12,
    saturation: 130,
    colorWash: '42',
    colorGlow: '36',
    leftDark: 0.96,
    centerDark: 0.58,
    rightDark: 0.92,
    verticalMid: 0.9
  },
  cinema: {
    imageOpacity: 0.46,
    blur: 56,
    scale: 1.14,
    saturation: 155,
    colorWash: '66',
    colorGlow: '58',
    leftDark: 0.92,
    centerDark: 0.44,
    rightDark: 0.88,
    verticalMid: 0.82
  },
  vibrant: {
    imageOpacity: 0.64,
    blur: 48,
    scale: 1.16,
    saturation: 185,
    colorWash: '8a',
    colorGlow: '78',
    leftDark: 0.88,
    centerDark: 0.28,
    rightDark: 0.82,
    verticalMid: 0.72
  }
}

export default function GameBackdrop({
  game,
  preset
}: {
  game?: Game
  preset: GameBackgroundPreset
}): JSX.Element {
  const platform = game ? PLATFORMS[game.platform] : undefined
  const color = platform?.color ?? '#5eead4'
  const p = BACKDROP_PRESETS[preset]

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      <AnimatePresence mode="wait">
        <motion.div
          key={game?.id ?? `empty-${preset}`}
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="absolute inset-0"
        >
          {game?.cover && (
            <div
              className="absolute inset-0"
              style={{
                opacity: p.imageOpacity,
                backgroundImage: `url(${game.cover})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: `blur(${p.blur}px) saturate(${p.saturation}%)`,
                transform: `scale(${p.scale})`
              }}
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: [
                `linear-gradient(120deg, ${color}${p.colorWash} 0%, rgba(5,6,10,0.44) 34%, rgba(5,6,10,0.94) 82%)`,
                `radial-gradient(ellipse at 72% 16%, ${color}${p.colorGlow} 0%, transparent 46%)`,
                `linear-gradient(180deg, rgba(5,6,10,0.08) 0%, rgba(5,6,10,${p.verticalMid}) 54%, #05060a 82%)`
              ].join(', ')
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(90deg, rgba(5,6,10,${p.leftDark}), rgba(5,6,10,${p.centerDark}) 44%, rgba(5,6,10,${p.rightDark}))`
            }}
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-gradient-to-r from-ink-950/95 via-ink-950/72 to-transparent" />
          <div className="absolute inset-0 shadow-[inset_0_0_180px_rgba(0,0,0,0.7)]" />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

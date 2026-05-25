import { motion } from 'framer-motion'
import { Heart, AlertTriangle, Lock, Play } from 'lucide-react'
import type { Game } from '@shared/types'
import { PLATFORMS } from '@shared/platforms'

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

export default function GameCard({ game, focused, index, onClick }: GameCardProps): JSX.Element {
  const platform = PLATFORMS[game.platform]
  const badge = STATUS_BADGE[game.status] ?? STATUS_BADGE.unknown

  return (
    <motion.button
      data-focused={focused}
      data-index={index}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className="focus-card relative shrink-0 w-44 h-64 rounded-xl overflow-hidden border border-white/10 bg-ink-800 group text-left"
      style={{
        background: `linear-gradient(160deg, ${platform.color}22 0%, rgba(10,12,20,0.8) 60%)`
      }}
    >
      {/* Cover or placeholder */}
      <div
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

      {/* Top-right: favorite */}
      {game.favorite && (
        <div className="absolute top-2 right-2 text-accent">
          <Heart className="w-4 h-4 fill-current drop-shadow" />
        </div>
      )}

      {/* Bottom: gradient + meta */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${badge.tone}`}>
            {badge.label}
          </span>
          <span className="text-[10px] text-white/60 uppercase tracking-wider">
            {platform.shortName}
          </span>
        </div>
        <div className="text-sm font-semibold leading-tight text-white line-clamp-2">
          {game.title}
        </div>
      </div>

      {/* Focus play overlay */}
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

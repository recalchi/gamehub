import { motion } from 'framer-motion'

/**
 * Drifting gradient orbs used on the splash and home screens.
 * Pure CSS/SVG — no canvas, so it costs almost nothing at idle.
 */
export default function AnimatedBackground(): JSX.Element {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-mesh opacity-70" />
      <motion.div
        className="absolute -top-32 -left-32 w-[40rem] h-[40rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(94,234,212,0.35), transparent 60%)',
          filter: 'blur(40px)'
        }}
        animate={{ x: [0, 60, 0], y: [0, 30, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-40 -right-20 w-[44rem] h-[44rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(168,85,247,0.3), transparent 60%)',
          filter: 'blur(60px)'
        }}
        animate={{ x: [0, -50, 0], y: [0, -40, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/3 right-1/4 w-[28rem] h-[28rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(34,211,238,0.18), transparent 60%)',
          filter: 'blur(50px)'
        }}
        animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

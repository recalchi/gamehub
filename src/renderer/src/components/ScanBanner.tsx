import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useLibraryStore } from '../store/library'

/**
 * Sticky banner that appears at the top of Home while a scan or enrichment is
 * in progress. Becomes invisible (and removes itself from the layout) when
 * everything settles.
 */
export default function ScanBanner(): JSX.Element {
  const progress = useLibraryStore((s) => s.progress)
  const visible = progress.phase !== 'idle' && progress.phase !== 'done'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="sticky top-0 z-30 mx-12 mt-4 glass rounded-full px-5 py-2 flex items-center gap-3 text-sm shadow-lg"
        >
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
          <span className="text-slate-200">{labelFor(progress.phase)}</span>
          <span className="text-slate-400 font-mono text-xs">
            {progress.scanned} arquivos · {progress.found} jogos
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function labelFor(phase: string): string {
  switch (phase) {
    case 'enumerating':
      return 'Lendo arquivos…'
    case 'classifying':
      return 'Classificando…'
    case 'enriching':
      return 'Buscando capas…'
    default:
      return 'Escaneando…'
  }
}

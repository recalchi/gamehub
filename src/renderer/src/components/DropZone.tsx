import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Folder, Upload } from 'lucide-react'
import AddGameModal from './AddGameModal'
import { useLibraryStore } from '../store/library'

/**
 * Global drag-and-drop zone.
 *
 * Listens on window. When the user drags a file or folder anywhere over
 * the app, a glowing overlay appears. On drop:
 *   - File: opens AddGameModal pre-filled with the path. User picks
 *     platform/title and saves.
 *   - Folder: prompts to add the folder as a game-scan root (Settings →
 *     gameRoots) and immediately re-scans.
 *
 * Electron exposes the absolute `path` property on File objects, which
 * the web spec normally doesn't. That's what makes this whole flow possible
 * without a native picker.
 */
export default function DropZone(): JSX.Element {
  const navigate = useNavigate()
  const settings = useLibraryStore((s) => s.settings)
  const saveSettings = useLibraryStore((s) => s.saveSettings)
  const scan = useLibraryStore((s) => s.scan)
  const [dragging, setDragging] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)

  useEffect(() => {
    let counter = 0

    function onDragEnter(e: DragEvent): void {
      e.preventDefault()
      if (!e.dataTransfer?.types.includes('Files')) return
      counter++
      setDragging(true)
    }
    function onDragLeave(e: DragEvent): void {
      e.preventDefault()
      counter--
      if (counter <= 0) {
        counter = 0
        setDragging(false)
      }
    }
    function onDragOver(e: DragEvent): void {
      e.preventDefault()
    }
    async function onDrop(e: DragEvent): Promise<void> {
      e.preventDefault()
      counter = 0
      setDragging(false)
      const f = e.dataTransfer?.files?.[0]
      if (!f) return
      // Electron exposes .path on File — typed as `unknown` per platform docs
      const path = (f as unknown as { path?: string }).path
      if (!path) return
      const stat = await window.api.system.statPath(path)
      if (!stat.exists) return
      if (stat.isDirectory) {
        if (!settings) return
        if (settings.gameRoots.includes(path)) {
          alert(`A pasta "${path}" já está nos roots de scan.`)
          return
        }
        const ok = confirm(
          `Adicionar "${path}" como pasta de scan? GameHub vai re-escanear em seguida.`
        )
        if (!ok) return
        await saveSettings({ gameRoots: [...settings.gameRoots, path] })
        await scan({ fresh: false })
        navigate('/home')
      } else {
        setPendingPath(path)
      }
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  return (
    <>
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/70 backdrop-blur-md pointer-events-none"
          >
            <div className="glass rounded-2xl border-2 border-dashed border-accent px-12 py-10 text-center">
              <Upload className="w-12 h-12 text-accent mx-auto mb-4 animate-bounce" />
              <h2 className="text-2xl font-display font-bold">Solte para adicionar</h2>
              <p className="text-slate-300 text-sm mt-2 max-w-md">
                Arquivos viram entradas manuais. Pastas viram novos roots de scan.
              </p>
              <p className="text-[11px] text-slate-500 mt-3 flex items-center justify-center gap-1.5">
                <Folder className="w-3 h-3" /> Múltiplos itens: só o primeiro é considerado.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddGameModal
        open={!!pendingPath}
        onClose={() => setPendingPath(null)}
        initialPath={pendingPath ?? undefined}
      />
    </>
  )
}

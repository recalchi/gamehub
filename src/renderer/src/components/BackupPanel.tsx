import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  RotateCcw,
  Upload
} from 'lucide-react'
import { useLibraryStore } from '../store/library'

interface PreviewState {
  exportedAt: string
  appVersion?: string
  gameCount: number
  emulatorCount: number
  path: string
}

/**
 * Backup + restore panel.
 *
 * Export: writes a single JSON containing settings + library.
 * Restore: shows a preview of what's about to be applied before committing.
 * The preview is critical — restoring can wipe the user's current library,
 * so we require an explicit "Aplicar" click after they see the contents.
 */
export default function BackupPanel(): JSX.Element {
  const init = useLibraryStore((s) => s.init)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [busy, setBusy] = useState(false)

  function flash(tone: 'ok' | 'err', msg: string): void {
    setFeedback({ tone, msg })
    setTimeout(() => setFeedback(null), 5000)
  }

  async function doExport(): Promise<void> {
    setBusy(true)
    const r = await window.api.system.exportBackup()
    setBusy(false)
    if ('error' in r) flash('err', r.error)
    else flash('ok', `Backup salvo em ${r.path}`)
  }

  async function pickToRestore(): Promise<void> {
    setBusy(true)
    const r = await window.api.system.previewBackup()
    setBusy(false)
    if ('error' in r) {
      flash('err', r.error)
      return
    }
    setPreview(r)
  }

  async function confirmRestore(): Promise<void> {
    if (!preview) return
    setBusy(true)
    const r = await window.api.system.applyBackup(preview.path)
    setBusy(false)
    setPreview(null)
    if ('error' in r) {
      flash('err', r.error)
      return
    }
    // Reload the store from the restored files
    useLibraryStore.setState({ initialized: false })
    await init()
    flash('ok', 'Backup restaurado. Biblioteca atualizada.')
  }

  return (
    <section className="border-t border-white/5 pt-4 mt-4 space-y-3">
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <Archive className="w-4 h-4 text-accent" /> Backup & restauração
      </div>
      <p className="text-[11px] text-slate-500 -mt-1">
        Salva settings.json + library.json em um único arquivo. Capas não são incluídas
        (são reconstruídas via enrich na próxima execução).
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={doExport}
          disabled={busy}
          className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md flex items-center gap-1.5 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" /> Exportar backup
        </button>
        <button
          onClick={pickToRestore}
          disabled={busy}
          className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md flex items-center gap-1.5 disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" /> Restaurar de arquivo…
        </button>
      </div>

      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass rounded-lg p-4 border border-amber-500/30"
          >
            <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold mb-2">
              <AlertTriangle className="w-4 h-4" /> Confirme antes de aplicar
            </div>
            <dl className="grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-slate-500">Arquivo</dt>
              <dd className="text-slate-300 font-mono truncate">{preview.path}</dd>
              <dt className="text-slate-500">Exportado em</dt>
              <dd className="text-slate-300">{new Date(preview.exportedAt).toLocaleString()}</dd>
              <dt className="text-slate-500">Jogos no backup</dt>
              <dd className="text-slate-300">{preview.gameCount}</dd>
              <dt className="text-slate-500">Emuladores no backup</dt>
              <dd className="text-slate-300">{preview.emulatorCount}</dd>
            </dl>
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
              Sua biblioteca atual será substituída. Um snapshot de segurança será salvo
              automaticamente no mesmo diretório do arquivo.
            </p>
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setPreview(null)}
                className="text-xs px-3 py-1.5 rounded-md hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={confirmRestore}
                disabled={busy}
                className="text-xs px-3 py-1.5 bg-amber-500 text-ink-950 font-semibold rounded-md flex items-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" /> Aplicar restauração
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {feedback && (
        <div
          className={`text-xs flex items-center gap-1.5 ${
            feedback.tone === 'ok' ? 'text-emerald-300' : 'text-rose-300'
          }`}
        >
          {feedback.tone === 'ok' ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : (
            <AlertTriangle className="w-3 h-3" />
          )}
          {feedback.msg}
        </div>
      )}
    </section>
  )
}

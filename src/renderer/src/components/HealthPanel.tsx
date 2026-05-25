import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  FileQuestion,
  FolderOpen,
  Stethoscope,
  Trash2
} from 'lucide-react'
import type { HealthReport } from '@shared/types'
import { useLibraryStore } from '../store/library'

/**
 * Library integrity check panel.
 *
 * Runs `library.healthCheck` on demand. Shows two buckets of issues:
 *   1. Game-level: paths that no longer exist or aren't readable
 *   2. Cache-level: orphan cover/banner files (covers without a matching game)
 *
 * Each row has minimal actions: open the parent folder (for missing files,
 * to help the user find where they moved it) and remove-from-library.
 * Orphan files get a single "Limpar tudo" sweep.
 */
export default function HealthPanel(): JSX.Element {
  const [report, setReport] = useState<HealthReport | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(): Promise<void> {
    setBusy(true)
    setReport(await window.api.library.healthCheck())
    setBusy(false)
  }

  async function sweep(): Promise<void> {
    setBusy(true)
    await window.api.library.cleanOrphans()
    setReport(await window.api.library.healthCheck())
    setBusy(false)
  }

  async function removeEntry(gameId: string): Promise<void> {
    if (!confirm('Remover essa entrada da biblioteca? O arquivo no disco não é afetado.')) return
    await window.api.library.remove(gameId)
    useLibraryStore.setState((s) => ({ games: s.games.filter((g) => g.id !== gameId) }))
    await run()
  }

  const missingFiles = report?.issues.filter(
    (i) => i.kind === 'missing-file' || i.kind === 'unreadable-file'
  ) ?? []
  const orphans = report?.issues.filter(
    (i) => i.kind === 'orphan-cover' || i.kind === 'orphan-banner'
  ) ?? []

  return (
    <section className="border-t border-white/5 pt-4 mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Stethoscope className="w-4 h-4 text-accent" /> Integridade da biblioteca
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md disabled:opacity-50"
        >
          {busy ? 'Verificando…' : report ? 'Verificar novamente' : 'Verificar agora'}
        </button>
      </div>

      <AnimatePresence>
        {report && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {report.issues.length === 0 ? (
              <p className="text-emerald-300 text-sm flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Tudo certo. Nenhum problema encontrado em{' '}
                {report.durationMs}ms.
              </p>
            ) : (
              <p className="text-amber-300 text-sm flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                {report.issues.length} problema(s) encontrado(s) em {report.durationMs}ms.
              </p>
            )}

            {missingFiles.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  Arquivos faltando / ilegíveis ({missingFiles.length})
                </div>
                <ul className="space-y-1.5">
                  {missingFiles.map((i, idx) => (
                    <li
                      key={idx}
                      className="bg-ink-800/60 rounded-md px-3 py-2 flex items-start gap-3"
                    >
                      <FileQuestion className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">{i.gameTitle}</div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">
                          {i.path}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{i.message}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() =>
                            window.api.launch.folder(parentDir(i.path))
                          }
                          title="Abrir pasta pai"
                          className="p-1.5 text-slate-400 hover:text-accent rounded hover:bg-white/5"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                        </button>
                        {i.gameId && (
                          <button
                            onClick={() => removeEntry(i.gameId!)}
                            title="Remover da biblioteca"
                            className="p-1.5 text-rose-400 hover:text-rose-300 rounded hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {orphans.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    Capas / banners órfãos ({orphans.length}) ·{' '}
                    {(report.orphanBytes / 1024).toFixed(1)} KB
                  </div>
                  <button
                    onClick={sweep}
                    className="text-[11px] text-rose-300 hover:text-rose-200 inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-3 h-3" /> Limpar tudo
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Arquivos em <code>covers/</code> ou <code>banners/</code> sem jogo correspondente
                  na biblioteca. Podem ser removidos com segurança — o sistema baixa novamente
                  no próximo enrich se necessário.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function parentDir(p: string): string {
  return p.replace(/[\\/][^\\/]*$/, '')
}

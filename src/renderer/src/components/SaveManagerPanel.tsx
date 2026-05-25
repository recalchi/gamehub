import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Archive,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Trash2,
  Upload,
  XCircle
} from 'lucide-react'
import type { SaveSnapshot } from '@shared/types'

interface Props {
  gameId: string
}

interface Location {
  available: boolean
  path?: string
  label?: string
}

/**
 * Renders the saves panel inside the GameDetail screen.
 *
 * Loading model: we fetch location + snapshot list on mount and after every
 * mutating action. The list is small (a dozen snapshots tops) so we don't
 * bother paginating.
 */
export default function SaveManagerPanel({ gameId }: Props): JSX.Element {
  const [location, setLocation] = useState<Location | null>(null)
  const [snapshots, setSnapshots] = useState<SaveSnapshot[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null)

  async function refresh(): Promise<void> {
    const [loc, list] = await Promise.all([
      window.api.saves.location(gameId),
      window.api.saves.list(gameId)
    ])
    setLocation(loc)
    setSnapshots(list)
  }

  useEffect(() => {
    void refresh()
  }, [gameId])

  function flash(tone: 'ok' | 'err', msg: string): void {
    setFeedback({ tone, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  async function doBackup(): Promise<void> {
    setBusy('backup')
    const r = await window.api.saves.backup(gameId)
    setBusy(null)
    if ('error' in r) flash('err', r.error)
    else flash('ok', `Snapshot criado (${r.fileCount} arquivos, ${formatSize(r.sizeBytes)}).`)
    void refresh()
  }

  async function doRestore(snapshotId: string): Promise<void> {
    if (!confirm('Restaurar este snapshot? O save atual será sobrescrito (um backup automático é feito antes).')) return
    setBusy(`restore:${snapshotId}`)
    const r = await window.api.saves.restore(gameId, snapshotId)
    setBusy(null)
    if ('error' in r) flash('err', r.error)
    else flash('ok', 'Save restaurado.')
    void refresh()
  }

  async function doDelete(snapshotId: string): Promise<void> {
    if (!confirm('Excluir este snapshot? Esta ação não pode ser desfeita.')) return
    setBusy(`delete:${snapshotId}`)
    const r = await window.api.saves.delete(gameId, snapshotId)
    setBusy(null)
    if ('error' in r) flash('err', r.error)
    else flash('ok', 'Snapshot excluído.')
    void refresh()
  }

  if (!location) {
    return <div className="text-slate-500 text-sm">Carregando informações de save...</div>
  }

  return (
    <div className="space-y-4">
      {/* Location row */}
      <div className="glass rounded-lg p-4 flex items-start gap-3">
        <Database className="w-5 h-5 text-accent mt-0.5" />
        <div className="flex-1 min-w-0">
          {location.available ? (
            <>
              <div className="text-sm">
                Saves localizados em <span className="text-accent">{location.label}</span>
              </div>
              <div className="text-xs text-slate-500 font-mono truncate mt-0.5">
                {location.path}
              </div>
              <div className="text-[11px] text-slate-500 mt-1.5">
                {snapshots.length} snapshot{snapshots.length === 1 ? '' : 's'} salvos
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-300">
              Local de save não detectado para este emulador. Configure manualmente em
              Configurações.
            </div>
          )}
        </div>
        <button
          onClick={doBackup}
          disabled={!location.available || busy === 'backup'}
          className="px-4 py-2 bg-accent text-ink-950 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
        >
          <Upload className={`w-4 h-4 ${busy === 'backup' ? 'animate-bounce' : ''}`} />
          Backup agora
        </button>
      </div>

      {/* Snapshots list */}
      {snapshots.length > 0 && (
        <ul className="space-y-2">
          <AnimatePresence>
            {snapshots.map((s) => (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="flex items-center gap-3 bg-ink-800/70 rounded-lg px-3 py-2"
              >
                <Archive className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono">{prettyStamp(s.id)}</div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-3 mt-0.5">
                    <span>{s.fileCount} arquivos</span>
                    <span>{formatSize(s.sizeBytes)}</span>
                    {s.id.startsWith('auto-before-restore') && (
                      <span className="text-amber-400">automático</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => doRestore(s.id)}
                  disabled={busy?.startsWith('restore') || !location.available}
                  className="text-xs px-2.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-md flex items-center gap-1 disabled:opacity-40"
                >
                  <Download className="w-3 h-3" /> Restaurar
                </button>
                <button
                  onClick={() => doDelete(s.id)}
                  disabled={busy?.startsWith('delete')}
                  className="text-xs p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-400/10 rounded-md disabled:opacity-40"
                  title="Excluir snapshot"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {feedback && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-2 text-sm ${
            feedback.tone === 'ok' ? 'text-emerald-300' : 'text-rose-300'
          }`}
        >
          {feedback.tone === 'ok' ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          {feedback.msg}
        </motion.div>
      )}

      {snapshots.length === 0 && location.available && (
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <Clock className="w-3 h-3" /> Nenhum snapshot ainda. Crie um antes de testar mods,
          patches ou builds novas do emulador.
        </p>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`
}

function prettyStamp(id: string): string {
  // Folder names are ISO timestamps with `:` and `.` replaced by `-`. Restore
  // a readable label without losing the original id (used as the api key).
  const m = id.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/)
  if (!m) return id
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}`
}

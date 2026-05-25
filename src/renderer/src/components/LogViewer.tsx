import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw, Terminal } from 'lucide-react'
import type { LogEntry } from '@shared/types'

const LEVELS: Array<{ id: LogEntry['level'] | 'all'; label: string; tone: string }> = [
  { id: 'all', label: 'Todos', tone: 'text-slate-300' },
  { id: 'debug', label: 'Debug', tone: 'text-slate-400' },
  { id: 'info', label: 'Info', tone: 'text-cyan-300' },
  { id: 'warn', label: 'Warn', tone: 'text-amber-300' },
  { id: 'error', label: 'Error', tone: 'text-rose-300' }
]

/**
 * Collapsible log viewer that polls the main process for the recent log
 * buffer. Useful for diagnosing scanner / launcher / cover-fetch issues
 * without opening the on-disk file.
 */
export default function LogViewer(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LogEntry['level'] | 'all'>('all')

  async function refresh(): Promise<void> {
    const r = await window.api.system.logs(200)
    setLogs(r)
  }

  useEffect(() => {
    if (!open) return
    void refresh()
    const id = setInterval(refresh, 2000)
    return () => clearInterval(id)
  }, [open])

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.level === filter)

  return (
    <section className="glass rounded-2xl p-6">
      <header
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setOpen((x) => !x)}
      >
        <h2 className="font-display font-semibold text-lg flex items-center gap-2">
          <Terminal className="w-5 h-5 text-accent" /> Logs
          <span className="text-xs text-slate-500 font-mono">({logs.length})</span>
        </h2>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </header>

      {open && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                onClick={() => setFilter(l.id)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  filter === l.id
                    ? 'bg-accent/20 text-accent'
                    : `${l.tone} hover:bg-white/5`
                }`}
              >
                {l.label}
              </button>
            ))}
            <button
              onClick={refresh}
              className="ml-auto text-xs text-slate-400 hover:text-white flex items-center gap-1"
              title="Refresh agora"
            >
              <RefreshCw className="w-3 h-3" /> Atualizar
            </button>
          </div>

          <div className="bg-ink-900 rounded-lg p-3 max-h-96 overflow-y-auto font-mono text-[11px] leading-snug">
            {filtered.length === 0 && (
              <div className="text-slate-500 text-center py-6">Nenhum log para mostrar.</div>
            )}
            {filtered.slice(-150).map((l, i) => (
              <div key={i} className="flex gap-2 items-baseline">
                <span className="text-slate-600 shrink-0">{l.ts.slice(11, 19)}</span>
                <span className={`shrink-0 uppercase ${levelTone(l.level)}`}>
                  {l.level.padEnd(5)}
                </span>
                <span className="text-slate-500 shrink-0">[{l.scope}]</span>
                <span className="text-slate-200 break-all">{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function levelTone(level: LogEntry['level']): string {
  return {
    debug: 'text-slate-500',
    info: 'text-cyan-300',
    warn: 'text-amber-300',
    error: 'text-rose-300'
  }[level]
}

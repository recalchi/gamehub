import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, File, Globe, HardDrive, Image as ImageIcon, Plus, X } from 'lucide-react'
import { PLATFORM_LIST } from '@shared/platforms'
import type { DownloadProgress, PlatformId } from '@shared/types'
import { useLibraryStore } from '../store/library'

interface Props {
  open: boolean
  onClose: () => void
  onAdded?: (id: string) => void
}

type Mode = 'local' | 'url'

/**
 * Adds games the auto-scanner can't see: local PC executables, ROMs sitting
 * outside the scan roots, or remote homebrew/demo URLs.
 *
 * Two tabs:
 *   - **Local**: pick an existing file, optional custom cover, optional metadata
 *   - **URL**: stream a remote file to userData/downloads/<platform>/, then
 *     auto-register it as a manual game. Progress streams via IPC.
 */
export default function AddGameModal({ open, onClose, onAdded }: Props): JSX.Element {
  const [mode, setMode] = useState<Mode>('local')
  const [path, setPath] = useState('')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState<PlatformId>('pc')
  const [coverPath, setCoverPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [downloadId, setDownloadId] = useState<string | null>(null)

  function reset(): void {
    setPath('')
    setUrl('')
    setTitle('')
    setPlatform('pc')
    setCoverPath('')
    setError(null)
    setProgress(null)
    setDownloadId(null)
    setMode('local')
  }

  // Listen for download progress whenever we have an active id
  useEffect(() => {
    if (!downloadId) return
    return window.api.downloads.onProgress(async (p) => {
      if (p.id !== downloadId) return
      setProgress(p)
      if (p.state === 'finished') {
        // Refresh library so the new game appears
        const list = await window.api.library.list()
        useLibraryStore.setState({ games: list.games, emulators: list.emulators })
        setBusy(false)
        if (p.gameId) onAdded?.(p.gameId)
        // Auto-close after brief success display
        setTimeout(() => {
          reset()
          onClose()
        }, 1200)
      } else if (p.state === 'failed') {
        setError(p.error ?? 'Download falhou.')
        setBusy(false)
      } else if (p.state === 'cancelled') {
        setBusy(false)
        setError('Download cancelado.')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadId])

  async function pickFile(): Promise<void> {
    const filters =
      platform === 'pc'
        ? [{ name: 'Executável', extensions: ['exe', 'bat', 'lnk', 'url'] }]
        : [{ name: 'Qualquer arquivo', extensions: ['*'] }]
    const p = await window.api.system.pickFile(filters)
    if (!p) return
    setPath(p)
    if (!title.trim()) {
      const base = p.split(/[\\/]/).pop() ?? p
      setTitle(base.replace(/\.[^.]+$/, ''))
    }
  }

  async function pickCover(): Promise<void> {
    const p = await window.api.system.pickFile([
      { name: 'Imagem', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
    ])
    if (!p) return
    setCoverPath(p)
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError('Preencha o título.')
      return
    }
    setBusy(true)

    if (mode === 'local') {
      if (!path) {
        setError('Selecione o arquivo.')
        setBusy(false)
        return
      }
      const r = await window.api.library.addManual({ title: title.trim(), path, platform })
      if ('error' in r) {
        setError(r.error)
        setBusy(false)
        return
      }
      if (coverPath) await window.api.library.setManualCover(r.id, coverPath)
      const list = await window.api.library.list()
      useLibraryStore.setState({ games: list.games, emulators: list.emulators })
      setBusy(false)
      reset()
      onAdded?.(r.id)
      onClose()
    } else {
      if (!url) {
        setError('Preencha a URL.')
        setBusy(false)
        return
      }
      const r = await window.api.downloads.start({ url, title: title.trim(), platform })
      if ('error' in r) {
        setError(r.error)
        setBusy(false)
        return
      }
      setDownloadId(r.id)
    }
  }

  async function cancelDownload(): Promise<void> {
    if (!downloadId) return
    await window.api.downloads.cancel(downloadId)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !busy && onClose()}
        >
          <motion.form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            className="glass w-[36rem] max-w-[95vw] rounded-2xl p-6 space-y-4"
          >
            <header className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-display font-bold flex items-center gap-2">
                  <Plus className="w-5 h-5 text-accent" /> Adicionar jogo
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Para PC games, ROMs fora dos roots, homebrew ou demos legais.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !busy && onClose()}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            <div className="flex gap-1 p-1 bg-ink-800/60 rounded-lg">
              <TabButton active={mode === 'local'} onClick={() => setMode('local')} icon={HardDrive}>
                Arquivo local
              </TabButton>
              <TabButton active={mode === 'url'} onClick={() => setMode('url')} icon={Globe}>
                Baixar de URL
              </TabButton>
            </div>

            <Field label="Título">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={mode === 'local' ? 'Minecraft Java Edition' : 'Homebrew Demo'}
                autoFocus
                className="w-full bg-ink-800 border border-white/5 rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>

            <Field label="Plataforma">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as PlatformId)}
                className="w-full bg-ink-800 border border-white/5 rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {PLATFORM_LIST.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            {mode === 'local' ? (
              <>
                <Field label="Caminho do arquivo">
                  <div className="flex gap-2">
                    <input
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                      placeholder="C:\Games\Minecraft\MinecraftLauncher.exe"
                      className="flex-1 bg-ink-800 border border-white/5 rounded-md px-3 py-2 text-sm outline-none focus:border-accent font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={pickFile}
                      className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-md text-xs flex items-center gap-1.5"
                    >
                      <File className="w-3.5 h-3.5" /> Procurar
                    </button>
                  </div>
                </Field>

                <Field label="Capa personalizada (opcional)">
                  <div className="flex gap-2">
                    <input
                      value={coverPath}
                      onChange={(e) => setCoverPath(e.target.value)}
                      placeholder="Caminho ou clique em Procurar"
                      className="flex-1 bg-ink-800 border border-white/5 rounded-md px-3 py-2 text-sm outline-none focus:border-accent font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={pickCover}
                      className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-md text-xs flex items-center gap-1.5"
                    >
                      <ImageIcon className="w-3.5 h-3.5" /> Procurar
                    </button>
                  </div>
                </Field>
              </>
            ) : (
              <>
                <Field label="URL do download">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://exemplo.com/homebrew.zip"
                    className="w-full bg-ink-800 border border-white/5 rounded-md px-3 py-2 text-sm outline-none focus:border-accent font-mono text-[11px]"
                    disabled={busy}
                  />
                </Field>
                <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
                  <Download className="w-3 h-3 mt-0.5 shrink-0" />
                  Salvo em <code>%APPDATA%/gamehub/downloads/{platform}/</code>. GameHub não
                  verifica licença — use apenas para conteúdo legalmente disponível.
                </p>

                {progress && (
                  <div className="space-y-1.5 bg-ink-800/60 rounded-md p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">
                        {progress.state === 'starting' && 'Iniciando…'}
                        {progress.state === 'downloading' && 'Baixando…'}
                        {progress.state === 'finished' && 'Concluído ✓'}
                        {progress.state === 'cancelled' && 'Cancelado'}
                        {progress.state === 'failed' && 'Falhou'}
                      </span>
                      <span className="text-slate-400 font-mono">
                        {formatSize(progress.received)}
                        {progress.total ? ` / ${formatSize(progress.total)}` : ''} ·{' '}
                        {formatSize(progress.speed)}/s
                      </span>
                    </div>
                    <div className="h-1.5 bg-ink-900 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full ${
                          progress.state === 'failed'
                            ? 'bg-rose-400'
                            : 'bg-gradient-to-r from-accent to-cyan-400'
                        }`}
                        animate={{
                          width: progress.total
                            ? `${(progress.received / progress.total) * 100}%`
                            : '50%'
                        }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
              {busy && mode === 'url' && downloadId ? (
                <button
                  type="button"
                  onClick={cancelDownload}
                  className="px-4 py-2 text-sm rounded-md bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                >
                  Cancelar download
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => !busy && onClose()}
                  className="px-4 py-2 text-sm rounded-md hover:bg-white/5"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 bg-accent text-ink-950 rounded-md font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {mode === 'url' ? <Download className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {busy ? (mode === 'url' ? 'Baixando…' : 'Adicionando…') : mode === 'url' ? 'Baixar' : 'Adicionar'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children
}: {
  active: boolean
  onClick: () => void
  icon: typeof HardDrive
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 text-xs rounded-md flex items-center justify-center gap-1.5 transition-colors ${
        active ? 'bg-accent/20 text-accent' : 'text-slate-400 hover:text-white'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">{label}</div>
      {children}
    </label>
  )
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`
}

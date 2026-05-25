import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  FolderOpen,
  Heart,
  HelpCircle,
  Lock,
  Pencil,
  Play,
  Settings as SettingsIcon,
  Trash2,
  X
} from 'lucide-react'
import { useLibraryStore } from '../store/library'
import { PLATFORMS } from '@shared/platforms'
import { EMULATORS } from '@shared/emulators'
import type { Game } from '@shared/types'
import SaveManagerPanel from '../components/SaveManagerPanel'
import BiosPanel from '../components/BiosPanel'
import MetadataEditor from '../components/MetadataEditor'

export default function GameDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const games = useLibraryStore((s) => s.games)
  const emulators = useLibraryStore((s) => s.emulators)
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite)
  const launch = useLibraryStore((s) => s.launch)
  const game = games.find((g) => g.id === id)
  const [launchMsg, setLaunchMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!game) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') void onPlay()
      if (e.key === 'f') void toggleFavorite(game.id)
      if (e.key === 'Escape') navigate(-1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id])

  if (!game) {
    return (
      <div className="p-12 text-slate-400">
        Jogo não encontrado. <Link to="/library" className="text-accent">Voltar à biblioteca</Link>
      </div>
    )
  }

  async function onPlay(): Promise<void> {
    setLaunchMsg('Iniciando emulador...')
    const r = await launch(game!.id)
    setLaunchMsg(r.ok ? 'Emulador iniciado.' : r.error ?? 'Falha ao iniciar.')
    setTimeout(() => setLaunchMsg(null), 4000)
  }

  const platform = PLATFORMS[game.platform]
  const emu = game.emulator ? emulators.find((e) => e.id === game.emulator) : undefined
  const emuDef = game.emulator ? EMULATORS[game.emulator] : undefined
  const playMinutes = Math.round((game.playTime ?? 0) / 60)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="relative min-h-full"
    >
      {/* Hero background */}
      <div
        className="absolute inset-x-0 top-0 h-[60vh] -z-0"
        style={{
          background: `radial-gradient(ellipse at 30% 0%, ${platform.color}66 0%, transparent 60%), linear-gradient(180deg, ${platform.color}22, transparent)`
        }}
      />
      <div className="relative z-10 px-12 pt-8 pb-16">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-slate-300 hover:text-accent transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <div className="flex gap-10">
          {/* Cover + cover actions */}
          <div className="shrink-0">
            <div
              className="w-72 h-[26rem] rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
              style={{
                background: game.cover
                  ? `url(${game.cover}) center/cover`
                  : `linear-gradient(160deg, ${platform.color}, ${platform.color}55)`
              }}
            >
              {!game.cover && (
                <div className="h-full flex items-center justify-center text-center px-6">
                  <div>
                    <div className="font-mono text-xs uppercase tracking-widest text-white/60 mb-3">
                      {platform.shortName}
                    </div>
                    <div className="font-display font-bold text-2xl text-white">{game.title}</div>
                  </div>
                </div>
              )}
            </div>
            <CoverActions gameId={game.id} hasCover={!!game.cover} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-accent/80 mb-2">
              {platform.name}
            </p>
            <EditableTitle game={game} />

            <dl className="mt-6 grid grid-cols-2 gap-y-3 gap-x-12 text-sm max-w-xl">
              <Field label="Plataforma" value={platform.name} />
              <Field
                label="Emulador"
                value={emu ? emu.name : emuDef?.name ?? 'Não configurado'}
              />
              <Field label="Tamanho" value={formatSize(game.sizeBytes)} />
              <Field
                label="Confiança da detecção"
                value={`${Math.round(game.confidence * 100)}%`}
              />
              <Field
                label="Tempo jogado"
                value={playMinutes > 0 ? `${playMinutes} min` : 'Nunca jogado'}
              />
              <Field
                label="Última vez"
                value={game.lastPlayedAt ? new Date(game.lastPlayedAt).toLocaleString() : '—'}
              />
            </dl>

            {/* Flags / warnings */}
            {game.flags.length > 0 && (
              <div className="mt-6 glass rounded-lg p-4 text-sm space-y-1">
                <div className="flex items-center gap-2 text-amber-300 font-semibold">
                  <AlertTriangle className="w-4 h-4" /> Observações do scanner
                </div>
                <ul className="text-slate-300 list-disc ml-6 mt-1 space-y-0.5">
                  {game.flags.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Status pill row */}
            <div className="mt-6 flex items-center gap-2 text-xs">
              <StatusPill game={game} />
              {game.path && (
                <code className="text-slate-500 text-[11px] truncate max-w-md inline-block">
                  {game.path}
                </code>
              )}
            </div>

            {/* BIOS check */}
            <div className="mt-3">
              <BiosPanel emulatorId={game.emulator} />
            </div>

            <MetadataEditor game={game} />

            {/* Actions */}
            <div className="mt-8 flex gap-3 flex-wrap">
              <PrimaryButton game={game} onClick={onPlay} />
              <button
                onClick={() => toggleFavorite(game.id)}
                className="px-5 py-3 glass rounded-lg flex items-center gap-2 hover:bg-white/10 transition-all"
              >
                <Heart
                  className={`w-4 h-4 ${game.favorite ? 'fill-accent text-accent' : ''}`}
                />
                {game.favorite ? 'Favoritado' : 'Favoritar'}
              </button>
              <Link
                to="/settings"
                className="px-5 py-3 glass rounded-lg flex items-center gap-2 hover:bg-white/10 transition-all"
              >
                <SettingsIcon className="w-4 h-4" /> Configurar emulador
              </Link>
              <button
                onClick={() => window.api.launch.folder(parentFolder(game.path))}
                className="px-5 py-3 glass rounded-lg flex items-center gap-2 hover:bg-white/10 transition-all"
              >
                <FolderOpen className="w-4 h-4" /> Abrir pasta
              </button>
              <button
                onClick={async () => {
                  if (
                    !confirm(
                      `Remover "${game.title}" da biblioteca?\n\nO arquivo no disco NÃO será apagado — apenas a entrada do GameHub.`
                    )
                  )
                    return
                  const r = await window.api.library.remove(game.id)
                  if ('error' in r) {
                    alert(`Falha: ${r.error}`)
                    return
                  }
                  // Refresh in-memory store and go back
                  useLibraryStore.setState((s) => ({
                    games: s.games.filter((g) => g.id !== game.id)
                  }))
                  navigate('/library', { replace: true })
                }}
                className="ml-auto px-5 py-3 text-rose-300 hover:bg-rose-500/10 rounded-lg flex items-center gap-2 transition-all"
                title="Remover da biblioteca"
              >
                <Trash2 className="w-4 h-4" /> Remover
              </button>
            </div>

            {launchMsg && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 text-sm text-accent"
              >
                {launchMsg}
              </motion.div>
            )}
          </div>
        </div>

        {/* Saves panel */}
        <section className="mt-12 max-w-4xl">
          <h2 className="font-display font-semibold text-xl mb-4 flex items-center gap-3">
            <span className="w-1.5 h-7 rounded-full bg-accent shadow-[0_0_12px_rgba(94,234,212,0.7)]" />
            Saves
          </h2>
          <SaveManagerPanel gameId={game.id} />
        </section>
      </div>
    </motion.div>
  )
}

/**
 * Below-the-cover buttons: refetch from libretro, or pick a local file.
 * Updates stream back into the zustand store via the onCoverUpdated event,
 * so the cover refreshes without a manual reload.
 */
function CoverActions({ gameId, hasCover }: { gameId: string; hasCover: boolean }): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  function flash(s: string): void {
    setMsg(s)
    setTimeout(() => setMsg(null), 3500)
  }

  async function refetch(): Promise<void> {
    setBusy('refetch')
    const r = await window.api.library.refetchCover(gameId)
    setBusy(null)
    flash(r?.cover ? 'Capa atualizada.' : 'Nenhuma capa encontrada nesta busca.')
  }

  async function pickFile(): Promise<void> {
    const path = await window.api.system.pickFile([
      { name: 'Imagem', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
    ])
    if (!path) return
    setBusy('pick')
    const r = await window.api.library.setManualCover(gameId, path)
    setBusy(null)
    flash('error' in r ? `Falhou: ${r.error}` : 'Capa personalizada definida.')
  }

  return (
    <div className="mt-3 space-y-2 w-72">
      <div className="flex gap-2">
        <button
          onClick={refetch}
          disabled={busy === 'refetch'}
          className="flex-1 text-xs px-3 py-2 glass rounded-md hover:bg-white/10 disabled:opacity-50"
        >
          {busy === 'refetch' ? 'Buscando…' : hasCover ? 'Atualizar capa' : 'Buscar capa'}
        </button>
        <button
          onClick={pickFile}
          disabled={busy === 'pick'}
          className="flex-1 text-xs px-3 py-2 glass rounded-md hover:bg-white/10 disabled:opacity-50"
        >
          {busy === 'pick' ? 'Copiando…' : 'Escolher imagem…'}
        </button>
      </div>
      {msg && <p className="text-[11px] text-accent">{msg}</p>}
    </div>
  )
}

/**
 * Inline title editor. Click pencil → input appears → Enter/check saves,
 * Esc/x cancels. Persists via library.update; the zustand store stays in sync
 * because GameDetail re-reads from the games array on the next render.
 */
function EditableTitle({ game }: { game: Game }): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(game.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue(game.title)
  }, [game.title])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  async function save(): Promise<void> {
    const trimmed = value.trim()
    if (!trimmed || trimmed === game.title) {
      setEditing(false)
      setValue(game.title)
      return
    }
    await window.api.library.update(game.id, { title: trimmed })
    // Optimistically update the store so the UI reflects immediately
    useLibraryStore.setState((s) => ({
      games: s.games.map((g) => (g.id === game.id ? { ...g, title: trimmed } : g))
    }))
    setEditing(false)
  }

  if (!editing) {
    return (
      <h1 className="text-5xl font-display font-bold leading-tight group flex items-center gap-3">
        <span>{game.title}</span>
        <button
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-accent"
          title="Renomear"
        >
          <Pencil className="w-5 h-5" />
        </button>
      </h1>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') {
            setEditing(false)
            setValue(game.title)
          }
        }}
        className="text-5xl font-display font-bold leading-tight bg-transparent border-b-2 border-accent outline-none px-1 max-w-2xl flex-1"
      />
      <button
        onClick={() => void save()}
        className="text-accent hover:text-accent/80 p-2"
        title="Salvar"
      >
        <Check className="w-6 h-6" />
      </button>
      <button
        onClick={() => {
          setEditing(false)
          setValue(game.title)
        }}
        className="text-slate-400 hover:text-rose-300 p-2"
        title="Cancelar"
      >
        <X className="w-6 h-6" />
      </button>
    </div>
  )
}

function PrimaryButton({ game, onClick }: { game: Game; onClick: () => void }): JSX.Element {
  if (game.status === 'missing-emulator') {
    return (
      <Link
        to="/settings"
        className="px-6 py-3 bg-rose-500 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-rose-400 transition-colors"
      >
        <Lock className="w-4 h-4" /> Configurar emulador
      </Link>
    )
  }
  if (game.status === 'missing-bios') {
    return (
      <button
        onClick={onClick}
        className="px-6 py-3 bg-amber-500 text-ink-950 rounded-lg font-semibold flex items-center gap-2 hover:bg-amber-400 transition-colors"
      >
        <HelpCircle className="w-4 h-4" /> Jogar (BIOS necessária)
      </button>
    )
  }
  if (game.status === 'corrupted') {
    return (
      <button
        onClick={onClick}
        className="px-6 py-3 bg-amber-500/80 text-ink-950 rounded-lg font-semibold flex items-center gap-2 hover:bg-amber-400 transition-colors"
      >
        <AlertTriangle className="w-4 h-4" /> Tentar mesmo assim
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className="px-7 py-3 bg-accent text-ink-950 rounded-lg font-semibold flex items-center gap-2 hover:bg-accent/90 transition-all shadow-[0_0_30px_rgba(94,234,212,0.45)]"
    >
      <Play className="w-5 h-5 fill-current" /> Jogar
    </button>
  )
}

function StatusPill({ game }: { game: Game }): JSX.Element {
  const map: Record<string, { label: string; tone: string; icon: typeof Play }> = {
    ready: { label: 'Pronto para jogar', tone: 'bg-emerald-400/20 text-emerald-300', icon: Play },
    'missing-emulator': {
      label: 'Emulador não encontrado',
      tone: 'bg-rose-400/20 text-rose-300',
      icon: Lock
    },
    'missing-bios': { label: 'BIOS necessária', tone: 'bg-amber-400/20 text-amber-300', icon: HelpCircle },
    corrupted: { label: 'Arquivo suspeito', tone: 'bg-amber-400/20 text-amber-300', icon: AlertTriangle },
    unknown: { label: 'Indeterminado', tone: 'bg-slate-500/30 text-slate-300', icon: HelpCircle }
  }
  const info = map[game.status] ?? map.unknown
  const Icon = info.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${info.tone}`}>
      <Icon className="w-3 h-3" />
      {info.label}
    </span>
  )
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-widest text-slate-500">{label}</dt>
      <dd className="text-slate-100 mt-0.5">{value}</dd>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

function parentFolder(p: string): string {
  return p.replace(/[\\/][^\\/]*$/, '')
}

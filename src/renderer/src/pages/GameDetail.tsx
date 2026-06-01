import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { layoutSpring } from '../motion/tokens'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Award,
  Check,
  Clock,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Heart,
  HelpCircle,
  Loader2,
  Lock,
  Pencil,
  Play,
  Square,
  Settings as SettingsIcon,
  Sliders,
  Trophy,
  Trash2,
  X
} from 'lucide-react'
import { useLibraryStore } from '../store/library'
import { PLATFORMS } from '@shared/platforms'
import { EMULATORS } from '@shared/emulators'
import type { Game, GameAchievementDetail, GameCompletionStatus } from '@shared/types'
import SaveManagerPanel from '../components/SaveManagerPanel'
import BiosPanel from '../components/BiosPanel'
import CrashHistoryPanel from '../components/CrashHistoryPanel'
import EmulatorPicker from '../components/EmulatorPicker'
import MetadataEditor from '../components/MetadataEditor'
import TagEditor from '../components/TagEditor'
import GameBackdrop from '../components/GameBackdrop'
import PerformancePanel from '../components/PerformancePanel'

export default function GameDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const games = useLibraryStore((s) => s.games)
  const emulators = useLibraryStore((s) => s.emulators)
  const dynamicBackgrounds = useLibraryStore(
    (s) => s.settings?.appearance.dynamicGameBackgrounds ?? true
  )
  const backgroundPreset = useLibraryStore(
    (s) => s.settings?.appearance.gameBackgroundPreset ?? 'vibrant'
  )
  const showPerformancePanel = useLibraryStore(
    (s) => s.settings?.performance.showOnGameDetail ?? true
  )
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite)
  const launch = useLibraryStore((s) => s.launch)
  const terminate = useLibraryStore((s) => s.terminate)
  const reload = useLibraryStore((s) => s.reload)
  const game = games.find((g) => g.id === id)
  const [launchMsg, setLaunchMsg] = useState<string | null>(null)
  const [achievements, setAchievements] = useState<GameAchievementDetail | null>(null)
  const [isActive, setIsActive] = useState(false)
  // Tabbed lower panel — keeps the play button close to the top while still
  // letting the user reach BIOS/emulator/metadata/crashes without scrolling.
  type DetailTab = 'setup' | 'history' | 'achievements' | 'journey' | 'details'
  const [tab, setTab] = useState<DetailTab>('setup')

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

  useEffect(() => {
    if (!game) return
    void window.api.achievements.game(game.id).then(setAchievements)
  }, [game?.id])

  useEffect(() => {
    if (!game) return
    let mounted = true
    void window.api.launch.active().then((list) => {
      if (!mounted) return
      setIsActive(list.some((entry) => entry.gameId === game.id))
    })
    const offStarted = window.api.launch.onStarted((entry) => {
      if (entry.gameId === game.id) setIsActive(true)
    })
    const offEnded = window.api.launch.onEnded((entry) => {
      if (entry.gameId === game.id) setIsActive(false)
    })
    return () => {
      mounted = false
      offStarted()
      offEnded()
    }
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

  async function onTerminate(): Promise<void> {
    setLaunchMsg('Encerrando jogo...')
    const r = await terminate(game!.id)
    setLaunchMsg(r.ok ? r.note ?? 'Encerrado.' : r.error ?? 'Falha ao encerrar.')
    setTimeout(() => setLaunchMsg(null), 4500)
  }

  const platform = PLATFORMS[game.platform]
  const emu = game.emulator ? emulators.find((e) => e.id === game.emulator) : undefined
  const emuDef = game.emulator ? EMULATORS[game.emulator] : undefined
  const playMinutes = Math.round((game.playTime ?? 0) / 60)

  return (
    // Plain fade — sharedElementVariants is gated on shared-layout being
    // active (mode=popLayout) but that broke layout for the rest of the app,
    // so we fell back to mode=wait and let the detail use the default page
    // transition. The cover layoutId still gives a nice spring within the
    // page; just doesn't cross-fly from the card anymore.
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.18 } }}
      exit={{ opacity: 0, transition: { duration: 0.14 } }}
      className="relative min-h-full"
    >
      <GameDetailBackdrop game={game} dynamic={dynamicBackgrounds} preset={backgroundPreset} />
      <div className="relative z-10 px-12 pt-8 pb-16">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-slate-300 hover:text-accent transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <div className="flex gap-10">
          {/* Cover + cover actions — layoutId matches the GameCard so Framer
              animates the card's cover flying out into this hero position. */}
          <div className="shrink-0">
            <motion.div
              layoutId={`game-cover-${game.id}`}
              transition={layoutSpring}
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
            </motion.div>
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

            {/* Primary actions — moved up so the Play button isn't buried
                under panels. Secondary actions stay visible too. */}
            <div className="mt-5 flex gap-3 flex-wrap">
              <PrimaryButton game={game} onClick={onPlay} />
              {isActive && (
                <button
                  onClick={() => void onTerminate()}
                  className="px-5 py-3 bg-rose-500/90 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-rose-500 transition-colors"
                >
                  <Square className="w-4 h-4 fill-current" /> Encerrar jogo
                </button>
              )}
              <button
                onClick={() => toggleFavorite(game.id)}
                className="px-5 py-3 glass rounded-lg flex items-center gap-2 hover:bg-white/10 transition-all"
              >
                <Heart
                  className={`w-4 h-4 ${game.favorite ? 'fill-accent text-accent' : ''}`}
                />
                {game.favorite ? 'Favoritado' : 'Favoritar'}
              </button>
              <button
                onClick={() => window.api.launch.folder(parentFolder(game.path))}
                className="px-5 py-3 glass rounded-lg flex items-center gap-2 hover:bg-white/10 transition-all"
              >
                <FolderOpen className="w-4 h-4" /> Abrir pasta
              </button>
              <button
                type="button"
                onClick={() => setTab('journey')}
                className="ml-auto px-5 py-3 text-rose-300 hover:bg-rose-500/10 rounded-lg flex items-center gap-2 transition-all"
                title="Arquivar e remover"
              >
                <Trash2 className="w-4 h-4" /> Arquivar/remover
              </button>
            </div>

            {launchMsg && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 text-sm text-accent"
              >
                {launchMsg}
              </motion.div>
            )}

            <GameFileActions game={game} onChanged={() => void reload()} />

            {/* Tabbed panel — groups the noisier sections so the page no
                longer feels like a scroll dump. */}
            <DetailTabs tab={tab} onChange={setTab} />
            <div className="mt-4">
              {tab === 'setup' && (
                <div className="space-y-3">
                  <EmulatorPicker game={game} onChanged={() => void reload()} />
                  <BiosPanel emulatorId={game.emulator} onBiosInstalled={() => void reload()} />
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-slate-400 flex items-center gap-2">
                    <SettingsIcon className="w-3.5 h-3.5 text-slate-500" />
                    Atalhos:
                    <Link to="/settings" className="text-accent hover:underline">
                      configurações globais
                    </Link>
                  </div>
                </div>
              )}
              {tab === 'history' && (
                <div className="space-y-3">
                  {showPerformancePanel && <PerformancePanel game={game} />}
                  <CrashHistoryPanel gameId={game.id} />
                </div>
              )}
              {tab === 'achievements' && <AchievementsPanel detail={achievements} />}
              {tab === 'journey' && (
                <JourneyTrackerPanel
                  game={game}
                  onRemoved={() => {
                    useLibraryStore.setState((s) => ({
                      games: s.games.filter((g) => g.id !== game.id)
                    }))
                    navigate('/library', { replace: true })
                  }}
                />
              )}
              {tab === 'details' && (
                <div className="space-y-3">
                  <MetadataEditor game={game} />
                  <TagEditor game={game} />
                </div>
              )}
            </div>
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
 * Tab bar for the GameDetail right column. The actual content is rendered by
 * the parent — this component just owns the visual switcher.
 */
function DetailTabs({
  tab,
  onChange
}: {
  tab: 'setup' | 'history' | 'achievements' | 'journey' | 'details'
  onChange: (next: 'setup' | 'history' | 'achievements' | 'journey' | 'details') => void
}): JSX.Element {
  const tabs: Array<{
    id: 'setup' | 'history' | 'achievements' | 'journey' | 'details'
    label: string
    icon: typeof Sliders
  }> = [
    { id: 'setup', label: 'Configurar', icon: Sliders },
    { id: 'history', label: 'Histórico', icon: Activity },
    { id: 'achievements', label: 'Conquistas', icon: Award },
    { id: 'journey', label: 'Zerados', icon: Trophy },
    { id: 'details', label: 'Detalhes', icon: FileText }
  ]
  return (
    <div className="mt-6 border-b border-white/5 flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const Icon = t.icon
        const active = tab === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-accent text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

function GameDetailBackdrop({
  game,
  dynamic,
  preset
}: {
  game: Game
  dynamic: boolean
  preset: import('@shared/types').GameBackgroundPreset
}): JSX.Element {
  if (!dynamic) {
    return (
      <div
        className="absolute inset-x-0 top-0 h-[60vh] z-0"
        style={{
          background:
            'radial-gradient(ellipse at 30% 0%, rgb(var(--accent) / 0.36) 0%, transparent 60%), linear-gradient(180deg, rgb(var(--accent) / 0.14), transparent)'
        }}
      />
    )
  }

  return <GameBackdrop game={game} preset={preset} />
}

function AchievementsPanel({ detail }: { detail: GameAchievementDetail | null }): JSX.Element {
  if (!detail) {
    return (
      <section id="achievements" className="mt-4 glass rounded-lg p-4 text-sm text-slate-400">
        Carregando conquistas...
      </section>
    )
  }

  const ready = detail.summary.status === 'ready'
  const preview = detail.achievements.slice(0, 6)

  return (
    <section id="achievements" className="mt-4 glass rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-semibold text-lg flex items-center gap-2">
            <Award className="w-5 h-5 text-accent" /> Conquistas
          </h2>
          <p className="text-xs text-slate-400 mt-1">{detail.summary.sourceDetail}</p>
        </div>
        <Link
          to="/achievements"
          className="rounded-md bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-white/10"
        >
          Central
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-accent/15 px-2 py-1 text-accent">
          {detail.summary.sourceLabel}
        </span>
        <span className="rounded bg-white/5 px-2 py-1 text-slate-300">
          {detail.summary.total > 0 ? `${detail.summary.total} identificadas` : 'Sem lista local'}
        </span>
        {detail.summary.sourceUrl && (
          <button
            type="button"
            onClick={() => window.api.system.openExternal(detail.summary.sourceUrl!)}
            className="rounded bg-white/5 px-2 py-1 text-slate-300 hover:bg-white/10 inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Fonte
          </button>
        )}
      </div>

      {ready ? (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
          {preview.map((achievement) => (
            <div key={achievement.id} className="flex gap-3 rounded-lg bg-white/[0.04] p-2">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded bg-white/5">
                {achievement.icon ? (
                  <img
                    src={achievement.icon}
                    alt={achievement.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-slate-500">
                    <Award className="w-5 h-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{achievement.title}</div>
                {achievement.description && (
                  <div className="text-[11px] text-slate-500 line-clamp-2">
                    {achievement.description}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          Quando uma fonte confiavel estiver configurada ou cacheada, a lista aparece aqui automaticamente.
        </p>
      )}
    </section>
  )
}

function JourneyTrackerPanel({
  game,
  onRemoved
}: {
  game: Game
  onRemoved: () => void
}): JSX.Element {
  const [status, setStatus] = useState<GameCompletionStatus>('played')
  const [redownloadUrl, setRedownloadUrl] = useState('')
  const [captureSave, setCaptureSave] = useState(true)
  const [busy, setBusy] = useState<'track' | 'remove' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.api.journey.list().then((records) => {
      if (!alive) return
      const current = records.find((record) => record.gameId === game.id)
      if (!current) return
      setStatus(current.status)
      setRedownloadUrl(current.redownloadUrl ?? '')
    })
    return () => {
      alive = false
    }
  }, [game.id])

  async function saveJourney(): Promise<void> {
    setBusy('track')
    const result = await window.api.journey.upsert({
      gameId: game.id,
      status,
      redownloadUrl: redownloadUrl.trim() || undefined,
      sourceLabel: 'GameHub',
      sourceUrl: redownloadUrl.trim() || undefined,
      captureSave
    })
    setBusy(null)
    if ('error' in result) {
      setMsg(result.error)
      return
    }
    setMsg(
      result.saveWarning
        ? `Jornada salva, mas o backup de save não foi feito: ${result.saveWarning}`
        : 'Jornada salva em Conquistas.'
    )
  }

  async function archiveAndRemove(): Promise<void> {
    if (!redownloadUrl.trim()) {
      setMsg('Informe o link para baixar/reinstalar depois.')
      return
    }
    if (
      !confirm(
        `Arquivar "${game.title}" como ${labelForStatus(status)} e remover da biblioteca?\n\nA entrada de conquista continua salva com capa e histórico.`
      )
    ) {
      return
    }
    setBusy('remove')
    const result = await window.api.library.archiveRemove({
      gameId: game.id,
      status,
      redownloadUrl: redownloadUrl.trim(),
      sourceLabel: 'GameHub',
      sourceUrl: redownloadUrl.trim(),
      captureSave
    })
    setBusy(null)
    if ('error' in result) {
      setMsg(result.error)
      return
    }
    onRemoved()
  }

  return (
    <section id="journey-archive" className="glass rounded-xl p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-semibold text-sm">Conquistas / Zerados</h3>
          <p className="text-[11px] text-slate-400">
            Salva progresso independente do jogo instalado (capa + status + referência de re-download).
          </p>
        </div>
        <Link
          to="/achievements"
          className="rounded-md bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
        >
          Abrir central
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="md:col-span-1">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as GameCompletionStatus)}
            className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="played">Jogado</option>
            <option value="completed">Zerado</option>
            <option value="platinum">Platinado</option>
          </select>
        </label>

        <label className="md:col-span-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">
            Link para baixar depois (obrigatório para excluir)
          </span>
          <input
            value={redownloadUrl}
            onChange={(e) => setRedownloadUrl(e.currentTarget.value)}
            placeholder="https://...  ou  steam://rungameid/..."
            className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={captureSave}
          onChange={(e) => setCaptureSave(e.currentTarget.checked)}
          className="rounded border-white/20 bg-white/5"
        />
        Criar snapshot de save neste registro
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void saveJourney()}
          disabled={busy !== null}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15 disabled:opacity-60"
        >
          {busy === 'track' ? 'Salvando…' : 'Salvar progresso'}
        </button>
        <button
          type="button"
          onClick={() => void archiveAndRemove()}
          disabled={busy !== null}
          className="rounded-lg bg-rose-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60 inline-flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          {busy === 'remove' ? 'Arquivando…' : 'Arquivar e remover da biblioteca'}
        </button>
      </div>

      {msg && <p className="mt-2 text-xs text-accent">{msg}</p>}
    </section>
  )
}

function labelForStatus(status: GameCompletionStatus): string {
  if (status === 'platinum') return 'Platinado'
  if (status === 'completed') return 'Zerado'
  return 'Jogado'
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
 * Re-aim the game at a different file. Vital for PS4 games where the user
 * extracts the pkg with an external tool (PS4 PKG Tool, etc) and ends up
 * with an eboot.bin somewhere — point the library entry there and the
 * launcher pipeline picks it up without recreating the entry.
 *
 * Also useful when a user has the same ROM in two locations and wants to
 * swap which one is canonical.
 */
function GameFileActions({ game, onChanged }: { game: Game; onChanged: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function repoint(): Promise<void> {
    // Filters tuned per platform. PS4 wants eboot.bin or the pkg; PS3 wants
    // either; rest gets "any executable / image" — keep the picker permissive.
    const filters =
      game.platform === 'ps4'
        ? [
            { name: 'shadPS4 eboot ou .pkg', extensions: ['bin', 'pkg', 'elf'] },
            { name: 'Todos os arquivos', extensions: ['*'] }
          ]
        : [
            { name: 'Imagem/Exe/Pacote', extensions: ['iso', 'bin', 'cue', 'chd', 'pkg', 'exe', 'elf'] },
            { name: 'Todos os arquivos', extensions: ['*'] }
          ]
    const path = await window.api.system.pickFile(filters)
    if (!path) return
    setBusy(true)
    const r = await window.api.library.update(game.id, { path })
    setBusy(false)
    if (r) {
      setMsg(`Apontado para: ${path}`)
      setTimeout(() => setMsg(null), 4000)
      onChanged()
    } else {
      setMsg('Falha ao atualizar.')
      setTimeout(() => setMsg(null), 3000)
    }
  }

  // Show only when there's a likely reason to repoint:
  // PS4 (almost always needed because of pkg→eboot dance),
  // or any game whose status isn't 'ready'.
  const helpful =
    game.platform === 'ps4' || game.status !== 'ready' || game.path?.toLowerCase().endsWith('.pkg')
  if (!helpful) return <></>

  return (
    <div className="mt-3 text-xs">
      <button
        onClick={repoint}
        disabled={busy}
        data-ui-sound="toggle"
        className="text-slate-300 hover:text-accent inline-flex items-center gap-1.5 px-2.5 py-1 rounded glass disabled:opacity-50"
      >
        <Pencil className="w-3 h-3" />
        {busy ? 'Salvando…' : 'Apontar para outro arquivo (.eboot.bin / .pkg / .iso)'}
      </button>
      {msg && <p className="text-[11px] text-accent mt-1.5">{msg}</p>}
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
        {/* layoutId shared with GameCard's title — Framer animates the small
            card title growing into this big hero heading. */}
        <motion.span layoutId={`game-title-${game.id}`} transition={layoutSpring}>
          {game.title}
        </motion.span>
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
    return <MissingEmulatorButton game={game} />
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
    // Compressed archives have a dedicated extract flow that turns the .7z
    // into a playable .iso in place — much better than "tentar mesmo assim"
    // which would launch the archive directly and fail.
    const isArchive = /\.(zip|7z|rar)$/i.test(game.path)
    if (isArchive) {
      return <ExtractArchiveButton game={game} />
    }
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

/**
 * Smart button shown when a game has no emulator. Checks if we can auto-install
 * one for this platform; if so, offers one-click install. Otherwise points the
 * user to settings for manual config.
 */
function MissingEmulatorButton({ game }: { game: Game }): JSX.Element {
  const reload = useLibraryStore((s) => s.reload)
  const [suggestion, setSuggestion] = useState<{
    emulatorId: string
    emulatorName: string
  } | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    void window.api.emulator.suggestInstall(game.platform).then(setSuggestion)
  }, [game.platform])

  async function onInstall(): Promise<void> {
    if (!suggestion) return
    setInstalling(true)
    await window.api.system.autoInstallEmulator(
      suggestion.emulatorId as never,
      suggestion.emulatorName
    )
    setInstalling(false)
    await reload()
  }

  if (suggestion) {
    return (
      <button
        onClick={onInstall}
        disabled={installing}
        className="px-6 py-3 bg-accent text-ink-950 rounded-lg font-semibold flex items-center gap-2 hover:bg-accent/90 disabled:opacity-60 transition-all shadow-[0_0_30px_rgba(94,234,212,0.45)]"
      >
        {installing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {installing ? `Instalando ${suggestion.emulatorName}…` : `Instalar ${suggestion.emulatorName}`}
      </button>
    )
  }

  return (
    <Link
      to="/settings"
      className="px-6 py-3 bg-rose-500 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-rose-400 transition-colors"
    >
      <Lock className="w-4 h-4" /> Configurar emulador
    </Link>
  )
}

/**
 * One-click extraction for compressed-archive games (.7z/.zip/.rar). Spawns
 * 7zr.exe (downloaded on demand) and rewrites game.path to the extracted ISO.
 * Big archives can take a minute — we show a spinner and disable the button.
 */
function ExtractArchiveButton({ game }: { game: Game }): JSX.Element {
  const reload = useLibraryStore((s) => s.reload)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onExtract(): Promise<void> {
    setBusy(true)
    setError(null)
    const r = await window.api.library.extractArchive(game.id)
    setBusy(false)
    if ('error' in r) {
      setError(r.error)
    } else {
      await reload()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={onExtract}
        disabled={busy}
        className="px-6 py-3 bg-accent text-ink-950 rounded-lg font-semibold flex items-center gap-2 hover:bg-accent/90 disabled:opacity-60 transition-all shadow-[0_0_30px_rgba(94,234,212,0.45)]"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {busy ? 'Extraindo… (pode demorar)' : 'Extrair archive'}
      </button>
      {error && <div className="text-xs text-rose-300 max-w-sm">{error}</div>}
    </div>
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

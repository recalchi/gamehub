import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  Disc,
  Eye,
  EyeOff,
  Gamepad2,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Store
} from 'lucide-react'
import type { DiscordRpcStatus } from '@shared/types'
import { useLibraryStore } from '../store/library'
import { M } from '../motion/tokens'

/**
 * Hub for external integrations — Steam, Discord, RPCS3 firmware, etc.
 *
 * Every integration shows the same anatomy: name, status dot, "what this
 * does" line, "what it does NOT access" line (privacy-first messaging), and
 * a primary action. Three states map to colors:
 *   ● gray   — not configured
 *   ● green  — connected/active
 *   ● amber  — configured but errored
 */

type State = 'idle' | 'ok' | 'warning' | 'error'

const STATE_COLOR: Record<State, string> = {
  idle: 'bg-slate-500',
  ok: 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]',
  warning: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]',
  error: 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.7)]'
}

const STATE_LABEL: Record<State, string> = {
  idle: 'Não configurado',
  ok: 'Conectado',
  warning: 'Atenção',
  error: 'Erro'
}

export default function IntegrationsPanel(): JSX.Element {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={M.page}
      className="space-y-4"
    >
      <SteamCard />
      <EpicCard />
      <RiotCard />
      <DiscordCard />
      <SteamGridDbCard />
      <Ps3FirmwareCard />
    </motion.section>
  )
}

// ─────────────────────────── Riot ─────────────────────────────

function RiotCard(): JSX.Element {
  const reload = useLibraryStore((s) => s.reload)
  const games = useLibraryStore((s) => s.games)
  const riotCount = games.filter((g) => g.flags?.includes('riot')).length
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ added: number; updated: number } | null>(null)

  async function importNow(): Promise<void> {
    setBusy(true)
    setResult(null)
    const r = await window.api.system.importRiot()
    setResult(r)
    await reload()
    setBusy(false)
  }

  const state: State = riotCount > 0 ? 'ok' : 'idle'

  return (
    <IntegrationCard
      icon={Gamepad2}
      title="Riot Games"
      state={state}
      summary="Detecta League of Legends, VALORANT, LoR e 2XKO em C:\\Riot Games e roots configurados. Launch via Riot Client."
      privacyNote="Sem login. Sem API. Apenas leitura das pastas locais."
      meta={
        riotCount > 0
          ? `${riotCount} título${riotCount === 1 ? '' : 's'} Riot importado${riotCount === 1 ? '' : 's'}.`
          : 'Nenhum jogo Riot detectado ainda.'
      }
      action={
        <button
          onClick={importNow}
          disabled={busy}
          className="px-3 py-2 bg-accent text-ink-950 text-xs rounded-md flex items-center gap-1.5 font-semibold hover:bg-accent/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {riotCount > 0 ? 'Re-importar' : 'Importar agora'}
        </button>
      }
      footer={
        result && (
          <p className="text-xs text-emerald-300 mt-2">
            +{result.added} novo(s), {result.updated} atualizado(s).
          </p>
        )
      }
    />
  )
}

// ─────────────────────────── Epic ─────────────────────────────

function EpicCard(): JSX.Element {
  const settings = useLibraryStore((s) => s.settings)
  const saveSettings = useLibraryStore((s) => s.saveSettings)
  const reload = useLibraryStore((s) => s.reload)
  const games = useLibraryStore((s) => s.games)
  const epicCount = games.filter((g) => g.flags?.includes('epic')).length
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ found: number; added: number; updated: number; removedDuplicates: number } | null>(null)

  if (!settings) return <></>

  async function importNow(): Promise<void> {
    setBusy(true)
    setResult(null)
    const r = await window.api.system.importEpic()
    setResult(r)
    await reload()
    setBusy(false)
  }

  async function toggleEnabled(): Promise<void> {
    if (!settings) return
    await saveSettings({ epic: { ...settings.epic, enabled: !settings.epic.enabled } })
  }

  const state: State = !settings.epic.enabled
    ? 'idle'
    : epicCount > 0
      ? 'ok'
      : 'idle'

  return (
    <IntegrationCard
      icon={Store}
      title="Epic Games"
      state={state}
      summary="Lê manifestos locais do Epic Games Launcher (.item, LauncherInstalled.dat, pastas .egstore). Jogos abrem pelo próprio Epic."
      privacyNote="Sem login, sem API web. Só lê arquivos que o launcher já mantém no disco."
      meta={
        epicCount > 0
          ? `${epicCount} jogo${epicCount === 1 ? '' : 's'} Epic importado${epicCount === 1 ? '' : 's'}.`
          : 'Nenhum jogo Epic importado ainda.'
      }
      action={
        <button
          onClick={importNow}
          disabled={busy || !settings.epic.enabled}
          className="px-3 py-2 bg-accent text-ink-950 text-xs rounded-md flex items-center gap-1.5 font-semibold hover:bg-accent/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {epicCount > 0 ? 'Re-importar' : 'Importar agora'}
        </button>
      }
      footer={
        <div className="mt-3 space-y-2">
          <label className="flex items-center justify-between gap-3 text-xs text-slate-200 cursor-pointer">
            <span>Ativar integração Epic Games</span>
            <button
              type="button"
              onClick={toggleEnabled}
              className={`w-10 h-6 rounded-full transition-colors ${settings.epic.enabled ? 'bg-accent' : 'bg-white/10'}`}
            >
              <motion.span
                animate={{ x: settings.epic.enabled ? 18 : 2 }}
                transition={M.micro}
                className="block w-5 h-5 rounded-full bg-white shadow-md"
              />
            </button>
          </label>
          {result && (
            <p className="text-xs text-emerald-300">
              {result.found} encontrado(s), +{result.added} adicionado(s), {result.updated} atualizado(s),{' '}
              {result.removedDuplicates} duplicado(s) removido(s).
            </p>
          )}
        </div>
      }
    />
  )
}

// ─────────────────────── SteamGridDB ──────────────────────────

function SteamGridDbCard(): JSX.Element {
  const settings = useLibraryStore((s) => s.settings)
  const saveSettings = useLibraryStore((s) => s.saveSettings)
  const sgdb = settings?.steamGridDb
  const [draftKey, setDraftKey] = useState(sgdb?.apiKey ?? '')
  const [revealing, setRevealing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    setDraftKey(sgdb?.apiKey ?? '')
  }, [sgdb?.apiKey])

  if (!sgdb) return <></>

  const state: State = !sgdb.enabled
    ? 'idle'
    : !sgdb.apiKey
      ? 'warning'
      : testResult?.ok === false
        ? 'error'
        : 'ok'

  async function saveDraft(): Promise<void> {
    if (!sgdb) return
    if (draftKey === sgdb.apiKey) return
    await saveSettings({ steamGridDb: { ...sgdb, apiKey: draftKey.trim() } })
  }

  async function toggle(): Promise<void> {
    if (!sgdb) return
    await saveSettings({ steamGridDb: { ...sgdb, enabled: !sgdb.enabled } })
  }

  async function test(): Promise<void> {
    setTesting(true)
    await saveDraft()
    const r = await window.api.system.testSteamGridDb()
    setTestResult(
      'ok' in r
        ? { ok: true, message: r.sample ? `Conectado — exemplo: "${r.sample}"` : 'Conectado.' }
        : { ok: false, message: r.error }
    )
    setTesting(false)
  }

  return (
    <IntegrationCard
      icon={ImageIcon}
      title="SteamGridDB"
      state={state}
      summary="Fonte alternativa de capas — preenche o que libretro não cobre (PS4, Switch, indies modernos)."
      privacyNote="Sem cadastro de conta — só sua API key pessoal. Requests vão a steamgriddb.com."
      meta={!sgdb.apiKey ? 'Configure sua API key abaixo.' : 'Pronto pra buscar capas.'}
      action={
        <button
          onClick={test}
          disabled={testing || !sgdb.enabled || !draftKey}
          className="px-3 py-2 bg-white/5 hover:bg-white/10 text-xs rounded-md flex items-center gap-1.5 disabled:opacity-50"
        >
          {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
          Testar
        </button>
      }
      footer={
        <div className="mt-3 space-y-3">
          <label className="flex items-center justify-between gap-3 text-xs text-slate-200 cursor-pointer">
            <span>Ativar como fallback de capas</span>
            <button
              type="button"
              onClick={toggle}
              className={`w-10 h-6 rounded-full transition-colors ${sgdb.enabled ? 'bg-accent' : 'bg-white/10'}`}
            >
              <motion.span
                animate={{ x: sgdb.enabled ? 18 : 2 }}
                transition={M.micro}
                className="block w-5 h-5 rounded-full bg-white shadow-md"
              />
            </button>
          </label>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">API Key</label>
            <div className="relative flex-1">
              <input
                type={revealing ? 'text' : 'password'}
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                onBlur={saveDraft}
                placeholder="cole aqui sua key SteamGridDB"
                className="w-full bg-ink-800 border border-white/10 rounded-md px-3 py-1.5 text-sm font-mono text-slate-100 focus:border-accent focus:outline-none pr-10"
              />
              <button
                type="button"
                onClick={() => setRevealing((r) => !r)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100"
              >
                {revealing ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              Crie uma key grátis em{' '}
              <button
                onClick={() => window.api.system.openExternal('https://www.steamgriddb.com/profile/preferences/api')}
                className="text-accent hover:underline"
              >
                steamgriddb.com/profile/preferences/api
              </button>
              .
            </p>
          </div>
          {testResult && (
            <p className={`text-xs ${testResult.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
              {testResult.message}
            </p>
          )}
        </div>
      }
    />
  )
}

// ─────────────────────────── Steam ────────────────────────────

function SteamCard(): JSX.Element {
  const reload = useLibraryStore((s) => s.reload)
  const games = useLibraryStore((s) => s.games)
  const steamCount = games.filter(
    (g) => g.path?.startsWith('steam://') || g.flags?.includes('steam')
  ).length
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ added: number; updated: number } | null>(null)

  async function importNow(): Promise<void> {
    setBusy(true)
    setResult(null)
    const r = await window.api.system.importSteam()
    setResult(r)
    await reload()
    setBusy(false)
  }

  const state: State = steamCount > 0 ? 'ok' : 'idle'

  return (
    <IntegrationCard
      icon={Gamepad2}
      title="Steam"
      state={state}
      summary="Lê manifestos locais (libraryfolders.vdf + appmanifest_*.acf) e lança jogos pelo próprio Steam via URI."
      privacyNote="Não usa API web. Não envia credenciais. Não lê conta nem amigos."
      meta={
        steamCount > 0
          ? `${steamCount} jogo${steamCount === 1 ? '' : 's'} importado${steamCount === 1 ? '' : 's'}.`
          : 'Nenhum jogo importado ainda.'
      }
      action={
        <button
          onClick={importNow}
          disabled={busy}
          className="px-3 py-2 bg-accent text-ink-950 text-xs rounded-md flex items-center gap-1.5 font-semibold hover:bg-accent/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {steamCount > 0 ? 'Re-importar' : 'Importar agora'}
        </button>
      }
      footer={
        result && (
          <p className="text-xs text-emerald-300 mt-2">
            +{result.added} novo(s), {result.updated} atualizado(s).
          </p>
        )
      }
    />
  )
}

// ─────────────────────────── Discord ──────────────────────────

function DiscordCard(): JSX.Element {
  const settings = useLibraryStore((s) => s.settings)
  const saveSettings = useLibraryStore((s) => s.saveSettings)
  const discord = settings?.discord
  const [status, setStatus] = useState<DiscordRpcStatus | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [validating, setValidating] = useState(false)
  const [draftClientId, setDraftClientId] = useState(discord?.clientId ?? '')

  useEffect(() => {
    setDraftClientId(discord?.clientId ?? '')
  }, [discord?.clientId])

  useEffect(() => {
    void window.api.discord.status().then(setStatus)
  }, [discord?.enabled, discord?.clientId])

  if (!discord) return <></>

  const state: State =
    !discord.enabled
      ? 'idle'
      : status?.lastHandshake === 'ok'
        ? 'ok'
        : status?.lastHandshake === 'invalid-client-id' || status?.lastHandshake === 'discord-not-running'
          ? 'warning'
          : status?.lastError
            ? 'error'
            : 'idle'

  const statusText =
    !discord.enabled
      ? 'Desligado'
      : status?.lastHandshake === 'ok'
        ? `Publicando "${status.lastActivity ?? 'idle'}"`
        : status?.lastHandshake === 'invalid-client-id'
          ? 'Client ID inválido — confira o valor abaixo.'
          : status?.lastHandshake === 'discord-not-running'
            ? 'Discord não está rodando ou não expõe o pipe IPC.'
            : status?.lastError ?? 'Aguardando handshake…'

  async function saveDraft(): Promise<void> {
    if (!discord) return
    if (draftClientId === discord.clientId) return
    await saveSettings({ discord: { ...discord, clientId: draftClientId.trim() } })
  }

  async function toggleEnabled(): Promise<void> {
    if (!discord) return
    await saveSettings({ discord: { ...discord, enabled: !discord.enabled } })
  }

  async function validate(): Promise<void> {
    setValidating(true)
    await saveDraft()
    const r = await window.api.discord.validate()
    setStatus(r)
    setValidating(false)
  }

  return (
    <IntegrationCard
      icon={MessageSquare}
      title="Discord Rich Presence"
      state={state}
      summary={`Publica "Jogando X" no seu Discord via named pipe local (\\\\.\\pipe\\discord-ipc-N).`}
      privacyNote="Não lê mensagens. Não autentica conta. Não envia nada além da presença."
      meta={statusText}
      action={
        <button
          onClick={validate}
          disabled={validating || !discord.enabled}
          className="px-3 py-2 bg-white/5 hover:bg-white/10 text-xs rounded-md flex items-center gap-1.5 disabled:opacity-50"
        >
          {validating ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Link2 className="w-3 h-3" />
          )}
          Testar
        </button>
      }
      footer={
        <div className="mt-3 space-y-3">
          <label className="flex items-center justify-between gap-3 text-xs text-slate-200 cursor-pointer">
            <span>Ativar Rich Presence</span>
            <button
              type="button"
              onClick={toggleEnabled}
              className={`w-10 h-6 rounded-full transition-colors ${discord.enabled ? 'bg-accent' : 'bg-white/10'}`}
            >
              <motion.span
                animate={{ x: discord.enabled ? 18 : 2 }}
                transition={M.micro}
                className="block w-5 h-5 rounded-full bg-white shadow-md"
              />
            </button>
          </label>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Application Client ID</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={revealing ? 'text' : 'password'}
                  value={draftClientId}
                  onChange={(e) => setDraftClientId(e.target.value)}
                  onBlur={saveDraft}
                  placeholder="123456789012345678"
                  className="w-full bg-ink-800 border border-white/10 rounded-md px-3 py-1.5 text-sm font-mono text-slate-100 focus:border-accent focus:outline-none pr-10"
                />
                <button
                  type="button"
                  onClick={() => setRevealing((r) => !r)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100"
                  aria-label={revealing ? 'Esconder' : 'Mostrar'}
                >
                  {revealing ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              Crie em{' '}
              <button
                onClick={() => window.api.system.openExternal('https://discord.com/developers/applications')}
                className="text-accent hover:underline"
              >
                discord.com/developers/applications
              </button>{' '}
              → New Application → copie o Client ID.
            </p>
          </div>
        </div>
      }
    />
  )
}

// ──────────────────────── PS3 firmware ────────────────────────

function Ps3FirmwareCard(): JSX.Element {
  const emulators = useLibraryStore((s) => s.emulators)
  const rpcs3 = emulators.find((e) => e.id === 'rpcs3')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function install(): Promise<void> {
    setBusy(true)
    setResult(null)
    const r = await window.api.emulator.installPs3Firmware()
    setResult('ok' in r ? `Iniciando RPCS3 com ${r.pup.split(/[\\/]/).pop()}` : r.error)
    setBusy(false)
  }

  const state: State = rpcs3 ? 'idle' : 'warning'

  return (
    <IntegrationCard
      icon={Disc}
      title="Firmware PS3 (RPCS3)"
      state={state}
      summary="Detecta PS3UPDAT.PUP em <RPCS3>/bios/, /firmware/ ou Downloads e abre o instalador do RPCS3."
      privacyNote="Você fornece o firmware. GameHub nunca baixa BIOS/firmware proprietário."
      meta={rpcs3 ? `RPCS3 em ${rpcs3.installPath}` : 'RPCS3 não detectado. Instale ou aponte em Emuladores.'}
      action={
        <button
          onClick={install}
          disabled={busy || !rpcs3}
          className="px-3 py-2 bg-indigo-500/90 hover:bg-indigo-400 text-white text-xs rounded-md flex items-center gap-1.5 disabled:opacity-50 font-semibold"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Disc className="w-3 h-3" />}
          Instalar firmware
        </button>
      }
      footer={
        result && (
          <p className={`text-xs mt-2 ${result.includes('Iniciando') ? 'text-emerald-300' : 'text-rose-300'}`}>
            {result}
          </p>
        )
      }
    />
  )
}

// ───────────────────────── shared card ────────────────────────

function IntegrationCard({
  icon: Icon,
  title,
  state,
  summary,
  privacyNote,
  meta,
  action,
  footer
}: {
  icon: typeof Gamepad2
  title: string
  state: State
  summary: string
  privacyNote: string
  meta?: string
  action?: React.ReactNode
  footer?: React.ReactNode
}): JSX.Element {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={M.micro}
      className="glass rounded-2xl p-5 border border-white/5 hover:border-white/10"
    >
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
          <Icon className="w-5 h-5 text-slate-200" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full ${STATE_COLOR[state]}`} aria-hidden />
              <h3 className="font-semibold text-base">{title}</h3>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
                {STATE_LABEL[state]}
              </span>
            </div>
            {action}
          </div>
          <p className="text-sm text-slate-300 mt-2 leading-relaxed">{summary}</p>
          <p className="text-[11px] text-emerald-200/70 mt-1.5 flex items-start gap-1.5">
            <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{privacyNote}</span>
          </p>
          {meta && (
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span className="truncate">{meta}</span>
            </p>
          )}
          {footer}
        </div>
      </div>
    </motion.div>
  )
}

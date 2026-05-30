import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { settingsVariants } from '../motion/tokens'
import { Activity, Cable, CheckCircle2, Folder, RefreshCw, Save, Trash2, Wrench, XCircle } from 'lucide-react'
import { useLibraryStore } from '../store/library'
import { EMULATOR_LIST } from '@shared/emulators'
import type {
  DiscordRpcStatus,
  DisplayInfo,
  DisplayTarget,
  GameBackgroundPreset,
  GameLaunchPreset,
  UiSoundSettings
} from '@shared/types'
import LogViewer from '../components/LogViewer'
import AboutPanel from '../components/AboutPanel'
import AccentPicker from '../components/AccentPicker'
import BackupPanel from '../components/BackupPanel'
import HealthPanel from '../components/HealthPanel'
import IntegrationsPanel from '../components/IntegrationsPanel'
import SettingField from '../components/SettingField'
import SettingsField from '../components/SettingsField'
import SettingsNav, { type SettingsSection } from '../components/SettingsNav'
import {
  Activity as ActivityIcon,
  Cpu,
  FolderOpen,
  Info,
  MonitorPlay,
  Music,
  Plug,
  Search as SearchIcon
} from 'lucide-react'

const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'about', label: 'Sobre', icon: Info },
  { id: 'folders', label: 'Pastas', icon: FolderOpen },
  { id: 'emulators', label: 'Emuladores', icon: Cpu },
  { id: 'launch', label: 'Abertura de jogos', icon: MonitorPlay },
  { id: 'appearance', label: 'Aparência', icon: Music },
  { id: 'sounds', label: 'Sons da UI', icon: Music },
  { id: 'performance', label: 'Desempenho', icon: ActivityIcon },
  { id: 'system', label: 'Sistema', icon: SearchIcon },
  { id: 'integrations', label: 'Integrações', icon: Plug }
]

const BACKGROUND_PRESETS: Array<{ id: GameBackgroundPreset; label: string; description: string }> =
  [
    { id: 'soft', label: 'Suave', description: 'Mais discreto' },
    { id: 'cinema', label: 'Cinema', description: 'Equilibrado' },
    { id: 'vibrant', label: 'Vibrante', description: 'Mais forte' }
  ]

const LAUNCH_PRESETS: Array<{
  id: GameLaunchPreset
  label: string
  description: string
  fullscreenGames: boolean
  minimizeGameHubOnLaunch: boolean
  gameHubDisplay: DisplayTarget
  gameDisplay: DisplayTarget
}> = [
  {
    id: 'monitor',
    label: 'Monitor',
    description: 'Jogo em tela cheia e GameHub visivel para diagnostico',
    fullscreenGames: true,
    minimizeGameHubOnLaunch: false,
    gameHubDisplay: 'secondary',
    gameDisplay: 'primary'
  },
  {
    id: 'console',
    label: 'Console',
    description: 'Jogo em tela cheia e GameHub minimizado durante a sessao',
    fullscreenGames: true,
    minimizeGameHubOnLaunch: true,
    gameHubDisplay: 'current',
    gameDisplay: 'primary'
  },
  {
    id: 'desktop',
    label: 'Desktop',
    description: 'Nao forca tela cheia; bom para testes e jogos em janela',
    fullscreenGames: false,
    minimizeGameHubOnLaunch: false,
    gameHubDisplay: 'current',
    gameDisplay: 'current'
  }
]

const SOUND_PRESETS: Array<{
  label: string
  description: string
  sounds: UiSoundSettings
}> = [
  {
    label: 'Console',
    description: 'Feedback completo e volume medio',
    sounds: {
      enabled: true,
      volume: 0.42,
      navigation: true,
      confirm: true,
      back: true,
      toggle: true,
      launch: true
    }
  },
  {
    label: 'Discreto',
    description: 'So acoes principais, baixo volume',
    sounds: {
      enabled: true,
      volume: 0.24,
      navigation: false,
      confirm: true,
      back: true,
      toggle: true,
      launch: true
    }
  },
  {
    label: 'Mudo',
    description: 'Sem sons na interface',
    sounds: {
      enabled: false,
      volume: 0,
      navigation: false,
      confirm: false,
      back: false,
      toggle: false,
      launch: false
    }
  }
]

export default function Settings(): JSX.Element {
  const settings = useLibraryStore((s) => s.settings)
  const emulators = useLibraryStore((s) => s.emulators)
  const saveSettings = useLibraryStore((s) => s.saveSettings)
  const scan = useLibraryStore((s) => s.scan)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])

  useEffect(() => {
    void window.api.system.displays().then(setDisplays)
  }, [])

  if (!settings) return <div className="p-12 text-slate-400">Carregando...</div>

  async function addGameRoot(): Promise<void> {
    const folder = await window.api.system.pickFolder()
    if (!folder || !settings) return
    if (settings.gameRoots.includes(folder)) return
    await saveSettings({ gameRoots: [...settings.gameRoots, folder] })
  }
  async function removeGameRoot(p: string): Promise<void> {
    if (!settings) return
    await saveSettings({ gameRoots: settings.gameRoots.filter((r) => r !== p) })
  }
  async function addEmulatorRoot(): Promise<void> {
    const folder = await window.api.system.pickFolder()
    if (!folder || !settings) return
    if (settings.emulatorRoots.includes(folder)) return
    await saveSettings({ emulatorRoots: [...settings.emulatorRoots, folder] })
  }
  async function removeEmulatorRoot(p: string): Promise<void> {
    if (!settings) return
    await saveSettings({ emulatorRoots: settings.emulatorRoots.filter((r) => r !== p) })
  }
  async function setEmulatorOverride(id: import('@shared/types').EmulatorId): Promise<void> {
    const exe = await window.api.system.pickFile([
      { name: 'Executável', extensions: ['exe'] }
    ])
    if (!exe || !settings) return
    await window.api.emulator.setOverride(id, exe)
    const next = await window.api.settings.get()
    await saveSettings(next)
  }
  async function runScan(): Promise<void> {
    setBusy(true)
    setMsg('Escaneando...')
    const r = await scan({ fresh: true })
    setMsg(`Encontrados ${r.games.length} jogos e ${r.emulators.length} emuladores.`)
    setBusy(false)
  }

  return (
    <motion.div
      variants={settingsVariants}
      initial="initial"
      animate="enter"
      exit="exit"
      className="flex gap-6 px-8 py-12 max-w-6xl"
    >
      <SettingsNav sections={SETTINGS_SECTIONS} />

      <div className="flex-1 min-w-0 max-w-3xl">
        <h1 className="text-3xl font-display font-bold mb-2">Configurações</h1>
        <p className="text-slate-400 mb-10">
          Caminhos, emuladores, scanner e aparência. As mudanças são salvas automaticamente.
        </p>

        <section id="about" className="scroll-mt-20 mb-6">
          <AboutPanel />
        </section>

      <section id="folders" className="glass rounded-2xl p-6 mb-6 scroll-mt-20">
        <h2 className="font-display font-semibold text-lg mb-1">Pastas de jogos</h2>
        <p className="text-slate-400 text-xs mb-4">
          Diretórios escaneados em busca de ROMs, ISOs, jogos em pasta e arquivos comprimidos.
        </p>
        <ul className="space-y-2 mb-3">
          {settings.gameRoots.map((p) => (
            <li
              key={p}
              className="flex items-center justify-between bg-ink-800 rounded-lg px-3 py-2"
            >
              <code className="text-sm text-slate-300 truncate">{p}</code>
              <button
                onClick={() => removeGameRoot(p)}
                className="text-rose-400 hover:text-rose-300"
                title="Remover"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={addGameRoot}
          className="text-sm flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg"
        >
          <Folder className="w-4 h-4" /> Adicionar pasta
        </button>
      </section>

      <section className="glass rounded-2xl p-6 mb-6 scroll-mt-20">
        <h2 className="font-display font-semibold text-lg mb-1">Pastas de emuladores</h2>
        <p className="text-slate-400 text-xs mb-4">
          O scanner procura executáveis conhecidos (pcsx2-qt.exe, rpcs3.exe, etc.) nestes locais.
        </p>
        <ul className="space-y-2 mb-3">
          {settings.emulatorRoots.map((p) => (
            <li
              key={p}
              className="flex items-center justify-between bg-ink-800 rounded-lg px-3 py-2"
            >
              <code className="text-sm text-slate-300 truncate">{p}</code>
              <button
                onClick={() => removeEmulatorRoot(p)}
                className="text-rose-400 hover:text-rose-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={addEmulatorRoot}
          className="text-sm flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg"
        >
          <Folder className="w-4 h-4" /> Adicionar pasta
        </button>
      </section>

      <section id="emulators" className="glass rounded-2xl p-6 mb-6 scroll-mt-20">
        <h2 className="font-display font-semibold text-lg mb-1">Emuladores</h2>
        <p className="text-slate-400 text-xs mb-4">
          Detectados automaticamente. Use "Localizar..." para forçar um caminho manual.
        </p>

        {/* Auto vs manual selection mode */}
        <div className="mb-5 rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
            Seleção de emulador
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([
              {
                id: 'auto' as const,
                label: 'Automático',
                desc: 'GameHub escolhe o melhor e troca sozinho se travar.'
              },
              {
                id: 'manual' as const,
                label: 'Manual',
                desc: 'Respeita sua escolha por jogo/plataforma. Sem fallback.'
              }
            ]).map((opt) => {
              const selected = (settings.emulatorSelection ?? 'auto') === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => void saveSettings({ emulatorSelection: opt.id })}
                  className={`rounded-lg border px-3 py-2 text-left transition-all ${
                    selected
                      ? 'border-accent bg-accent/15 text-white shadow-glow'
                      : 'border-white/5 bg-white/[0.03] text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              )
            })}
          </div>
        </div>
        <div className="space-y-2">
          {EMULATOR_LIST.map((def) => {
            const found = emulators.find((e) => e.id === def.id)
            return (
              <div
                key={def.id}
                className="flex items-center gap-3 bg-ink-800 rounded-lg px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{def.name}</span>
                    {found ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-300 uppercase tracking-wider">
                        {found.source === 'manual' ? 'Manual' : 'Auto'}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/30 text-slate-300 uppercase">
                        Não encontrado
                      </span>
                    )}
                  </div>
                  {found && (
                    <div className="text-xs text-slate-500 truncate font-mono mt-0.5">
                      {found.executable}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setEmulatorOverride(def.id)}
                  className="text-xs px-2 py-1 bg-white/5 hover:bg-white/10 rounded-md flex items-center gap-1"
                >
                  <Wrench className="w-3 h-3" /> Localizar…
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section id="launch" className="glass rounded-2xl p-6 mb-6 scroll-mt-20">
        <h2 className="font-display font-semibold text-lg mb-1">Abertura dos jogos</h2>
        <p className="text-slate-400 text-xs mb-4">
          Presets para iniciar jogos em tela cheia e decidir se o GameHub fica aberto no outro monitor.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {LAUNCH_PRESETS.map((preset) => {
            const selected = settings.launch.preset === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  saveSettings({
                    launch: {
                      ...settings.launch,
                      preset: preset.id,
                      fullscreenGames: preset.fullscreenGames,
                      minimizeGameHubOnLaunch: preset.minimizeGameHubOnLaunch,
                      gameHubDisplay: preset.gameHubDisplay,
                      gameDisplay: preset.gameDisplay,
                      moveGameWindowAfterLaunch: true
                    }
                  })
                }
                className={`rounded-lg border px-3 py-2 text-left transition-all ${
                  selected
                    ? 'border-accent bg-accent/15 text-white shadow-glow'
                    : 'border-white/5 bg-white/[0.03] text-slate-300 hover:bg-white/10'
                }`}
              >
                <div className="text-sm font-semibold">{preset.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{preset.description}</div>
              </button>
            )
          })}
        </div>
        <div className="mt-4 border-t border-white/5 pt-3">
          <Toggle
            label="Forcar jogos em tela cheia quando o emulador permite"
            checked={settings.launch.fullscreenGames}
            onChange={(v) =>
              saveSettings({
                launch: { ...settings.launch, preset: 'monitor', fullscreenGames: v }
              })
            }
          />
          <Toggle
            label="Minimizar GameHub depois de iniciar o jogo"
            checked={settings.launch.minimizeGameHubOnLaunch}
            onChange={(v) =>
              saveSettings({
                launch: { ...settings.launch, preset: 'monitor', minimizeGameHubOnLaunch: v }
              })
            }
          />
          <Toggle
            label="Restaurar GameHub quando o jogo fechar"
            checked={settings.launch.restoreGameHubAfterExit}
            onChange={(v) =>
              saveSettings({
                launch: { ...settings.launch, restoreGameHubAfterExit: v }
              })
            }
          />
          <Toggle
            label="Tentar mover janela do jogo/emulador para o monitor escolhido"
            checked={settings.launch.moveGameWindowAfterLaunch}
            onChange={(v) =>
              saveSettings({
                launch: { ...settings.launch, moveGameWindowAfterLaunch: v }
              })
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            <DisplaySetting
              label="Tela do GameHub ao iniciar jogo"
              value={settings.launch.gameHubDisplay}
              displays={displays}
              onChange={(v) => {
                void saveSettings({ launch: { ...settings.launch, gameHubDisplay: v } })
                if (v !== 'current') void window.api.system.moveToDisplay(v)
              }}
            />
            <DisplaySetting
              label="Tela do jogo/emulador"
              value={settings.launch.gameDisplay}
              displays={displays}
              onChange={(v) =>
                saveSettings({ launch: { ...settings.launch, gameDisplay: v } })
              }
            />
          </div>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Steam e alguns jogos nativos seguem as opcoes internas do proprio jogo. Quando o GameHub tem PID do emulador, tenta reposicionar a janela no monitor escolhido.
        </p>
      </section>

      <section id="appearance" className="glass rounded-2xl p-6 mb-6 scroll-mt-20">
        <h2 className="font-display font-semibold text-lg mb-3">Aparência & inicialização</h2>
        <AccentPicker />
        <div className="border-t border-white/5 pt-3">
          <SettingField.Toggle
            label="Fundos dinâmicos por jogo"
            description="Usa a cor da capa do jogo focado como backdrop da página."
            checked={settings.appearance.dynamicGameBackgrounds}
            onChange={(v) =>
              saveSettings({ appearance: { ...settings.appearance, dynamicGameBackgrounds: v } })
            }
          />
          {settings.appearance.dynamicGameBackgrounds && (
            <div className="grid grid-cols-3 gap-2 py-3">
              {BACKGROUND_PRESETS.map((preset) => {
                const selected = settings.appearance.gameBackgroundPreset === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      saveSettings({
                        appearance: { ...settings.appearance, gameBackgroundPreset: preset.id }
                      })
                    }
                    className={`rounded-lg border px-3 py-2 text-left transition-all ${
                      selected
                        ? 'border-accent bg-accent/15 text-white shadow-glow'
                        : 'border-white/5 bg-white/[0.03] text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-sm font-semibold">{preset.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{preset.description}</div>
                  </button>
                )
              })}
            </div>
          )}
          <SettingField.Toggle
            label="Abrir em tela cheia"
            description="GameHub inicia maximizado ocupando todo o monitor."
            checked={settings.fullscreenOnStart}
            onChange={(v) => saveSettings({ fullscreenOnStart: v })}
          />
          <SettingField.Toggle
            label="Pular splash após primeira execução"
            description="Vai direto pra Home depois da primeira vez."
            checked={settings.skipSplash}
            onChange={(v) => saveSettings({ skipSplash: v })}
          />
          <SettingField.Toggle
            label="Splash mostra logs reais do processo principal"
            description="Troca as linhas de boot decorativas pelos eventos vindos do main."
            checked={settings.appearance.showRealBootLogs ?? false}
            onChange={(v) =>
              saveSettings({ appearance: { ...settings.appearance, showRealBootLogs: v } })
            }
          />
          <div className="flex items-start justify-between gap-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-slate-100 font-medium">Animações</div>
              <div className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">
                Controle a intensidade das transições. "Sistema" segue a preferência do Windows /
                macOS; "Reduzir" minimiza tudo (acessibilidade vestibular).
              </div>
            </div>
            <div className="shrink-0 inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
              {(['system', 'never', 'always'] as const).map((mode) => {
                const active = (settings.appearance.reducedMotionMode ?? 'system') === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      saveSettings({
                        appearance: { ...settings.appearance, reducedMotionMode: mode }
                      })
                    }
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      active ? 'bg-accent/20 text-accent' : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {mode === 'system' ? 'Sistema' : mode === 'never' ? 'Completas' : 'Reduzir'}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="sounds" className="scroll-mt-20">
        <SoundInteractionsPanel />
      </section>

      <section id="discord-legacy" className="scroll-mt-20">
        <DiscordPresencePanel />
      </section>

      <section id="performance" className="glass rounded-2xl p-6 mb-6 scroll-mt-20">
        <h2 className="font-display font-semibold text-lg mb-1 flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent" /> Monitoramento de desempenho
        </h2>
        <p className="text-slate-400 text-xs mb-4">
          Coleta CPU, GPU, FPS, RAM do processo enquanto o jogo roda e gera um relatório final.
        </p>
        <SettingsField name="performance.enabled" />
        <SettingsField name="performance.showOnGameDetail" />
        <SettingsField name="performance.sampleIntervalMs" />
        <SettingsField name="performance.historySeconds" />
        <SettingsField name="performance.warnCpuPercent" />
        <SettingsField name="performance.warnMemoryMb" />
      </section>

      <section id="system" className="glass rounded-2xl p-6 mb-6 scroll-mt-20">
        <h2 className="font-display font-semibold text-lg mb-3">Scanner & Sistema</h2>
        <button
          onClick={runScan}
          disabled={busy}
          className="px-5 py-2.5 bg-accent text-ink-950 rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
          Re-escanear agora
        </button>
        {msg && (
          <p className="mt-3 text-sm text-accent flex items-center gap-2">
            <Save className="w-3 h-3" /> {msg}
          </p>
        )}
        <HealthPanel />
        <BackupPanel />
      </section>

        <section id="integrations" className="glass rounded-2xl p-6 mb-6 scroll-mt-20">
          <h2 className="font-display font-semibold text-lg mb-1 flex items-center gap-2">
            <Plug className="w-5 h-5 text-accent" /> Integrações
          </h2>
          <p className="text-slate-400 text-xs mb-4">
            Conexões com serviços externos. Tudo local, sem credenciais — privacidade-first.
          </p>
          <IntegrationsPanel />
        </section>

        <LogViewer />
      </div>
    </motion.div>
  )
}

function SoundInteractionsPanel(): JSX.Element {
  const settings = useLibraryStore((s) => s.settings)
  const saveSettings = useLibraryStore((s) => s.saveSettings)

  if (!settings) return <></>

  const sounds = settings.sounds

  function updateSound(patch: Partial<UiSoundSettings>): void {
    void saveSettings({ sounds: { ...sounds, ...patch } })
  }

  return (
    <section className="glass rounded-2xl p-6 mb-6">
      <h2 className="font-display font-semibold text-lg mb-1">Interacoes sonoras</h2>
      <p className="text-slate-400 text-xs mb-4">
        Efeitos curtos estilo console para botoes, foco, alternancias e inicio de jogos.
      </p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {SOUND_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => void saveSettings({ sounds: preset.sounds })}
            className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-left text-slate-300 transition-all hover:bg-white/10 focus:border-accent"
          >
            <div className="text-sm font-semibold">{preset.label}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{preset.description}</div>
          </button>
        ))}
      </div>
      <div className="border-t border-white/5 pt-3">
        <SettingsField name="sounds.enabled" />
        <SettingsField name="sounds.volume" />
        <SettingsField name="sounds.navigation" />
        <SettingsField name="sounds.confirm" />
        <SettingsField name="sounds.back" />
        <SettingsField name="sounds.toggle" />
        <SettingsField name="sounds.launch" />
      </div>
    </section>
  )
}

function DiscordPresencePanel(): JSX.Element {
  const settings = useLibraryStore((s) => s.settings)
  const saveSettings = useLibraryStore((s) => s.saveSettings)
  const [status, setStatus] = useState<DiscordRpcStatus | null>(null)
  const [busy, setBusy] = useState(false)

  if (!settings) return <></>

  async function validate(): Promise<void> {
    setBusy(true)
    setStatus(await window.api.discord.validate())
    setBusy(false)
  }

  const ok = status?.connected
  const configured = settings.discord.clientId.trim().length > 0

  return (
    <section className="glass rounded-2xl p-6 mb-6">
      <h2 className="font-display font-semibold text-lg mb-1 flex items-center gap-2">
        <Cable className="w-5 h-5 text-accent" /> Discord Presence
      </h2>
      <p className="text-slate-400 text-xs mb-4">
        Mostra no Discord o jogo aberto pelo GameHub. Precisa de um Application ID valido do Discord Developer Portal.
      </p>
      <div>
        <SettingsField name="discord.enabled" />
        <SettingsField name="discord.showPlatform" />
        <SettingsField name="discord.clientId" />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void validate()}
            disabled={busy || !configured}
            className="px-4 py-2 bg-accent text-ink-950 rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            Validar Discord
          </button>
          {status && (
            <div
              className={`inline-flex items-center gap-2 text-sm ${
                ok ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {discordStatusText(status)}
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          No Discord, deixe ativo: Configuracoes de usuario &gt; Privacidade de atividade &gt; Compartilhar atividade atual.
        </p>
      </div>
    </section>
  )
}

function discordStatusText(status: DiscordRpcStatus): string {
  if (!status.enabled) return 'Desativado no GameHub.'
  if (!status.pipeFound) return 'Discord aberto nao encontrado.'
  if (status.connected) return 'Conectado. A presenca sera enviada ao iniciar um jogo.'
  if (status.lastHandshake === 'invalid-client-id') return 'Application ID invalido.'
  return status.lastError ?? 'Nao conectado.'
}

function VolumeSetting({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange: (value: number) => void
}): JSX.Element {
  const percent = Math.round(value * 100)
  return (
    <label className="block rounded-lg bg-white/[0.04] border border-white/5 px-3 py-2">
      <span className="text-[11px] uppercase tracking-widest text-slate-500">{label}</span>
      <div className="mt-2 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={2}
          value={percent}
          onChange={(e) => onChange(Number(e.currentTarget.value) / 100)}
          className="min-w-0 flex-1 accent-cyan-300"
        />
        <span className="w-10 text-right text-xs font-mono text-slate-300">{percent}%</span>
      </div>
    </label>
  )
}

function DisplaySetting({
  label,
  value,
  displays,
  onChange
}: {
  label: string
  value: DisplayTarget
  displays: DisplayInfo[]
  onChange: (value: DisplayTarget) => void
}): JSX.Element {
  const options: Array<[DisplayTarget, string]> = [
    ['current', 'Atual / nao mover'],
    ['primary', 'Monitor principal'],
    ['secondary', 'Segundo monitor']
  ]
  for (const display of displays.slice(0, 3)) {
    options.push([
      `display-${display.index + 1}` as DisplayTarget,
      `Monitor ${display.index + 1}${display.isPrimary ? ' (principal)' : ''}`
    ])
  }

  return (
    <label className="block rounded-lg bg-white/[0.04] border border-white/5 px-3 py-2">
      <span className="text-[11px] uppercase tracking-widest text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as DisplayTarget)}
        className="mt-1 w-full bg-ink-900 text-slate-100 outline-none text-sm"
      >
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer">
      <span className="text-sm text-slate-200">{label}</span>
      <button
        type="button"
        data-ui-sound="toggle"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-white/10'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </button>
    </label>
  )
}

function NumberSetting({
  label,
  value,
  suffix,
  min,
  max,
  step,
  onChange
}: {
  label: string
  value: number
  suffix: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <label className="block rounded-lg bg-white/[0.04] border border-white/5 px-3 py-2">
      <span className="text-[11px] uppercase tracking-widest text-slate-500">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const next = Number(e.currentTarget.value)
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)))
          }}
          className="min-w-0 flex-1 bg-transparent text-slate-100 font-mono outline-none"
        />
        <span className="text-xs text-slate-500">{suffix}</span>
      </div>
    </label>
  )
}

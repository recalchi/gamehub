import { useState } from 'react'
import { motion } from 'framer-motion'
import { Folder, RefreshCw, Save, Trash2, Wrench } from 'lucide-react'
import { useLibraryStore } from '../store/library'
import { EMULATOR_LIST } from '@shared/emulators'
import LogViewer from '../components/LogViewer'
import AboutPanel from '../components/AboutPanel'
import AccentPicker from '../components/AccentPicker'
import BackupPanel from '../components/BackupPanel'

export default function Settings(): JSX.Element {
  const settings = useLibraryStore((s) => s.settings)
  const emulators = useLibraryStore((s) => s.emulators)
  const saveSettings = useLibraryStore((s) => s.saveSettings)
  const scan = useLibraryStore((s) => s.scan)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="px-12 py-12 max-w-4xl"
    >
      <h1 className="text-3xl font-display font-bold mb-2">Configurações</h1>
      <p className="text-slate-400 mb-10">
        Caminhos, emuladores, scanner e aparência. As mudanças são salvas automaticamente.
      </p>

      <AboutPanel />

      <section className="glass rounded-2xl p-6 mb-6">
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

      <section className="glass rounded-2xl p-6 mb-6">
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

      <section className="glass rounded-2xl p-6 mb-6">
        <h2 className="font-display font-semibold text-lg mb-1">Emuladores</h2>
        <p className="text-slate-400 text-xs mb-4">
          Detectados automaticamente. Use "Localizar..." para forçar um caminho manual.
        </p>
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

      <section className="glass rounded-2xl p-6 mb-6">
        <h2 className="font-display font-semibold text-lg mb-3">Aparência & inicialização</h2>
        <div className="space-y-4">
          <AccentPicker />
          <div className="border-t border-white/5 pt-3 space-y-1">
            <Toggle
              label="Abrir em tela cheia"
              checked={settings.fullscreenOnStart}
              onChange={(v) => saveSettings({ fullscreenOnStart: v })}
            />
            <Toggle
              label="Pular splash após primeira execução"
              checked={settings.skipSplash}
              onChange={(v) => saveSettings({ skipSplash: v })}
            />
          </div>
        </div>
      </section>

      <section className="glass rounded-2xl p-6 mb-6">
        <h2 className="font-display font-semibold text-lg mb-3">Scanner</h2>
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
        <BackupPanel />
      </section>

      <LogViewer />
    </motion.div>
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

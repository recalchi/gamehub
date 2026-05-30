import { useCallback, useEffect, useRef, useState } from 'react'
import RouteTransition from '../components/RouteTransition'
import PageHeader from '../components/PageHeader'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Gamepad2,
  Keyboard,
  MonitorCog,
  RefreshCw,
  Save,
  Zap
} from 'lucide-react'
import { useLibraryStore } from '../store/library'
import type { ControllerDiagnostics, NativeControllerDevice } from '@shared/types'

interface PadSnapshot {
  index: number
  id: string
  connected: boolean
  mapping: string
  buttons: boolean[]
  axes: number[]
  /** strongest deflection magnitude across the first two axes — used to
   * highlight the controller the user is wiggling */
  activity: number
}

/**
 * Live gamepad inspection screen.
 *
 * Runs a 60fps polling loop while the page is mounted. Shows every gamepad
 * the browser exposes, with real-time button + axis state and a "test focus"
 * indicator that flashes when buttons are pressed. The user can pick a
 * preferred controller (saved to settings), adjust the deadzone, and toggle
 * A/B swap + Y-axis inversion.
 */
export default function Controllers(): JSX.Element {
  const settings = useLibraryStore((s) => s.settings)
  const save = useLibraryStore((s) => s.saveSettings)
  const [pads, setPads] = useState<PadSnapshot[]>([])
  const [diagnostics, setDiagnostics] = useState<ControllerDiagnostics | null>(null)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const raf = useRef<number | null>(null)
  const flashRef = useRef<Map<string, number>>(new Map())
  const [, force] = useState(0)

  const refreshNativeDiagnostics = useCallback(async (): Promise<void> => {
    setDiagnosticsLoading(true)
    try {
      setDiagnostics(await window.api.controllers.diagnostics())
    } finally {
      setDiagnosticsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshNativeDiagnostics()
  }, [refreshNativeDiagnostics])

  useEffect(() => {
    function poll(): void {
      const list = navigator.getGamepads ? navigator.getGamepads() : []
      const snap: PadSnapshot[] = []
      for (const p of list) {
        if (!p) continue
        const buttons = p.buttons.map((b) => b.pressed)
        const axes = Array.from(p.axes)
        const activity = Math.max(Math.abs(axes[0] ?? 0), Math.abs(axes[1] ?? 0))
        snap.push({
          index: p.index,
          id: p.id,
          connected: p.connected,
          mapping: p.mapping,
          buttons,
          axes,
          activity
        })

        // Flash any button that's currently pressed (for the visual indicator)
        buttons.forEach((b, i) => {
          if (b) flashRef.current.set(`${p.id}#${i}`, Date.now())
        })
      }
      setPads(snap)
      raf.current = requestAnimationFrame(poll)
    }
    raf.current = requestAnimationFrame(poll)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [])

  // Force re-render every 200ms so the flash decay animates cleanly
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 200)
    return () => clearInterval(t)
  }, [])

  if (!settings) return <div className="p-12 text-slate-400">Carregando…</div>

  const input = settings.input
  const selected = pads.find((p) => p.id === input.preferredGamepadId)

  return (
    <RouteTransition className="px-12 py-12 max-w-5xl">
      <PageHeader
        title="Controles"
        icon={Gamepad2}
        subtitle="Conecte um controle USB ou Bluetooth e pressione qualquer botão. O navegador detecta automaticamente. Para PS5/Switch Pro use modo XInput se possível."
      />

      <NativeDiagnosticsPanel
        diagnostics={diagnostics}
        loading={diagnosticsLoading}
        webGamepadCount={pads.length}
        onRefresh={refreshNativeDiagnostics}
      />

      {/* Detected pads */}
      <section className="glass rounded-2xl p-6 mb-6">
        <header className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg">Detectados</h2>
          <span className="text-xs text-slate-500 font-mono">{pads.length} controle(s)</span>
        </header>

        {pads.length === 0 ? (
          <div className="text-center text-slate-500 py-8 border border-dashed border-white/10 rounded-lg">
            <Gamepad2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhum controle detectado.</p>
            <p className="text-xs mt-1">
              Pressione um botão no controle pra ativar a detecção.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {pads.map((p) => (
              <PadCard
                key={p.id + p.index}
                pad={p}
                selected={p.id === input.preferredGamepadId}
                onSelect={() =>
                  save({
                    input: { ...input, preferredGamepadId: p.id }
                  })
                }
              />
            ))}
          </ul>
        )}

        <button
          onClick={() => {
            force((x) => x + 1)
            void refreshNativeDiagnostics()
          }}
          className="mt-4 text-xs flex items-center gap-1.5 text-slate-400 hover:text-white"
        >
          <RefreshCw className="w-3 h-3" /> Atualizar lista
        </button>
      </section>

      {/* Live tester for selected (or first) pad */}
      {pads.length > 0 && (
        <section className="glass rounded-2xl p-6 mb-6">
          <header className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent" /> Teste de input
            </h2>
            <span className="text-xs text-slate-500">
              {selected ? `Mostrando: ${truncate(selected.id, 40)}` : 'Mostrando: primeiro detectado'}
            </span>
          </header>
          <LiveTester pad={selected ?? pads[0]} />
        </section>
      )}

      {/* Preferences */}
      <section className="glass rounded-2xl p-6">
        <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
          <Save className="w-5 h-5 text-accent" /> Preferências
        </h2>

        <div className="space-y-5">
          <div>
            <label className="text-sm text-slate-200 flex items-center justify-between mb-1">
              <span>Deadzone do analógico</span>
              <span className="text-xs text-slate-500 font-mono">
                {(input.deadzone * 100).toFixed(0)}%
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={0.95}
              step={0.05}
              value={input.deadzone}
              onChange={(e) =>
                save({ input: { ...input, deadzone: parseFloat(e.target.value) } })
              }
              className="w-full accent-cyan-400"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Valores baixos respondem antes; valores altos exigem mais deflexão. Padrão 50%.
            </p>
          </div>

          <Toggle
            label="Inverter eixo Y"
            description="Stick para baixo navega para cima (estilo flight sim)."
            checked={input.invertY}
            onChange={(v) => save({ input: { ...input, invertY: v } })}
          />

          <Toggle
            label="Trocar A ⇄ B (layout PS)"
            description="Em controle de PlayStation, X confirma e ⃝ volta. Ative se confundir."
            checked={input.swapConfirmBack}
            onChange={(v) => save({ input: { ...input, swapConfirmBack: v } })}
          />
        </div>
      </section>
    </RouteTransition>
  )
}

function NativeDiagnosticsPanel({
  diagnostics,
  loading,
  webGamepadCount,
  onRefresh
}: {
  diagnostics: ControllerDiagnostics | null
  loading: boolean
  webGamepadCount: number
  onRefresh: () => Promise<void>
}): JSX.Element {
  const gameSirDevices = diagnostics?.devices.filter((device) =>
    /gamesir|vid_36ae|vid_3537/i.test(`${device.name} ${device.pnpDeviceId}`)
  )
  const xinputConnected = diagnostics?.xinput.some((slot) => slot.connected) ?? false
  const hidOnlyGameSir =
    (gameSirDevices?.length ?? 0) > 0 &&
    !xinputConnected &&
    gameSirDevices?.some((device) =>
      /keyboard|teclado|mouse|consumer control|wireless radio|vendor-defined/i.test(
        `${device.name} ${device.busReportedDescription ?? ''} ${device.pnpClass ?? ''}`
      )
    )
  const status = xinputConnected
    ? {
        icon: CheckCircle2,
        title: 'Controle pronto em XInput',
        detail: 'O Windows ja expos um controle compativel com jogos de PC.'
      }
    : hidOnlyGameSir
      ? {
          icon: Keyboard,
          title: 'GameSir em modo teclado/HID',
          detail:
            'O controle esta conectado, mas o GameHub nao consegue usar como gamepad ate trocar para XInput.'
        }
      : {
          icon: AlertTriangle,
          title: 'Aguardando controle em modo gamepad',
          detail: 'Pressione um botao, reconecte o cabo/dongle ou troque o modo do controle.'
        }
  const StatusIcon = status.icon
  const appCount = countGameSirApps(diagnostics)

  return (
    <section className="glass rounded-2xl p-6 mb-6 border border-white/5">
      <header className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 rounded-lg p-2 ${
              xinputConnected
                ? 'bg-emerald-400/15 text-emerald-300'
                : hidOnlyGameSir
                  ? 'bg-amber-400/15 text-amber-300'
                  : 'bg-white/10 text-slate-300'
            }`}
          >
            <StatusIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display font-semibold text-lg">{status.title}</h2>
            <p className="text-sm text-slate-400 mt-1">{status.detail}</p>
          </div>
        </div>
        <button
          onClick={() => void onRefresh()}
          className="shrink-0 inline-flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Diagnosticar
        </button>
      </header>

      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <Metric
          label="Gamepads no GameHub"
          value={String(webGamepadCount)}
          tone={webGamepadCount > 0 ? 'ok' : 'warn'}
        />
        <Metric
          label="XInput ativo"
          value={xinputConnected ? 'sim' : 'nao'}
          tone={xinputConnected ? 'ok' : 'warn'}
        />
        <Metric
          label="Apps GameSir"
          value={String(appCount)}
          tone={appCount > 0 ? 'ok' : 'warn'}
        />
      </div>

      {diagnostics?.issues.length ? (
        <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-4 mb-4">
          <div className="text-xs uppercase tracking-wider text-amber-200 mb-2">
            Ajuste recomendado
          </div>
          <ul className="space-y-1 text-sm text-amber-50/90">
            {diagnostics.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {diagnostics?.recommendations.length ? (
        <div className="space-y-1.5 text-sm text-slate-300 mb-4">
          {diagnostics.recommendations.map((recommendation) => (
            <p key={recommendation}>{recommendation}</p>
          ))}
        </div>
      ) : null}

      <div className="rounded-lg border border-white/5 bg-ink-800/70 p-4 mb-4">
        <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
          GameSir T4n Lite / Nova Lite
        </div>
        <div className="space-y-1.5 text-sm text-slate-300">
          <p>Para PC via dongle: desligue o controle, conecte o receptor USB e ligue com X + Home.</p>
          <p>Para cabo USB-C: use um cabo de dados; cabo apenas de carga pode deixar so a luz verde.</p>
          <p>O GameSir Connect nao suporta Nova Lite; use o app somente se o manual/firmware do seu lote indicar.</p>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <StoreButton label="GameSir Connect" productId="XPFMNZ2F440G2L" />
          <StoreButton label="GameSir Nexus" productId="9PMJKF5NSTDR" />
        </div>
      </div>

      {gameSirDevices && gameSirDevices.length > 0 ? (
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
            Dispositivo GameSir no Windows
          </div>
          <ul className="space-y-2">
            {gameSirDevices.map((device) => (
              <NativeDeviceRow key={device.pnpDeviceId} device={device} />
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-xs text-slate-500">
          Nenhum dispositivo GameSir identificado pelo diagnostico nativo.
        </div>
      )}
    </section>
  )
}

function Metric({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone: 'ok' | 'warn'
}): JSX.Element {
  return (
    <div className="rounded-lg bg-ink-800/70 border border-white/5 px-3 py-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div
        className={
          tone === 'ok' ? 'text-emerald-300 font-semibold' : 'text-amber-300 font-semibold'
        }
      >
        {value}
      </div>
    </div>
  )
}

function StoreButton({ label, productId }: { label: string; productId: string }): JSX.Element {
  return (
    <button
      onClick={() => window.api.system.openExternal(`ms-windows-store://pdp/?ProductId=${productId}`)}
      className="inline-flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-xs text-slate-200 hover:bg-white/10"
    >
      <ExternalLink className="w-3.5 h-3.5" />
      Abrir {label}
    </button>
  )
}

function NativeDeviceRow({ device }: { device: NativeControllerDevice }): JSX.Element {
  return (
    <li className="rounded-lg bg-ink-800/70 border border-white/5 px-3 py-3">
      <div className="flex items-start gap-3">
        <MonitorCog className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100 truncate">
            {device.busReportedDescription || device.name}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-1 break-all">
            {device.name} | {device.status} | {device.pnpClass ?? 'sem classe'} |{' '}
            {device.pnpDeviceId}
          </div>
        </div>
      </div>
    </li>
  )
}

function countGameSirApps(diagnostics: ControllerDiagnostics | null): number {
  return diagnostics?.companionApps.filter((app) => /gamesir/i.test(app.name)).length ?? 0
}

function PadCard({
  pad,
  selected,
  onSelect
}: {
  pad: PadSnapshot
  selected: boolean
  onSelect: () => void
}): JSX.Element {
  const anyPressed = pad.buttons.some((b) => b)
  return (
    <li
      className={`rounded-lg px-3 py-3 border transition-all ${
        selected
          ? 'border-accent bg-accent/10'
          : 'border-white/5 bg-ink-800/70 hover:border-white/10'
      }`}
    >
      <div className="flex items-center gap-3">
        <Gamepad2
          className={`w-5 h-5 ${anyPressed ? 'text-accent animate-pulse' : 'text-slate-400'}`}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{pad.id}</div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            slot #{pad.index} · {pad.buttons.length} botões · {pad.axes.length} eixos · mapping=
            {pad.mapping || 'no-standard'}
          </div>
        </div>
        {selected ? (
          <span className="text-xs px-2.5 py-1 rounded-full bg-accent text-ink-950 font-semibold">
            Preferido
          </span>
        ) : (
          <button
            onClick={onSelect}
            className="text-xs px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10"
          >
            Definir como preferido
          </button>
        )}
      </div>
    </li>
  )
}

const BUTTON_LABELS = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Select',
  'Start',
  'LS',
  'RS',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home'
]

function LiveTester({ pad }: { pad: PadSnapshot }): JSX.Element {
  return (
    <div className="space-y-4">
      {/* Buttons grid */}
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Botões</div>
        <div className="grid grid-cols-9 gap-1.5">
          {pad.buttons.map((pressed, i) => (
            <div
              key={i}
              className={`relative h-10 rounded-md flex items-center justify-center text-[11px] font-mono transition-all ${
                pressed
                  ? 'bg-accent text-ink-950 shadow-[0_0_14px_rgba(94,234,212,0.7)] scale-110'
                  : 'bg-ink-800 text-slate-500'
              }`}
              title={BUTTON_LABELS[i] ?? `btn${i}`}
            >
              {BUTTON_LABELS[i] ?? i}
            </div>
          ))}
        </div>
      </div>

      {/* Axes bars */}
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Eixos</div>
        <div className="space-y-1.5">
          {pad.axes.map((v, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
              <span className="w-8 text-slate-500">ax{i}</span>
              <div className="flex-1 h-2 bg-ink-800 rounded-full relative overflow-hidden">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />
                <div
                  className="absolute top-0 bottom-0 bg-accent rounded-full"
                  style={{
                    left: v >= 0 ? '50%' : `${50 + v * 50}%`,
                    width: `${Math.abs(v) * 50}%`
                  }}
                />
              </div>
              <span className="w-12 text-right text-slate-400">{v.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <div className="flex-1 pr-4">
        <div className="text-sm text-slate-200">{label}</div>
        {description && <div className="text-[11px] text-slate-500 mt-0.5">{description}</div>}
      </div>
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

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

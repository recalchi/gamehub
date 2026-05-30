import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ControllerDiagnostics } from '@shared/types'

const execFileAsync = promisify(execFile)

interface RawDiagnostics {
  devices?: Array<{
    Name?: string
    Status?: string
    PNPClass?: string
    Manufacturer?: string
    Service?: string
    PNPDeviceID?: string
    BusReportedDescription?: string
  }>
  xinput?: Array<{
    Slot?: number
    Connected?: boolean
    ResultCode?: number
  }>
  companionApps?: Array<{
    Name?: string
    Version?: string
    Publisher?: string
    InstallLocation?: string
  }>
}

export async function collectControllerDiagnostics(): Promise<ControllerDiagnostics> {
  if (process.platform !== 'win32') {
    return {
      platform: process.platform,
      scannedAt: new Date().toISOString(),
      devices: [],
      xinput: [],
      companionApps: [],
      issues: ['Diagnostico nativo de controles esta disponivel apenas no Windows.'],
      recommendations: ['Use a lista do navegador acima para validar controles neste sistema.']
    }
  }

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_CONTROLLER_SCRIPT],
      { windowsHide: true, maxBuffer: 1024 * 1024 }
    )
    const raw = JSON.parse(stdout || '{}') as RawDiagnostics
    return normalizeDiagnostics(raw)
  } catch (err) {
    return {
      platform: process.platform,
      scannedAt: new Date().toISOString(),
      devices: [],
      xinput: [],
      companionApps: [],
      issues: ['Nao foi possivel consultar os dispositivos de controle do Windows.'],
      recommendations: [
        'Abra o Gerenciador de Dispositivos e confira se ha algum item com aviso em HID, USB ou Xbox Peripherals.'
      ],
      error: String(err)
    }
  }
}

function normalizeDiagnostics(raw: RawDiagnostics): ControllerDiagnostics {
  const devices = (raw.devices ?? []).map((d) => ({
    name: d.Name ?? 'Dispositivo sem nome',
    status: d.Status ?? 'Unknown',
    pnpClass: d.PNPClass,
    manufacturer: d.Manufacturer,
    service: d.Service,
    pnpDeviceId: d.PNPDeviceID ?? '',
    busReportedDescription: d.BusReportedDescription
  }))
  const xinput = (raw.xinput ?? []).map((slot) => ({
    slot: Number(slot.Slot ?? 0),
    connected: Boolean(slot.Connected),
    resultCode: Number(slot.ResultCode ?? 0)
  }))
  const companionApps = (raw.companionApps ?? []).map((app) => ({
    name: app.Name ?? 'App sem nome',
    version: app.Version,
    publisher: app.Publisher,
    installLocation: app.InstallLocation
  }))

  const hasXInput = xinput.some((slot) => slot.connected)
  const gameSirDevices = devices.filter((d) => /gamesir|vid_36ae|vid_3537/i.test(`${d.name} ${d.pnpDeviceId}`))
  const keyboardMode = gameSirDevices.some((d) =>
    /keyboard|teclado|mouse|consumer control|wireless radio|vendor-defined/i.test(
      `${d.name} ${d.busReportedDescription ?? ''} ${d.pnpClass ?? ''}`
    )
  )
  const hasConnect = companionApps.some((app) => /gamesir connect/i.test(app.name))
  const hasNexus = companionApps.some((app) => /gamesir nexus/i.test(app.name))

  const issues: string[] = []
  const recommendations: string[] = []

  if (gameSirDevices.length > 0 && !hasXInput) {
    issues.push('GameSir encontrado no Windows, mas nenhum slot XInput esta ativo.')
    recommendations.push('Troque o controle para modo XInput e reconecte o cabo ou dongle.')
  }

  if (keyboardMode) {
    issues.push('O GameSir parece estar em modo teclado/mouse ou HID generico.')
    recommendations.push('Para jogos de PC e navegacao no GameHub, prefira o modo XInput/Xbox.')
  }

  if (gameSirDevices.length > 0) {
    recommendations.push(
      'No GameSir T4n Lite/Nova Lite, use o modo PC: com o controle desligado, segure X + Home ate a luz verde piscar; pelo dongle, pareie pelo botao do receptor.'
    )
  }

  if (!hasConnect && !hasNexus && gameSirDevices.length === 0) {
    recommendations.push('Instale o app oficial compativel com seu modelo, se o manual do controle indicar suporte.')
  }

  if (gameSirDevices.length === 0 && !hasXInput) {
    issues.push('Nenhum controle GameSir ou XInput foi identificado pelo diagnostico nativo.')
    recommendations.push('Teste outro cabo USB, outra porta USB e pressione um botao no controle antes de atualizar.')
  }

  if (hasXInput) {
    recommendations.push('XInput esta ativo. Se a tela do GameHub ainda nao responder, pressione um botao para liberar a Web Gamepad API.')
  }

  return {
    platform: process.platform,
    scannedAt: new Date().toISOString(),
    devices,
    xinput,
    companionApps,
    issues,
    recommendations
  }
}

const WINDOWS_CONTROLLER_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'

$devicePattern = 'GameSir|Gamepad|Controller|Xbox|XINPUT|HID-compliant game|Wireless Controller'
$idPattern = 'VID_36AE|VID_3537|VID_275D|VID_045E|IG_|BTHENUM'

$devices = Get-CimInstance Win32_PnPEntity |
  Where-Object { $_.Name -match $devicePattern -or $_.PNPDeviceID -match $idPattern } |
  Select-Object Name, Status, PNPClass, Manufacturer, Service, PNPDeviceID

$normalizedDevices = @()
foreach ($device in $devices) {
  $busDescription = $null
  try {
    $busDescription = (Get-PnpDeviceProperty -InstanceId $device.PNPDeviceID -KeyName 'DEVPKEY_Device_BusReportedDeviceDesc').Data
  } catch {}
  $normalizedDevices += [pscustomobject]@{
    Name = $device.Name
    Status = $device.Status
    PNPClass = $device.PNPClass
    Manufacturer = $device.Manufacturer
    Service = $device.Service
    PNPDeviceID = $device.PNPDeviceID
    BusReportedDescription = $busDescription
  }
}

$xinput = @()
try {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class XInputProbe {
  [StructLayout(LayoutKind.Sequential)] public struct XINPUT_GAMEPAD {
    public ushort wButtons;
    public byte bLeftTrigger;
    public byte bRightTrigger;
    public short sThumbLX;
    public short sThumbLY;
    public short sThumbRX;
    public short sThumbRY;
  }
  [StructLayout(LayoutKind.Sequential)] public struct XINPUT_STATE {
    public uint dwPacketNumber;
    public XINPUT_GAMEPAD Gamepad;
  }
  [DllImport("xinput1_4.dll", EntryPoint="XInputGetState")]
  public static extern uint XInputGetState(uint dwUserIndex, out XINPUT_STATE pState);
}
"@
  0..3 | ForEach-Object {
    $state = New-Object XInputProbe+XINPUT_STATE
    $result = [XInputProbe]::XInputGetState([uint32]$_, [ref]$state)
    $xinput += [pscustomobject]@{
      Slot = $_
      Connected = ($result -eq 0)
      ResultCode = $result
    }
  }
} catch {
  $xinput += [pscustomobject]@{ Slot = 0; Connected = $false; ResultCode = -1 }
}

$uninstallRoots = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$apps = Get-ItemProperty $uninstallRoots |
  Where-Object { $_.DisplayName -match 'GameSir|Nexus|Connect|Xbox Accessories|ViGEm|HidHide|DS4Windows|reWASD' } |
  Select-Object @{n='Name';e={$_.DisplayName}}, @{n='Version';e={$_.DisplayVersion}}, Publisher, InstallLocation

[pscustomobject]@{
  devices = $normalizedDevices
  xinput = $xinput
  companionApps = @($apps)
} | ConvertTo-Json -Depth 6
`

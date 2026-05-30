import { createConnection, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import { settingsStore } from './store'
import { log } from './logger'
import type { DiscordRpcStatus } from '@shared/types'

type HandshakeState =
  | 'ok'
  | 'invalid-client-id'
  | 'discord-not-running'
  | 'disabled'
  | 'unknown'

let socket: Socket | null = null
let connecting = false
let connectedClientId: string | null = null
let lastActivity: string | null = null
let lastActivityTitle: string | null = null
let lastActivityStartedAt: number | null = null
let lastError: string | null = null
let lastHandshake: HandshakeState = 'unknown'
let pipeFound = false
let pendingHandshake:
  | {
      resolve: (socket: Socket | null) => void
      timer: NodeJS.Timeout
    }
  | null = null
const pendingCommands = new Map<
  string,
  {
    command: string
    resolve: (ok: boolean) => void
    timer: NodeJS.Timeout
  }
>()

function pipePath(n: number): string {
  return `\\\\.\\pipe\\discord-ipc-${n}`
}

function frame(opcode: number, json: object): Buffer {
  const body = Buffer.from(JSON.stringify(json), 'utf8')
  const header = Buffer.alloc(8)
  header.writeUInt32LE(opcode, 0)
  header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

function readFrames(buffer: Buffer): Array<{ opcode: number; json: Record<string, unknown> }> {
  const frames: Array<{ opcode: number; json: Record<string, unknown> }> = []
  let offset = 0
  while (offset + 8 <= buffer.length) {
    const opcode = buffer.readUInt32LE(offset)
    const length = buffer.readUInt32LE(offset + 4)
    const end = offset + 8 + length
    if (end > buffer.length) break
    try {
      frames.push({ opcode, json: JSON.parse(buffer.slice(offset + 8, end).toString('utf8')) })
    } catch {
      /* ignore malformed Discord frames */
    }
    offset = end
  }
  return frames
}

function resetSocket(): void {
  for (const [nonce, pending] of pendingCommands) {
    clearTimeout(pending.timer)
    pending.resolve(false)
    pendingCommands.delete(nonce)
  }
  if (socket) {
    try {
      socket.destroy()
    } catch {
      /* ignore */
    }
  }
  socket = null
  connectedClientId = null
}

function resolvePending(sock: Socket | null): void {
  if (!pendingHandshake) return
  clearTimeout(pendingHandshake.timer)
  pendingHandshake.resolve(sock)
  pendingHandshake = null
}

function tryConnect(n: number): Promise<Socket | null> {
  return new Promise((resolve) => {
    const sock = createConnection(pipePath(n))
    const done = (s: Socket | null): void => {
      sock.removeAllListeners('error')
      sock.removeAllListeners('connect')
      resolve(s)
    }
    sock.once('connect', () => done(sock))
    sock.once('error', () => {
      sock.destroy()
      done(null)
    })
  })
}

async function ensureConnected(force = false): Promise<Socket | null> {
  const settings = settingsStore.load().discord
  const clientId = settings.clientId.trim()

  if (!settings.enabled) {
    lastHandshake = 'disabled'
    lastError = null
    resetSocket()
    return null
  }
  if (!/^\d{16,24}$/.test(clientId)) {
    lastHandshake = 'invalid-client-id'
    lastError = 'Configure um Discord Application ID valido em Configuracoes.'
    resetSocket()
    return null
  }
  if (!force && socket && !socket.destroyed && connectedClientId === clientId) return socket
  if (connecting) return null

  connecting = true
  resetSocket()
  try {
    for (let i = 0; i < 10; i++) {
      const s = await tryConnect(i)
      if (!s) continue
      pipeFound = true
      socket = s
      connectedClientId = clientId
      lastHandshake = 'unknown'
      lastError = null

      s.on('data', (buffer) => handleData(buffer))
      s.on('error', (err) => {
        lastError = err.message
        log.warn('discordRpc', `socket error: ${err.message}`)
        resetSocket()
      })
      s.on('close', () => {
        socket = null
        connectedClientId = null
      })

      const handshake = new Promise<Socket | null>((resolve) => {
        pendingHandshake = {
          resolve,
          timer: setTimeout(() => {
            lastHandshake = 'unknown'
            lastError = 'Discord nao respondeu ao handshake.'
            resolve(null)
            pendingHandshake = null
          }, 3000)
        }
      })
      s.write(frame(0, { v: 1, client_id: clientId }))
      log.info('discordRpc', `connected to ${pipePath(i)}`)
      const accepted = await handshake
      if (accepted) return accepted
      resetSocket()
      return null
    }
    pipeFound = false
    lastHandshake = 'discord-not-running'
    lastError = 'Discord nao esta aberto ou nao expose o pipe IPC.'
    log.info('discordRpc', 'Discord IPC pipe not found')
    return null
  } finally {
    connecting = false
  }
}

function handleData(buffer: Buffer): void {
  for (const { opcode, json } of readFrames(buffer)) {
    const nonce = typeof json.nonce === 'string' ? json.nonce : null
    if (nonce && pendingCommands.has(nonce)) {
      const pending = pendingCommands.get(nonce)!
      pendingCommands.delete(nonce)
      clearTimeout(pending.timer)
      if (opcode === 2 || json.evt === 'ERROR' || json.cmd === 'ERROR') {
        lastError = commandErrorMessage(json)
        log.warn('discordRpc', `${pending.command} rejected: ${lastError}`)
        pending.resolve(false)
      } else {
        pending.resolve(true)
      }
      continue
    }

    if (opcode === 2) {
      const message = String(json.message ?? 'Discord RPC error')
      lastError = message
      lastHandshake = message.toLowerCase().includes('invalid client id')
        ? 'invalid-client-id'
        : 'unknown'
      log.warn('discordRpc', message)
      resolvePending(null)
      resetSocket()
      continue
    }
    if (json.cmd === 'DISPATCH' && json.evt === 'READY') {
      lastHandshake = 'ok'
      lastError = null
      resolvePending(socket)
      continue
    }
    if (json.evt === 'ERROR' || json.cmd === 'ERROR') {
      lastError = String(json.data ?? json.message ?? 'Discord RPC command error')
      log.warn('discordRpc', lastError)
    }
  }
}

async function dispatch(cmd: string, args: object): Promise<boolean> {
  const sock = await ensureConnected()
  if (!sock) return false
  const nonce = randomUUID()
  const payload = { cmd, args, nonce }
  const acknowledged = new Promise<boolean>((resolve) => {
    pendingCommands.set(nonce, {
      command: cmd,
      resolve,
      timer: setTimeout(() => {
        pendingCommands.delete(nonce)
        lastError = `Discord nao confirmou o comando ${cmd}.`
        log.warn('discordRpc', lastError)
        resolve(false)
      }, 3000)
    })
  })
  try {
    sock.write(frame(1, payload))
    return await acknowledged
  } catch (err) {
    const pending = pendingCommands.get(nonce)
    if (pending) {
      clearTimeout(pending.timer)
      pendingCommands.delete(nonce)
      pending.resolve(false)
    }
    lastError = err instanceof Error ? err.message : String(err)
    log.warn('discordRpc', `write failed: ${lastError}`)
    resetSocket()
    return false
  }
}

async function dispatchWithRetry(cmd: string, args: object): Promise<boolean> {
  let ok = await dispatch(cmd, args)
  if (ok) return true
  await ensureConnected(true)
  ok = await dispatch(cmd, args)
  return ok
}

export async function discordRpcSetActivity(
  game: { title: string; platform: string; startedAt: number } | null
): Promise<void> {
  const settings = settingsStore.load().discord
  if (!settings.enabled) return

  if (!game) {
    const ok = await dispatchWithRetry('SET_ACTIVITY', { pid: process.pid, activity: null })
    if (ok) {
      lastActivity = null
      lastActivityTitle = null
      lastActivityStartedAt = null
    }
    return
  }

  const state = settings.showPlatform ? platformLabel(game.platform) : 'via GameHub'
  const activity = {
    type: 0,
    details: game.title,
    state,
    status_display_type: 2,
    timestamps: { start: Math.floor(game.startedAt / 1000) },
    instance: false
  }
  const ok = await dispatchWithRetry('SET_ACTIVITY', { pid: process.pid, activity })
  if (ok) {
    lastActivity = `${game.title} (${state})`
    lastActivityTitle = game.title
    lastActivityStartedAt = game.startedAt
    log.info('discordRpc', `activity set: ${lastActivity}`)
  }
}

export async function discordRpcClearIfMatches(title: string, startedAt?: number): Promise<void> {
  if (lastActivityTitle !== title) return
  if (startedAt !== undefined && lastActivityStartedAt !== startedAt) return
  await discordRpcSetActivity(null)
}

export async function discordRpcValidate(): Promise<DiscordRpcStatus> {
  await ensureConnected(true)
  return discordRpcStatus()
}

export function discordRpcStatus(): DiscordRpcStatus {
  const settings = settingsStore.load().discord
  return {
    enabled: settings.enabled,
    configured: /^\d{16,24}$/.test(settings.clientId.trim()),
    connected: !!socket && !socket.destroyed && lastHandshake === 'ok',
    pipeFound,
    clientId: settings.clientId.trim() || undefined,
    lastActivity,
    lastError,
    lastHandshake
  }
}

export function discordRpcStop(): void {
  resetSocket()
  lastActivity = null
  lastActivityTitle = null
  lastActivityStartedAt = null
}

function commandErrorMessage(json: Record<string, unknown>): string {
  const data = json.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const message = (data as { message?: unknown }).message
    if (typeof message === 'string') return message
    try {
      return JSON.stringify(data)
    } catch {
      return 'Discord RPC command error'
    }
  }
  return String(json.message ?? 'Discord RPC command error')
}

function platformLabel(platform: string): string {
  const map: Record<string, string> = {
    nes: 'NES',
    snes: 'SNES',
    n64: 'Nintendo 64',
    gamecube: 'GameCube',
    wii: 'Nintendo Wii',
    gb: 'Game Boy',
    gbc: 'Game Boy Color',
    gba: 'Game Boy Advance',
    nds: 'Nintendo DS',
    n3ds: 'Nintendo 3DS',
    switch: 'Nintendo Switch',
    ps1: 'PlayStation',
    ps2: 'PlayStation 2',
    ps3: 'PlayStation 3',
    ps4: 'PlayStation 4',
    psp: 'PSP',
    xbox: 'Xbox',
    xbox360: 'Xbox 360',
    pc: 'PC'
  }
  return map[platform] ?? 'GameHub'
}

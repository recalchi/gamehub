import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { BrowserWindow, shell } from 'electron'
import { buildLaunchArgs } from './emulators'
import { libraryStore } from './store'
import { log } from './logger'
import { EMULATORS } from '@shared/emulators'
import { IPC } from '@shared/ipc'
import type { Game, LaunchResult } from '@shared/types'

/** A spawn that exits non-zero this quickly is almost certainly a launch failure
 *  rather than a normal "user closed the game" — surface it to the renderer. */
const FAILURE_THRESHOLD_SECONDS = 10

function broadcastFailure(game: Game, code: number | null, seconds: number, emulatorName: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.launch.failed, {
      gameId: game.id,
      gameTitle: game.title,
      code,
      seconds,
      emulatorName
    })
  }
}

/**
 * Spawn the appropriate emulator for a game and return immediately.
 *
 * We don't wait for the emulator to exit — that's a fire-and-forget pattern
 * because long-running emulators would block the IPC reply. We do increment
 * playTime when the emulator process is observed to exit.
 */
export async function launchGame(game: Game): Promise<LaunchResult> {
  if (!game.emulator || game.emulator === 'unknown') {
    return { ok: false, error: 'Nenhum emulador associado a este jogo.' }
  }
  if (game.emulator === 'native') {
    return launchNative(game)
  }

  const data = libraryStore.load()
  const emu = data.emulators.find((e) => e.id === game.emulator)
  if (!emu || !existsSync(emu.executable)) {
    return {
      ok: false,
      error: `Emulador ${EMULATORS[game.emulator]?.name ?? game.emulator} não encontrado.`
    }
  }
  if (!existsSync(game.path)) {
    return { ok: false, error: `Arquivo do jogo não encontrado: ${game.path}` }
  }

  const args = buildLaunchArgs(game.emulator, game.path)
  const command = `"${emu.executable}" ${args.map((a) => `"${a}"`).join(' ')}`
  log.info('launcher', `launching ${game.title}`, { command })

  try {
    const startedAt = Date.now()
    const child = spawn(emu.executable, args, {
      cwd: emu.installPath,
      detached: true,
      stdio: 'ignore'
    })
    child.on('error', (err) => {
      log.error('launcher', `child errored: ${err.message}`)
      broadcastFailure(game, null, 0, emu.name)
    })
    child.on('exit', (code) => {
      const seconds = Math.round((Date.now() - startedAt) / 1000)
      log.info('launcher', `emulator exited code=${code} after ${seconds}s`)
      libraryStore.patchGame(game.id, {
        playTime: (game.playTime ?? 0) + seconds,
        lastPlayedAt: new Date().toISOString()
      })
      // Short-lived non-zero exit = almost certainly a launch failure
      // (missing BIOS, bad ISO, missing DLL). Surface to the renderer.
      if (code !== 0 && code !== null && seconds < FAILURE_THRESHOLD_SECONDS) {
        broadcastFailure(game, code, seconds, emu.name)
      }
    })
    child.unref()
    return { ok: true, pid: child.pid, command }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error('launcher', `spawn failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

async function launchNative(game: Game): Promise<LaunchResult> {
  if (!existsSync(game.path)) {
    return { ok: false, error: `Arquivo não encontrado: ${game.path}` }
  }
  try {
    const child = spawn(game.path, [], { detached: true, stdio: 'ignore' })
    child.unref()
    return { ok: true, pid: child.pid, command: game.path }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function openFolder(path: string): Promise<void> {
  await shell.openPath(path)
}

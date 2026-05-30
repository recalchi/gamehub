import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { PATHS } from './paths'
import type { LogEntry } from '@shared/types'

const logFile = join(PATHS.logs, `${new Date().toISOString().slice(0, 10)}.log`)
const buffer: LogEntry[] = []
const MAX_BUFFER = 500

// Live subscribers — the splash subscribes here so users with the "show real
// boot logs" toggle on can see actual main-process events stream in instead
// of the canned BOOT_LINES.
type LogListener = (entry: LogEntry) => void
const listeners = new Set<LogListener>()

export function subscribeLogs(listener: LogListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function write(entry: LogEntry): void {
  buffer.push(entry)
  if (buffer.length > MAX_BUFFER) buffer.shift()
  const line = `[${entry.ts}] [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.message}${entry.data ? ' ' + safeStringify(entry.data) : ''}\n`
  try {
    appendFileSync(logFile, line, 'utf8')
  } catch {
    // disk full / permission — fall through, keep buffer in memory only
  }
  // Mirror to stdout so electron-vite dev console shows them
  // eslint-disable-next-line no-console
  console.log(line.trimEnd())
  // Fan-out to live subscribers — try/catch each so one bad listener doesn't
  // poison the rest (or the file write that already succeeded).
  for (const listener of listeners) {
    try {
      listener(entry)
    } catch {
      /* ignore */
    }
  }
}

function safeStringify(data: unknown): string {
  try {
    return typeof data === 'string' ? data : JSON.stringify(data)
  } catch {
    return String(data)
  }
}

function make(level: LogEntry['level']) {
  return (scope: string, message: string, data?: unknown): void => {
    write({ ts: new Date().toISOString(), level, scope, message, data })
  }
}

export const log = {
  debug: make('debug'),
  info: make('info'),
  warn: make('warn'),
  error: make('error'),
  recent: (limit = 200): LogEntry[] => buffer.slice(-limit),
  file: logFile
}

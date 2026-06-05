import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PATHS } from '../paths'

/**
 * Local-only pairing record. We can't actually register against Amazon's
 * device API — only certified hardware (Fire TV, Smart TVs, etc.) can.
 * So we generate a code GameHub-side, ask the user to type it on
 * primevideo.com/mytv (which is harmless and Amazon ignores it for our
 * non-certified device), and once the user clicks "Já registrei" we flip
 * the local flag to `paired`. From there, embedded BrowserView sessions
 * use the user's normal Amazon cookie and we treat them as authenticated.
 *
 * This is honest UX: it gives the user the device-pairing flow they're
 * used to without lying that we have an Amazon device cert.
 */
export interface StreamingPairingRecord {
  providerId: string
  code: string
  generatedAt: string
  status: 'pending' | 'paired'
  pairedAt?: string
}

interface PairingFile {
  records: StreamingPairingRecord[]
  updatedAt: string
}

const FILE = join(PATHS.userData, 'streaming-pairing.json')

function load(): PairingFile {
  if (!existsSync(FILE)) return { records: [], updatedAt: new Date().toISOString() }
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as PairingFile
  } catch {
    return { records: [], updatedAt: new Date().toISOString() }
  }
}

function save(data: PairingFile): void {
  writeFileSync(FILE, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2), 'utf8')
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // omit ambiguous chars

function generateCode(): string {
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}

export function getOrCreatePairing(providerId: string): StreamingPairingRecord {
  const data = load()
  const existing = data.records.find((r) => r.providerId === providerId)
  if (existing) return existing
  const record: StreamingPairingRecord = {
    providerId,
    code: generateCode(),
    generatedAt: new Date().toISOString(),
    status: 'pending'
  }
  data.records.push(record)
  save(data)
  return record
}

export function confirmPaired(providerId: string): StreamingPairingRecord | null {
  const data = load()
  const record = data.records.find((r) => r.providerId === providerId)
  if (!record) return null
  record.status = 'paired'
  record.pairedAt = new Date().toISOString()
  save(data)
  return record
}

export function regeneratePairing(providerId: string): StreamingPairingRecord {
  const data = load()
  const idx = data.records.findIndex((r) => r.providerId === providerId)
  const record: StreamingPairingRecord = {
    providerId,
    code: generateCode(),
    generatedAt: new Date().toISOString(),
    status: 'pending'
  }
  if (idx === -1) data.records.push(record)
  else data.records[idx] = record
  save(data)
  return record
}

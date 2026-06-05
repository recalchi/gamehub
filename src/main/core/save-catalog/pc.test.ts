import { describe, expect, it } from 'vitest'
import { normalizeTitle, expandPath, PC_SAVE_CATALOG } from './pc'

describe('save-catalog/pc', () => {
  it('normalizes titles to a stable slug', () => {
    expect(normalizeTitle('Elden Ring')).toBe('elden ring')
    expect(normalizeTitle('  ELDEN-RING!! ')).toBe('elden ring')
    expect(normalizeTitle('Hadès')).toBe('hades')
  })

  it('has catalog entries keyed by the normalized slug', () => {
    expect(Object.keys(PC_SAVE_CATALOG)).toContain('elden ring')
    for (const key of Object.keys(PC_SAVE_CATALOG)) {
      expect(key).toBe(normalizeTitle(key))
    }
  })

  it('expands env vars in path templates', () => {
    process.env.GAMEHUB_TEST_ROOT = 'C:/tmp/gh'
    expect(expandPath('${GAMEHUB_TEST_ROOT}\\saves')).toBe('C:/tmp/gh\\saves')
  })

  it('returns null when an env var is unset', () => {
    delete process.env.GAMEHUB_TEST_MISSING
    expect(expandPath('${GAMEHUB_TEST_MISSING}\\x')).toBeNull()
  })
})

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadProgressFromFile, toggleAchievementInFile } from './progress-file'

let tempDir: string | null = null

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

function tempProgressFile(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'gamehub-achievements-'))
  return join(tempDir, 'achievements-progress.json')
}

describe('achievement progress persistence', () => {
  it('saves checked achievements with timestamps and loads them back', () => {
    const file = tempProgressFile()

    const progress = toggleAchievementInFile(file, 'gow-2018', 'gow2018:father-and-son', true)

    expect(progress['gow2018:father-and-son']).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(loadProgressFromFile(file).perGame['gow-2018']).toHaveProperty('gow2018:father-and-son')
  })

  it('removes an achievement when unchecked without clearing the rest of the game', () => {
    const file = tempProgressFile()

    toggleAchievementInFile(file, 'gow-2018', 'gow2018:father-and-son', true)
    toggleAchievementInFile(file, 'gow-2018', 'gow2018:the-journey-begins', true)
    const progress = toggleAchievementInFile(file, 'gow-2018', 'gow2018:father-and-son', false)
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { perGame: Record<string, Record<string, string>> }

    expect(progress).not.toHaveProperty('gow2018:father-and-son')
    expect(progress).toHaveProperty('gow2018:the-journey-begins')
    expect(raw.perGame['gow-2018']).toEqual(progress)
  })
})

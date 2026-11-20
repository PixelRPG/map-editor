import { describe, expect, it } from '@gjsify/unit'

import { DEFAULT_GAME_SECTION, GAME_SECTIONS, isGameSection } from './game-section.ts'

export default async () => {
  await describe('game sections', async () => {
    await it('opens on the section with the Play button', async () => {
      expect(DEFAULT_GAME_SECTION).toBe('start')
      expect(GAME_SECTIONS[0]).toBe('start')
    })

    await it('recognises its own names only', async () => {
      for (const section of GAME_SECTIONS) expect(isGameSection(section)).toBe(true)
      expect(isGameSection('characters')).toBe(false)
      expect(isGameSection('')).toBe(false)
    })
  })
}

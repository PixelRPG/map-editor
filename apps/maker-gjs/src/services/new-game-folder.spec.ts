import { describe, expect, it } from '@gjsify/unit'

import { folderNameFor, nextFreeGameDir } from './new-game-folder.ts'

export default async () => {
  await describe('nextFreeGameDir', async () => {
    await it('uses the plain name when it is free', async () => {
      expect(nextFreeGameDir('/home/x/Documents', 'New game', () => false)).toBe('/home/x/Documents/PixelRPG/New game')
    })

    await it('appends the first free number when the name is taken', async () => {
      const taken = new Set(['/d/PixelRPG/Neues Spiel', '/d/PixelRPG/Neues Spiel 2'])
      expect(nextFreeGameDir('/d/', 'Neues Spiel', (p) => taken.has(p))).toBe('/d/PixelRPG/Neues Spiel 3')
    })
  })

  await describe('folderNameFor', async () => {
    await it('strips path characters and leading dots', async () => {
      expect(folderNameFor(' ../a/b: c ')).toBe('a b c')
    })

    await it('never answers an empty name', async () => {
      expect(folderNameFor('///')).toBe('Game')
    })
  })
}

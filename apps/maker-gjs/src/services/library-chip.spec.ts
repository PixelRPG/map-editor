import { describe, expect, it } from '@gjsify/unit'

import { DEFAULT_LIBRARY_CHIP, isLibraryChip, LIBRARY_CHIPS } from './library-chip.ts'

export default async () => {
  await describe('library chips', async () => {
    await it('are exactly Characters, Things and Graphics, in header order', async () => {
      // The MCP bridge's `set_view` enum is a literal copy of this list;
      // a chip added here has to be added there too.
      expect([...LIBRARY_CHIPS]).toStrictEqual(['characters', 'things', 'graphics'])
    })

    await it('open on Characters', async () => {
      expect(isLibraryChip(DEFAULT_LIBRARY_CHIP)).toBe(true)
      expect(DEFAULT_LIBRARY_CHIP).toBe('characters')
    })

    await it('reject the old rail-row ids, which are not chips', async () => {
      for (const old of ['cast', 'objects', 'tiles', 'library', '']) expect(isLibraryChip(old)).toBe(false)
    })
  })
}

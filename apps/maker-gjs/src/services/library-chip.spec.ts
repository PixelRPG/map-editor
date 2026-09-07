import { describe, expect, it } from '@gjsify/unit'

import {
  chipForTier,
  chipsForTier,
  DEFAULT_LIBRARY_CHIP,
  FULL_VIEW_ONLY_CHIPS,
  isChipInTier,
  isLibraryChip,
  LIBRARY_CHIPS,
} from './library-chip.ts'

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

  await describe('library chips per view tier', async () => {
    await it('keep Graphics for Full view only (concept decision 2)', async () => {
      expect([...FULL_VIEW_ONLY_CHIPS]).toStrictEqual(['graphics'])
      expect(chipsForTier(false)).toStrictEqual(['characters', 'things'])
      expect(chipsForTier(true)).toStrictEqual(['characters', 'things', 'graphics'])
    })

    await it('show every chip in Full view and the two friendly ones in Simple view', async () => {
      for (const chip of LIBRARY_CHIPS) expect(isChipInTier(chip, true)).toBe(true)
      expect(isChipInTier('characters', false)).toBe(true)
      expect(isChipInTier('things', false)).toBe(true)
      expect(isChipInTier('graphics', false)).toBe(false)
    })

    await it('fall back to the default chip when the active one leaves the tier', async () => {
      // Full view → Simple view while Graphics is showing: the header
      // loses the chip, so the page must move, never go blank.
      expect(chipForTier('graphics', false)).toBe(DEFAULT_LIBRARY_CHIP)
      expect(chipForTier('things', false)).toBe('things')
      expect(chipForTier('graphics', true)).toBe('graphics')
    })

    await it('never fall back to a chip outside the tier', async () => {
      expect(isChipInTier(chipForTier('graphics', false), false)).toBe(true)
    })
  })
}

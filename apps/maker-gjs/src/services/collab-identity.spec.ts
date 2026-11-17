import { describe, expect, it } from '@gjsify/unit'

import {
  COLLAB_COLOURS,
  coerceCollabColour,
  coerceDisplayName,
  defaultDisplayName,
  MAX_DISPLAY_NAME,
} from './collab-identity.ts'

export default async () => {
  await describe('collab identity', async () => {
    await describe('coerceDisplayName', async () => {
      await it('keeps an ordinary name as typed', async () => {
        expect(coerceDisplayName('Mia', 'You')).toBe('Mia')
      })

      await it('falls back when the name is blank', async () => {
        expect(coerceDisplayName('   ', 'You')).toBe('You')
      })

      await it('collapses whitespace so a pasted name cannot break the row', async () => {
        expect(coerceDisplayName('Mia\n  Nguyen', 'You')).toBe('Mia Nguyen')
      })

      await it('truncates by grapheme, not by code unit', async () => {
        const long = '😀'.repeat(MAX_DISPLAY_NAME + 5)
        expect([...coerceDisplayName(long, 'You')].length).toBe(MAX_DISPLAY_NAME)
      })
    })

    await describe('coerceCollabColour', async () => {
      await it('accepts a palette colour', async () => {
        expect(coerceCollabColour(COLLAB_COLOURS[2], '#000000')).toBe(COLLAB_COLOURS[2])
      })

      await it('is case-insensitive about the stored token', async () => {
        expect(coerceCollabColour(COLLAB_COLOURS[0].toUpperCase(), '#000000')).toBe(COLLAB_COLOURS[0])
      })

      await it('rejects a colour outside the palette', async () => {
        expect(coerceCollabColour('#000000', COLLAB_COLOURS[1])).toBe(COLLAB_COLOURS[1])
      })

      await it("rejects the assistant's purple so a human cannot impersonate the AI", async () => {
        expect(coerceCollabColour('#9141ac', COLLAB_COLOURS[0])).toBe(COLLAB_COLOURS[0])
      })

      await it('falls back on empty and nullish input', async () => {
        expect(coerceCollabColour('', COLLAB_COLOURS[3])).toBe(COLLAB_COLOURS[3])
        expect(coerceCollabColour(null, COLLAB_COLOURS[3])).toBe(COLLAB_COLOURS[3])
        expect(coerceCollabColour(undefined, COLLAB_COLOURS[3])).toBe(COLLAB_COLOURS[3])
      })
    })

    await describe('defaultDisplayName', async () => {
      await it('prefers the real name', async () => {
        expect(defaultDisplayName('Mia Nguyen', 'mia', 'You')).toBe('Mia Nguyen')
      })

      await it("treats GLib's 'Unknown' sentinel as no real name", async () => {
        expect(defaultDisplayName('Unknown', 'mia', 'You')).toBe('mia')
      })

      await it('falls back to the login, then to the caller fallback', async () => {
        expect(defaultDisplayName(null, 'mia', 'You')).toBe('mia')
        expect(defaultDisplayName(null, null, 'You')).toBe('You')
        expect(defaultDisplayName('  ', '  ', 'You')).toBe('You')
      })
    })
  })
}

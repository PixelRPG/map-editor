/**
 * Preset vs. explicit size for the resize_window tool.
 *
 * The mixed case is the one worth pinning: an agent passing only a width
 * alongside a preset must get the preset's height, not a failure and not a
 * square window. Reading it off the implementation is easy to get backwards
 * because both sources are optional.
 */

import { describe, expect, it } from '@gjsify/unit'

import { resolveWindowSize, SIZE_PRESETS } from './window-size.ts'

export default async () => {
  await describe('resolveWindowSize', async () => {
    await it('resolves a preset to its declared size', async () => {
      expect(resolveWindowSize('tablet', undefined, undefined)).toStrictEqual(SIZE_PRESETS.tablet)
    })

    await it('lets an explicit dimension override just that side of the preset', async () => {
      expect(resolveWindowSize('phone', 500, undefined)).toStrictEqual([500, 880])
      expect(resolveWindowSize('phone', undefined, 500)).toStrictEqual([400, 500])
    })

    await it('accepts explicit width + height with no preset', async () => {
      expect(resolveWindowSize(undefined, 640, 480)).toStrictEqual([640, 480])
    })

    await it('answers null when a dimension has no source', async () => {
      expect(resolveWindowSize(undefined, undefined, undefined)).toBe(null)
      expect(resolveWindowSize(undefined, 640, undefined)).toBe(null)
    })

    await it('answers null for a preset it does not know', async () => {
      expect(resolveWindowSize('watch', undefined, undefined)).toBe(null)
    })
  })
}

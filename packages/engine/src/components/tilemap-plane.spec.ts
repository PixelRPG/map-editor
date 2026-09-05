/**
 * `zFor` — the one function that turns (plane, storey) into a render z.
 * Pins the formula rather than three magic numbers, so the later
 * elevation step (decision 11) cannot be foreclosed by a caller that
 * treats 0 / 100 / 200 as an exhaustive enum.
 */

import { describe, expect, it } from '@gjsify/unit'

import { LAYER_PLANES } from '../types/data/LayerData.ts'
import { STOREY_Z_STRIDE, zFor } from './tilemap-plane.component.ts'

export default async () => {
  await describe('zFor', async () => {
    await it('keeps the three storey-0 plane offsets in render order', async () => {
      expect(zFor('ground')).toBe(0)
      expect(zFor('hero')).toBe(100)
      expect(zFor('overlay')).toBe(200)
      expect(LAYER_PLANES.map((p) => zFor(p))).toStrictEqual([0, 100, 200])
    })

    await it('defaults the storey to 0', async () => {
      for (const plane of LAYER_PLANES) expect(zFor(plane)).toBe(zFor(plane, 0))
    })

    await it('offsets a storey by the stride — zFor("hero", 1) is 1100', async () => {
      expect(zFor('hero', 1)).toBe(1100)
      expect(zFor('ground', 2)).toBe(2000)
    })

    await it('puts a higher storey above everything on the one below, actors included', async () => {
      // The player sits at zFor('hero') + 50 and the hover ghost at
      // zFor('overlay') + 50 — both must stay under storey 1's ground.
      expect(zFor('ground', 1)).toBeGreaterThan(zFor('overlay') + 50)
      expect(STOREY_Z_STRIDE).toBeGreaterThan(zFor('overlay') + 50)
    })
  })
}

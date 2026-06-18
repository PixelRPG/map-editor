import { describe, expect, it } from '@gjsify/unit'
import type { MapData } from '@pixelrpg/engine'

import { clampViewportCenter, fingerprintMapData } from './map-preview.geometry.ts'

function makeMap(overrides: Partial<MapData> = {}): MapData {
  return {
    id: 'm',
    name: 'M',
    version: '1.0.0',
    tileWidth: 16,
    tileHeight: 16,
    columns: 8,
    rows: 8,
    layers: [{ id: 'ground', name: 'Ground', visible: true, sprites: [{ x: 0, y: 0, spriteId: 1, spriteSetId: 's' }] }],
    spriteSets: [],
    ...overrides,
  } as unknown as MapData
}

export default async () => {
  await describe('fingerprintMapData', async () => {
    await it('is deterministic for identical data', async () => {
      expect(fingerprintMapData(makeMap())).toBe(fingerprintMapData(makeMap()))
    })

    await it('changes when a tile edit changes the content', async () => {
      const before = fingerprintMapData(makeMap())
      const after = fingerprintMapData(
        makeMap({
          layers: [
            { id: 'ground', name: 'Ground', visible: true, sprites: [{ x: 1, y: 0, spriteId: 1, spriteSetId: 's' }] },
          ],
        }),
      )
      expect(before).not.toBe(after)
    })

    await it('changes when map dimensions change', async () => {
      expect(fingerprintMapData(makeMap({ columns: 8 }))).not.toBe(fingerprintMapData(makeMap({ columns: 9 })))
    })

    await it('ignores hidden layers (they are not baked)', async () => {
      const visible = fingerprintMapData(makeMap())
      const withHidden = fingerprintMapData(
        makeMap({
          layers: [
            { id: 'ground', name: 'Ground', visible: true, sprites: [{ x: 0, y: 0, spriteId: 1, spriteSetId: 's' }] },
            { id: 'hidden', name: 'Hidden', visible: false, sprites: [{ x: 4, y: 4, spriteId: 9, spriteSetId: 's' }] },
          ],
        }),
      )
      expect(visible).toBe(withHidden)
    })

    await it('returns an unsigned 32-bit integer', async () => {
      const fp = fingerprintMapData(makeMap())
      expect(Number.isInteger(fp)).toBe(true)
      expect(fp >= 0).toBe(true)
      expect(fp <= 0xffffffff).toBe(true)
    })
  })

  await describe('clampViewportCenter', async () => {
    await it('centres a map smaller than the viewport', async () => {
      // map extent 100, widget 400 @ zoom 1 → half-extent 200 > map → centre.
      expect(clampViewportCenter(0, 100, 400, 1)).toBe(50)
      expect(clampViewportCenter(999, 100, 400, 1)).toBe(50)
    })

    await it('clamps the centre so the viewport stays inside a larger map', async () => {
      // map 1000, widget 200 @ zoom 1 → half 100 → centre in [100, 900].
      expect(clampViewportCenter(0, 1000, 200, 1)).toBe(100)
      expect(clampViewportCenter(5000, 1000, 200, 1)).toBe(900)
      expect(clampViewportCenter(500, 1000, 200, 1)).toBe(500)
    })

    await it('accounts for zoom in the visible half-extent', async () => {
      // zoom 2 halves the visible extent: widget 200 / zoom 2 → half 50 → [50, 950].
      expect(clampViewportCenter(0, 1000, 200, 2)).toBe(50)
      expect(clampViewportCenter(5000, 1000, 200, 2)).toBe(950)
    })

    await it('centres when the widget extent is unknown (0, pre-allocation)', async () => {
      expect(clampViewportCenter(123, 800, 0, 1)).toBe(400)
    })
  })
}

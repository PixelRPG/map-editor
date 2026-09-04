import { describe, expect, it } from '@gjsify/unit'
import type { MapData } from '@pixelrpg/engine'

import {
  clampViewportCenter,
  fingerprintMapData,
  fitBakeScale,
  fitDestRect,
  tileIntersectsClip,
  viewportSourceRect,
} from './map-preview.geometry.ts'

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

  await describe('fitDestRect', async () => {
    await it('fills the widget and centres on the unconstrained axis', async () => {
      expect(fitDestRect(400, 200, 100, 100)).toStrictEqual({ x: 100, y: 0, w: 200, h: 200 })
    })

    await it('picks the limiting axis', async () => {
      expect(fitDestRect(200, 400, 100, 100)).toStrictEqual({ x: 0, y: 100, w: 200, h: 200 })
    })

    await it('preserves a non-square map aspect', async () => {
      expect(fitDestRect(400, 400, 200, 100)).toStrictEqual({ x: 0, y: 100, w: 400, h: 200 })
    })
  })

  await describe('fitBakeScale', async () => {
    await it('never upscales a map smaller than the cap', async () => {
      expect(fitBakeScale(100, 80, 512)).toBe(1)
    })

    await it('caps the longest edge', async () => {
      expect(fitBakeScale(1024, 256, 512)).toBe(0.5)
    })
  })

  await describe('viewportSourceRect', async () => {
    await it('spans widget size divided by zoom, centred on the focus point', async () => {
      expect(viewportSourceRect(100, 100, 200, 100, 2)).toStrictEqual({ x: 50, y: 75, w: 100, h: 50 })
    })

    await it('rounds the origin to a whole map pixel (NEAREST seam guard)', async () => {
      expect(viewportSourceRect(100.4, 100, 101, 100, 1)).toStrictEqual({ x: 50, y: 50, w: 101, h: 100 })
    })
  })

  await describe('tileIntersectsClip', async () => {
    const clip = { x: 32, y: 32, w: 64, h: 64 }

    await it('keeps a tile inside the clip', async () => {
      expect(tileIntersectsClip(48, 48, 16, 16, clip)).toBe(true)
    })

    await it('drops a tile that ends exactly on the clip start', async () => {
      expect(tileIntersectsClip(16, 48, 16, 16, clip)).toBe(false)
    })

    await it('drops a tile that starts exactly on the clip end', async () => {
      expect(tileIntersectsClip(96, 48, 16, 16, clip)).toBe(false)
    })

    await it('keeps a tile straddling the clip edge', async () => {
      expect(tileIntersectsClip(24, 48, 16, 16, clip)).toBe(true)
    })
  })
}

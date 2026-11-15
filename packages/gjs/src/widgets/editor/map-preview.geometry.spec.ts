import { describe, expect, it } from '@gjsify/unit'
import type { MapData } from '@pixelrpg/engine'

import { fingerprintMapData, fitBakeScale, fitDestRect } from './map-preview.geometry.ts'

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

/** A one-layer map carrying exactly `sprites`. */
function layerOf(sprites: { x: number; y: number; spriteId: number; spriteSetId: string }[]): MapData {
  return makeMap({ layers: [{ id: 'g', name: 'G', visible: true, sprites }] } as unknown as Partial<MapData>)
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

    await it('counts a layer with no `visible` key — it is rendered', async () => {
      // The fingerprint is the bake-cache key, so it has to use the same
      // visibility predicate the bake does (`isLayerDataVisible`). If it
      // skipped absent-`visible` layers, editing one would not change the
      // key and the cache would serve a preview missing that layer.
      const withLayer = fingerprintMapData(
        makeMap({
          layers: [
            { id: 'ground', name: 'Ground', visible: true, sprites: [{ x: 0, y: 0, spriteId: 1, spriteSetId: 's' }] },
            { id: 'noflag', name: 'NoFlag', sprites: [{ x: 4, y: 4, spriteId: 9, spriteSetId: 's' }] },
          ] as unknown as never,
        }),
      )
      expect(withLayer).not.toBe(fingerprintMapData(makeMap()))
    })

    await it('reacts to a tile edit inside a layer with no `visible` key', async () => {
      const at = (x: number) =>
        fingerprintMapData(
          makeMap({
            layers: [
              { id: 'noflag', name: 'NoFlag', sprites: [{ x, y: 0, spriteId: 1, spriteSetId: 's' }] },
            ] as unknown as never,
          }),
        )
      expect(at(0)).not.toBe(at(1))
    })

    await it('changes when the background colour changes', async () => {
      expect(fingerprintMapData(makeMap({ backgroundColor: '#000' }))).not.toBe(
        fingerprintMapData(makeMap({ backgroundColor: '#001' })),
      )
    })

    await it('survives a map with no layers key at all', async () => {
      const fp = fingerprintMapData(makeMap({ layers: undefined }))
      expect(Number.isInteger(fp)).toBe(true)
    })

    // Regression: the fingerprint used to SUM a weighted per-tile term
    // into the accumulator. Summation is commutative, so these two maps
    // — plainly different on screen — hashed to the same value and the
    // bake cache handed back the pre-edit thumbnail.
    await it('distinguishes two tiles that swapped their sprite ids', async () => {
      const a = fingerprintMapData(
        layerOf([
          { x: 1, y: 0, spriteId: 1, spriteSetId: 's' },
          { x: 0, y: 1, spriteId: 2, spriteSetId: 's' },
        ]),
      )
      const b = fingerprintMapData(
        layerOf([
          { x: 1, y: 0, spriteId: 2, spriteSetId: 's' },
          { x: 0, y: 1, spriteId: 1, spriteSetId: 's' },
        ]),
      )
      expect(a).not.toBe(b)
    })

    await it('distinguishes two tiles that swapped positions', async () => {
      const a = fingerprintMapData(
        layerOf([
          { x: 0, y: 0, spriteId: 0, spriteSetId: 's' },
          { x: 1, y: 1, spriteId: 5, spriteSetId: 's' },
        ]),
      )
      const b = fingerprintMapData(
        layerOf([
          { x: 1, y: 1, spriteId: 0, spriteSetId: 's' },
          { x: 0, y: 0, spriteId: 5, spriteSetId: 's' },
        ]),
      )
      expect(a).not.toBe(b)
    })

    await it('distinguishes the same local sprite id in a DIFFERENT sprite set', async () => {
      const a = fingerprintMapData(layerOf([{ x: 0, y: 0, spriteId: 1, spriteSetId: 'grass' }]))
      const b = fingerprintMapData(layerOf([{ x: 0, y: 0, spriteId: 1, spriteSetId: 'stone' }]))
      expect(a).not.toBe(b)
    })

    await it('is still stable for the same tiles in the same order', async () => {
      const tiles = [
        { x: 1, y: 0, spriteId: 1, spriteSetId: 's' },
        { x: 0, y: 1, spriteId: 2, spriteSetId: 's' },
      ]
      expect(fingerprintMapData(layerOf(tiles))).toBe(fingerprintMapData(layerOf(tiles)))
    })

    await it('returns an unsigned 32-bit integer', async () => {
      const fp = fingerprintMapData(makeMap())
      expect(Number.isInteger(fp)).toBe(true)
      expect(fp >= 0).toBe(true)
      expect(fp <= 0xffffffff).toBe(true)
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

    await it('upscales a map smaller than the widget', async () => {
      expect(fitDestRect(400, 400, 100, 100)).toStrictEqual({ x: 0, y: 0, w: 400, h: 400 })
    })

    await it('collapses to a zero rect for a zero widget allocation', async () => {
      expect(fitDestRect(0, 0, 200, 100)).toStrictEqual({ x: 0, y: 0, w: 0, h: 0 })
    })

    await it('requires a non-zero MAP size — a zero map yields NaN', async () => {
      // Documents the precondition: `MapPreview` guards on `_mapWidth &&
      // _mapHeight` before every call. Without that guard the NaN rect
      // reaches Graphene and the preview silently paints nothing.
      const degenerate = fitDestRect(400, 400, 0, 0)
      expect(Number.isNaN(degenerate.w)).toBe(true)
      expect(Number.isNaN(degenerate.h)).toBe(true)
    })
  })

  await describe('fitBakeScale', async () => {
    await it('never upscales a map smaller than the cap', async () => {
      expect(fitBakeScale(100, 80, 512)).toBe(1)
    })

    await it('caps the longest edge', async () => {
      expect(fitBakeScale(1024, 256, 512)).toBe(0.5)
    })

    await it('caps on the TALLER edge too, not just width', async () => {
      expect(fitBakeScale(256, 1024, 512)).toBe(0.5)
    })

    await it('is exactly 1 at the cap', async () => {
      expect(fitBakeScale(512, 512, 512)).toBe(1)
    })

    await it('stays 1 for a degenerate map instead of returning Infinity', async () => {
      expect(fitBakeScale(0, 0, 512)).toBe(1)
    })
  })
}

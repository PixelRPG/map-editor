import { describe, expect, it } from '@gjsify/unit'
import { GraphicsGroup, Polygon, Rectangle } from 'excalibur'
import type { MapResource } from '../resource/MapResource.ts'
import type { EntityDefinition } from '../types/data/index.ts'
import { buildPlacementGraphic, fitContainScale, frameInset, markerColorFor } from './placement-graphic.ts'

const fakeMapResource = {
  mapData: { tileWidth: 16, tileHeight: 16, layers: [] },
  getSpriteSetResource: () => undefined,
} as unknown as MapResource

/** Unwrap a GraphicsGrouping | Graphic member to its Graphic. */
const memberGraphic = (group: GraphicsGroup, index: number) => {
  const member = group.members[index]
  return member && 'graphic' in member ? member.graphic : member
}

export default async () => {
  await describe('fitContainScale', async () => {
    await it('scales down to fit, preserving aspect', async () => {
      // 32×48 NPC cell into a 14×14 box → bound by height.
      expect(fitContainScale(32, 48, 14, 14)).toBe(14 / 48)
    })

    await it('scales up small content to cell size', async () => {
      expect(fitContainScale(4, 4, 14, 14)).toBe(3.5)
    })

    await it('returns 1 for degenerate inputs', async () => {
      expect(fitContainScale(0, 16, 14, 14)).toBe(1)
      expect(fitContainScale(16, 16, 0, 14)).toBe(1)
    })
  })

  await describe('frameInset', async () => {
    await it('is 1px on 16px tiles and grows with tile size', async () => {
      expect(frameInset(16, 16)).toBe(1)
      expect(frameInset(32, 32)).toBe(2)
      expect(frameInset(8, 8)).toBe(1)
    })
  })

  await describe('markerColorFor', async () => {
    await it('falls back for components without a marker colour', async () => {
      expect(markerColorFor([{ type: 'collision' }])).toBe('#ff9966')
      expect(markerColorFor([])).toBe('#ff9966')
    })

    await it('resolves by priority — teleport wins over trigger', async () => {
      const both = markerColorFor([
        { type: 'trigger', on: 'walk-onto' },
        { type: 'teleport', targetMapId: 'm', targetTileX: 0, targetTileY: 0 },
      ])
      expect(both).toBe(markerColorFor([{ type: 'teleport', targetMapId: 'm', targetTileX: 0, targetTileY: 0 }]))
    })
  })

  await describe('buildPlacementGraphic', async () => {
    // Raster graphics (Rectangle / Polygon) need a DOM canvas — present
    // under GJS / the browser, absent on a bare Node run (same gate as
    // spawn-placement.spec.ts).
    const domAvailable = typeof document !== 'undefined'

    await it('builds a tile-sized framed group with a type marker for a sprite-less def', async () => {
      if (!domAvailable) return
      const def: EntityDefinition = { id: 'w', name: 'Wall', components: [{ type: 'collision' }] }
      const group = buildPlacementGraphic(def, fakeMapResource, 16, 16)
      expect(group instanceof GraphicsGroup).toBe(true)
      expect(group.members.length).toBe(2)
      expect(memberGraphic(group, 0) instanceof Rectangle).toBe(true)
      expect(memberGraphic(group, 1) instanceof Polygon).toBe(true)
      expect(group.width).toBe(16)
      expect(group.height).toBe(16)
    })

    await it('falls back to the marker when the visual sprite set is missing', async () => {
      if (!domAvailable) return
      const def: EntityDefinition = {
        id: 'npc',
        name: 'Npc',
        components: [{ type: 'visual', spriteSetId: 'ghost-set', spriteId: 0 }],
      }
      const group = buildPlacementGraphic(def, fakeMapResource, 16, 16)
      expect(group.members.length).toBe(2)
      expect(memberGraphic(group, 1) instanceof Polygon).toBe(true)
    })
  })
}

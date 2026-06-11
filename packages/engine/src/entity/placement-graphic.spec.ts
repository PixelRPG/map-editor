import { describe, expect, it } from '@gjsify/unit'
import { Animation, GraphicsGroup, Polygon, Rectangle, type Sprite } from 'excalibur'
import type { MapResource } from '../resource/MapResource.ts'
import type { SpriteSetResource } from '../resource/SpriteSetResource.ts'
import type { ComponentData, EntityDefinition } from '../types/data/index.ts'
import { buildPlacementGraphic, fitContainScale, frameInset, markerColorFor } from './placement-graphic.ts'
import { buildVisualGraphic } from './visual-graphic.ts'

const fakeMapResource = {
  mapData: { tileWidth: 16, tileHeight: 16, layers: [] },
  getSpriteSetResource: () => undefined,
} as unknown as MapResource

/** Minimal Sprite stand-in: just the surface buildVisualGraphic touches. */
const fakeSprite = (width = 16, height = 32): Sprite => {
  const sprite = { width, height, clone: () => fakeSprite(width, height) }
  return sprite as unknown as Sprite
}

/**
 * A character appearance sheet the way C5 ships it: roles live in the
 * sheet-owned `characterAnimations`, the engine-level `animations`
 * lookup stays empty (verified: the starter scientist has
 * `animations: []`).
 */
const fakeCharacterSheet = {
  sprites: { 0: fakeSprite(), 1: fakeSprite() },
  animations: {},
  data: {
    characterAnimations: [{ id: 'idle-down', frames: [0, 1], durationMs: 200 }],
  },
} as unknown as SpriteSetResource

const characterMapResource = {
  mapData: { tileWidth: 16, tileHeight: 16, layers: [] },
  getSpriteSetResource: (id: string) => (id === 'scientist' ? fakeCharacterSheet : undefined),
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

  await describe('buildVisualGraphic', async () => {
    await it('resolves a character appearance via the sheet-owned characterAnimations', async () => {
      // A placed Cast NPC's visual component (characterToEntity output).
      const visual: ComponentData = { type: 'visual', spriteSetId: 'scientist', spriteId: 0, animationId: 'idle-down' }
      const graphic = buildVisualGraphic(visual, characterMapResource)
      expect(graphic instanceof Animation).toBe(true)
      expect((graphic as Animation).frames.length).toBe(2)
    })

    await it('falls back to the static sprite for an unknown animation id', async () => {
      const visual: ComponentData = { type: 'visual', spriteSetId: 'scientist', spriteId: 0, animationId: 'ghost' }
      const graphic = buildVisualGraphic(visual, characterMapResource)
      expect(graphic !== null).toBe(true)
      expect(graphic instanceof Animation).toBe(false)
      expect(graphic?.height).toBe(32)
    })

    await it('returns null when the sprite set is missing', async () => {
      const visual: ComponentData = { type: 'visual', spriteSetId: 'ghost-set', spriteId: 0 }
      expect(buildVisualGraphic(visual, characterMapResource)).toBe(null)
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

    await it('renders a placed Cast NPC with its appearance animation, not the marker', async () => {
      if (!domAvailable) return
      // characterToEntity output for a Cast character — the C6 "Cast NPCs
      // placeable" path. Must resolve the sheet's idle-down animation
      // instead of the diamond fallback.
      const def: EntityDefinition = {
        id: 'scientist',
        name: 'Scientist',
        components: [
          { type: 'visual', spriteSetId: 'scientist', spriteId: 0, animationId: 'idle-down' },
          { type: 'movement', tilesPerSec: 4 },
        ],
        editorData: { template: 'character' },
      }
      const group = buildPlacementGraphic(def, characterMapResource, 16, 16)
      expect(group.members.length).toBe(2)
      const content = memberGraphic(group, 1)
      expect(content instanceof Animation).toBe(true)
      expect(content instanceof Polygon).toBe(false)
      // Contain-fitted into the 14×14 framed area: 16×32 cell → bound by height.
      expect((content as Animation).scale.y).toBe(14 / 32)
    })
  })
}

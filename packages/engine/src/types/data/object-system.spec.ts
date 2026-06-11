import { describe, expect, it } from '@gjsify/unit'

import {
  type EntityDefinition,
  isComponentData,
  isEntityDefinition,
  isObjectPlacement,
  isTileProperties,
  type ObjectPlacement,
} from './index'

export default async () => {
  // ----------------------------------------------------------------
  // TileProperties
  // ----------------------------------------------------------------
  await describe('isTileProperties', async () => {
    await it('accepts an empty object — every field is optional', async () => {
      expect(isTileProperties({})).toBe(true)
    })

    await it('accepts a fully-populated tile', async () => {
      expect(
        isTileProperties({
          walkable: false,
          surface: 'water',
          footstepSound: 'splash',
          encounterTable: 'fishing-spots',
          custom: { magic: true },
        }),
      ).toBe(true)
    })

    await it('rejects wrong types', async () => {
      expect(isTileProperties({ walkable: 'yes' })).toBe(false)
      expect(isTileProperties({ surface: 42 })).toBe(false)
      expect(isTileProperties(null)).toBe(false)
    })
  })

  // ----------------------------------------------------------------
  // ComponentData
  // ----------------------------------------------------------------
  await describe('isComponentData', async () => {
    await it('accepts a typed component config', async () => {
      expect(isComponentData({ type: 'visual', spriteSetId: 's', spriteId: 0 })).toBe(true)
      expect(isComponentData({ type: 'collision' })).toBe(true)
    })
    await it('rejects a missing/invalid type', async () => {
      expect(isComponentData({ spriteId: 0 })).toBe(false)
      expect(isComponentData({ type: 7 })).toBe(false)
      expect(isComponentData(null)).toBe(false)
    })
  })

  // ----------------------------------------------------------------
  // EntityDefinition (structural guard — registry-aware check lives in
  // entity/validate.ts)
  // ----------------------------------------------------------------
  await describe('isEntityDefinition', async () => {
    await it('accepts a minimal definition', async () => {
      expect(isEntityDefinition({ id: 'hero', name: 'Hero', components: [] })).toBe(true)
    })

    await it('accepts a component-rich definition (the canonical NPC recipe)', async () => {
      const guard: EntityDefinition = {
        id: 'guard',
        name: 'Guard',
        components: [
          { type: 'visual', spriteSetId: 'soldier', spriteId: 0 },
          { type: 'movement', tilesPerSec: 3 },
          { type: 'dialogue', dialogueId: 'guard-1' },
          { type: 'trigger', on: 'action-button' },
        ],
        editorData: { template: 'npc' },
      }
      expect(isEntityDefinition(guard)).toBe(true)
    })

    await it('accepts conditional states', async () => {
      const door: EntityDefinition = {
        id: 'door',
        name: 'Door',
        components: [{ type: 'collision' }],
        states: [{ id: 'open', when: { flag: 'door-key' }, components: [] }],
      }
      expect(isEntityDefinition(door)).toBe(true)
    })

    await it('rejects definitions missing required fields', async () => {
      expect(isEntityDefinition({ name: 'no-id', components: [] })).toBe(false)
      expect(isEntityDefinition({ id: 'd', components: [] })).toBe(false)
      expect(isEntityDefinition({ id: 'd', name: 'no-components' })).toBe(false)
      expect(isEntityDefinition({ id: 'd', name: 'bad-components', components: [{ noType: true }] })).toBe(false)
    })
  })

  // ----------------------------------------------------------------
  // ObjectPlacement
  // ----------------------------------------------------------------
  await describe('isObjectPlacement', async () => {
    await it('accepts a library-referenced placement', async () => {
      const p: ObjectPlacement = { id: 'apple-1', layerId: 'foreground', tileX: 3, tileY: 7, defId: 'apple' }
      expect(isObjectPlacement(p)).toBe(true)
    })

    await it('accepts overrides (name + component replace)', async () => {
      const p: ObjectPlacement = {
        id: 'apple-2',
        layerId: 'foreground',
        tileX: 9,
        tileY: 4,
        defId: 'apple',
        overrides: { name: 'Golden Apple', components: [{ type: 'visual', spriteSetId: 'overworld', spriteId: 99 }] },
      }
      expect(isObjectPlacement(p)).toBe(true)
    })

    await it('accepts a fully-inline placement', async () => {
      const p: ObjectPlacement = {
        id: 'lava-pit-1',
        layerId: 'events',
        tileX: 5,
        tileY: 5,
        inline: {
          id: 'lava-pit-1-def',
          name: 'Lava Pit',
          components: [
            { type: 'trigger', on: 'walk-onto' },
            { type: 'custom-data', data: { damage: 10 } },
          ],
        },
      }
      expect(isObjectPlacement(p)).toBe(true)
    })

    await it('rejects placements with NEITHER defId nor inline', async () => {
      expect(isObjectPlacement({ id: 'p', layerId: 'l', tileX: 0, tileY: 0 })).toBe(false)
    })

    await it('rejects placements with BOTH defId AND inline (mutually exclusive)', async () => {
      expect(
        isObjectPlacement({
          id: 'p',
          layerId: 'l',
          tileX: 0,
          tileY: 0,
          defId: 'apple',
          inline: { id: 'p-inline', name: 'Apple', components: [] },
        }),
      ).toBe(false)
    })

    await it('rejects bad override shapes', async () => {
      expect(isObjectPlacement({ id: 'p', layerId: 'l', tileX: 0, tileY: 0, defId: 'a', overrides: { name: 7 } })).toBe(
        false,
      )
      expect(
        isObjectPlacement({ id: 'p', layerId: 'l', tileX: 0, tileY: 0, defId: 'a', overrides: { components: 'x' } }),
      ).toBe(false)
    })

    await it('rejects non-finite tile coordinates', async () => {
      expect(isObjectPlacement({ id: 'p', layerId: 'l', tileX: Number.NaN, tileY: 0, defId: 'a' })).toBe(false)
    })

    await it('rejects placements whose inline definition is malformed', async () => {
      expect(
        isObjectPlacement({ id: 'p', layerId: 'l', tileX: 0, tileY: 0, inline: { name: 'no-id', components: [] } }),
      ).toBe(false)
    })
  })
}

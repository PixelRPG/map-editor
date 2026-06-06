import { describe, expect, it } from '@gjsify/unit'

import {
  isObjectDefinition,
  isObjectPlacement,
  isSpriteRef,
  isTileProperties,
  isTriggerSpec,
  type ObjectDefinition,
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

    await it('accepts a free-form surface string (so projects can extend)', async () => {
      expect(isTileProperties({ surface: 'magma' })).toBe(true)
    })

    await it('rejects wrong types', async () => {
      expect(isTileProperties({ walkable: 'yes' })).toBe(false)
      expect(isTileProperties({ surface: 42 })).toBe(false)
      expect(isTileProperties({ custom: null })).toBe(false)
      expect(isTileProperties(null)).toBe(false)
      expect(isTileProperties('grass')).toBe(false)
    })
  })

  // ----------------------------------------------------------------
  // SpriteRef + TriggerSpec
  // ----------------------------------------------------------------
  await describe('isSpriteRef', async () => {
    await it('accepts a minimal ref', async () => {
      expect(isSpriteRef({ spriteSetId: 'minimalist', spriteId: 7 })).toBe(true)
    })

    await it('accepts an animated ref', async () => {
      expect(isSpriteRef({ spriteSetId: 'npc-pack', spriteId: 12, animationId: 'walk-down' })).toBe(true)
    })

    await it('rejects missing or wrong fields', async () => {
      expect(isSpriteRef({ spriteId: 7 })).toBe(false)
      expect(isSpriteRef({ spriteSetId: 'minimalist', spriteId: '7' })).toBe(false)
      expect(isSpriteRef(null)).toBe(false)
    })
  })

  await describe('isTriggerSpec', async () => {
    await it('accepts each canonical trigger mode', async () => {
      for (const on of ['walk-onto', 'walk-off', 'action-button', 'auto', 'none'] as const) {
        expect(isTriggerSpec({ on })).toBe(true)
      }
    })

    await it('accepts optional once + scriptId', async () => {
      expect(isTriggerSpec({ on: 'walk-onto', once: true, scriptId: 'pickup-apple' })).toBe(true)
    })

    await it('rejects unknown trigger modes', async () => {
      expect(isTriggerSpec({ on: 'on-fire' })).toBe(false)
      expect(isTriggerSpec({ on: '' })).toBe(false)
      expect(isTriggerSpec({})).toBe(false)
    })
  })

  // ----------------------------------------------------------------
  // ObjectDefinition
  // ----------------------------------------------------------------
  await describe('isObjectDefinition', async () => {
    await it('accepts each canonical kind', async () => {
      const kinds = ['event', 'teleport', 'item', 'npc', 'spawn-point', 'custom'] as const
      for (const kind of kinds) {
        expect(isObjectDefinition({ id: `def-${kind}`, kind, name: kind })).toBe(true)
      }
    })

    await it('rejects unknown kinds', async () => {
      expect(isObjectDefinition({ id: 'd', kind: 'collider', name: 'old-collider' })).toBe(false)
      expect(isObjectDefinition({ id: 'd', kind: '', name: 'empty' })).toBe(false)
    })

    await it('rejects definitions missing the required fields', async () => {
      expect(isObjectDefinition({ kind: 'event', name: 'no-id' })).toBe(false)
      expect(isObjectDefinition({ id: 'd', name: 'no-kind' })).toBe(false)
      expect(isObjectDefinition({ id: 'd', kind: 'event' })).toBe(false)
    })

    await it('accepts the canonical pattern recipes from the concept doc', async () => {
      const apple: ObjectDefinition = {
        id: 'apple',
        kind: 'item',
        name: 'Apple',
        sprite: { spriteSetId: 'overworld', spriteId: 4 },
        trigger: { on: 'walk-onto' },
        blocking: false,
        properties: { itemId: 'apple', qty: 1 },
      }
      expect(isObjectDefinition(apple)).toBe(true)

      const stone: ObjectDefinition = {
        id: 'liftable-stone',
        kind: 'item',
        name: 'Stone',
        sprite: { spriteSetId: 'overworld', spriteId: 18 },
        trigger: { on: 'action-button' },
        blocking: true,
        properties: { itemId: 'stone', qty: 1 },
      }
      expect(isObjectDefinition(stone)).toBe(true)

      const pad: ObjectDefinition = {
        id: 'cave-entrance',
        kind: 'teleport',
        name: 'Cave Entrance',
        trigger: { on: 'walk-onto' },
        blocking: false,
        properties: {
          targetMapId: 'cave',
          targetTileX: 4,
          targetTileY: 9,
          facing: 'down',
          label: 'Cave',
        },
      }
      expect(isObjectDefinition(pad)).toBe(true)

      const spawn: ObjectDefinition = {
        id: 'player-spawn',
        kind: 'spawn-point',
        name: 'Player Spawn',
        properties: { spawnId: 'player', facing: 'down' },
      }
      expect(isObjectDefinition(spawn)).toBe(true)

      const wall: ObjectDefinition = {
        id: 'invisible-wall',
        kind: 'custom',
        name: 'Invisible Wall',
        blocking: true,
        trigger: { on: 'none' },
      }
      expect(isObjectDefinition(wall)).toBe(true)
    })
  })

  // ----------------------------------------------------------------
  // ObjectPlacement
  // ----------------------------------------------------------------
  await describe('isObjectPlacement', async () => {
    await it('accepts a library-referenced placement', async () => {
      const p: ObjectPlacement = {
        id: 'apple-1',
        layerId: 'foreground',
        tileX: 3,
        tileY: 7,
        defId: 'apple',
      }
      expect(isObjectPlacement(p)).toBe(true)
    })

    await it('accepts a library-referenced placement with overrides', async () => {
      const p: ObjectPlacement = {
        id: 'apple-2',
        layerId: 'foreground',
        tileX: 9,
        tileY: 4,
        defId: 'apple',
        overrides: { name: 'Golden Apple', sprite: { spriteSetId: 'overworld', spriteId: 99 } },
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
          kind: 'event',
          name: 'Lava Pit',
          trigger: { on: 'walk-onto' },
          properties: { damage: 10 },
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
          inline: { id: 'p-inline', kind: 'item', name: 'Apple' },
        }),
      ).toBe(false)
    })

    await it('rejects non-finite tile coordinates', async () => {
      expect(isObjectPlacement({ id: 'p', layerId: 'l', tileX: Number.NaN, tileY: 0, defId: 'a' })).toBe(false)
      expect(isObjectPlacement({ id: 'p', layerId: 'l', tileX: 0, tileY: Number.POSITIVE_INFINITY, defId: 'a' })).toBe(
        false,
      )
    })

    await it('rejects empty layerId / id', async () => {
      expect(isObjectPlacement({ id: '', layerId: 'l', tileX: 0, tileY: 0, defId: 'a' })).toBe(false)
      expect(isObjectPlacement({ id: 'p', layerId: '', tileX: 0, tileY: 0, defId: 'a' })).toBe(false)
    })

    await it('rejects placements whose inline definition is malformed', async () => {
      expect(
        isObjectPlacement({
          id: 'p',
          layerId: 'l',
          tileX: 0,
          tileY: 0,
          inline: { kind: 'event', name: 'no-id' },
        }),
      ).toBe(false)
    })
  })
}

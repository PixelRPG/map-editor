import { describe, expect, it } from 'vitest'
import {
  type ObjectDefinition,
  type ObjectPlacement,
  isObjectDefinition,
  isObjectPlacement,
  isSpriteRef,
  isTileProperties,
  isTriggerSpec,
} from './index'

// ---------------------------------------------------------------------------
// TileProperties — gameplay properties on a sprite-set entry.
// ---------------------------------------------------------------------------

describe('isTileProperties', () => {
  it('accepts an empty object — every field is optional', () => {
    expect(isTileProperties({})).toBe(true)
  })

  it('accepts a fully-populated tile', () => {
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

  it('accepts a free-form surface string (so projects can extend)', () => {
    expect(isTileProperties({ surface: 'magma' })).toBe(true)
  })

  it('rejects wrong types', () => {
    expect(isTileProperties({ walkable: 'yes' })).toBe(false)
    expect(isTileProperties({ surface: 42 })).toBe(false)
    expect(isTileProperties({ custom: null })).toBe(false)
    expect(isTileProperties(null)).toBe(false)
    expect(isTileProperties('grass')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SpriteRef + TriggerSpec — building blocks for definitions.
// ---------------------------------------------------------------------------

describe('isSpriteRef', () => {
  it('accepts a minimal ref', () => {
    expect(isSpriteRef({ spriteSetId: 'minimalist', spriteId: 7 })).toBe(true)
  })

  it('accepts an animated ref', () => {
    expect(
      isSpriteRef({ spriteSetId: 'npc-pack', spriteId: 12, animationId: 'walk-down' }),
    ).toBe(true)
  })

  it('rejects missing or wrong fields', () => {
    expect(isSpriteRef({ spriteId: 7 })).toBe(false)
    expect(isSpriteRef({ spriteSetId: 'minimalist', spriteId: '7' })).toBe(false)
    expect(isSpriteRef(null)).toBe(false)
  })
})

describe('isTriggerSpec', () => {
  it('accepts each canonical trigger mode', () => {
    for (const on of ['walk-onto', 'walk-off', 'action-button', 'auto', 'none'] as const) {
      expect(isTriggerSpec({ on })).toBe(true)
    }
  })

  it('accepts optional once + scriptId', () => {
    expect(isTriggerSpec({ on: 'walk-onto', once: true, scriptId: 'pickup-apple' })).toBe(true)
  })

  it('rejects unknown trigger modes', () => {
    expect(isTriggerSpec({ on: 'on-fire' })).toBe(false)
    expect(isTriggerSpec({ on: '' })).toBe(false)
    expect(isTriggerSpec({})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ObjectDefinition — every canonical kind from the concept-doc table.
// ---------------------------------------------------------------------------

describe('isObjectDefinition', () => {
  it('accepts each canonical kind', () => {
    const kinds = ['event', 'teleport', 'item', 'npc', 'spawn-point', 'custom'] as const
    for (const kind of kinds) {
      expect(isObjectDefinition({ id: `def-${kind}`, kind, name: kind })).toBe(true)
    }
  })

  it('rejects unknown kinds', () => {
    expect(isObjectDefinition({ id: 'd', kind: 'collider', name: 'old-collider' })).toBe(false)
    expect(isObjectDefinition({ id: 'd', kind: '', name: 'empty' })).toBe(false)
  })

  it('rejects definitions missing the required fields', () => {
    expect(isObjectDefinition({ kind: 'event', name: 'no-id' })).toBe(false)
    expect(isObjectDefinition({ id: 'd', name: 'no-kind' })).toBe(false)
    expect(isObjectDefinition({ id: 'd', kind: 'event' })).toBe(false)
  })

  it('accepts the canonical pattern recipes from the concept doc', () => {
    // Apple on the ground — walk-onto pickup, non-blocking.
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

    // Zelda-stone — action-button lift, blocking. Same kind!
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

    // Teleport pad.
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

    // Spawn point — no sprite, no trigger.
    const spawn: ObjectDefinition = {
      id: 'player-spawn',
      kind: 'spawn-point',
      name: 'Player Spawn',
      properties: { spawnId: 'player', facing: 'down' },
    }
    expect(isObjectDefinition(spawn)).toBe(true)

    // Invisible wall — custom kind, no sprite, no trigger, blocking.
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

// ---------------------------------------------------------------------------
// ObjectPlacement — defId / inline mutual exclusion, layer + tile validation.
// ---------------------------------------------------------------------------

describe('isObjectPlacement', () => {
  it('accepts a library-referenced placement', () => {
    const p: ObjectPlacement = {
      id: 'apple-1',
      layerId: 'foreground',
      tileX: 3,
      tileY: 7,
      defId: 'apple',
    }
    expect(isObjectPlacement(p)).toBe(true)
  })

  it('accepts a library-referenced placement with overrides', () => {
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

  it('accepts a fully-inline placement', () => {
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

  it('rejects placements with NEITHER defId nor inline', () => {
    expect(
      isObjectPlacement({ id: 'p', layerId: 'l', tileX: 0, tileY: 0 }),
    ).toBe(false)
  })

  it('rejects placements with BOTH defId AND inline (mutually exclusive)', () => {
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

  it('rejects non-finite tile coordinates', () => {
    expect(
      isObjectPlacement({ id: 'p', layerId: 'l', tileX: Number.NaN, tileY: 0, defId: 'a' }),
    ).toBe(false)
    expect(
      isObjectPlacement({ id: 'p', layerId: 'l', tileX: 0, tileY: Number.POSITIVE_INFINITY, defId: 'a' }),
    ).toBe(false)
  })

  it('rejects empty layerId / id', () => {
    expect(
      isObjectPlacement({ id: '', layerId: 'l', tileX: 0, tileY: 0, defId: 'a' }),
    ).toBe(false)
    expect(
      isObjectPlacement({ id: 'p', layerId: '', tileX: 0, tileY: 0, defId: 'a' }),
    ).toBe(false)
  })

  it('rejects placements whose inline definition is malformed', () => {
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

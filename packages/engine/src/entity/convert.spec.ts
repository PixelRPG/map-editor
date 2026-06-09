import { describe, expect, it } from '@gjsify/unit'
import type { CharacterDefinition, ComponentData } from '../types/data/index.ts'
import { characterToEntity, entityToCharacter, isCharacterEntity, objectDefinitionToEntity } from './convert.ts'

function types(components: ComponentData[]): string[] {
  return components.map((c) => c.type)
}

export default async () => {
  await describe('objectDefinitionToEntity', async () => {
    await it('maps an item kind (sprite + trigger + blocking) to components', async () => {
      const entity = objectDefinitionToEntity({
        id: 'stone',
        kind: 'item',
        name: 'Stone',
        sprite: { spriteSetId: 'overworld', spriteId: 18 },
        trigger: { on: 'action-button', once: true },
        blocking: true,
        properties: { itemId: 'stone', qty: 1, pickupSound: 'lift' },
      })
      expect(entity.id).toBe('stone')
      expect(entity.name).toBe('Stone')
      expect(types(entity.components)).toStrictEqual(['visual', 'trigger', 'collision', 'item'])
      expect(entity.editorData?.template).toBe('item')
      const item = entity.components.find((c) => c.type === 'item')
      expect(item).toStrictEqual({ type: 'item', itemId: 'stone', qty: 1, pickupSound: 'lift' })
    })

    await it('maps a teleport kind', async () => {
      const entity = objectDefinitionToEntity({
        id: 'cave',
        kind: 'teleport',
        name: 'Cave',
        trigger: { on: 'walk-onto' },
        properties: { targetMapId: 'cave', targetTileX: 4, targetTileY: 9, facing: 'down', label: 'Cave' },
      })
      expect(types(entity.components)).toStrictEqual(['trigger', 'teleport'])
      expect(entity.components.find((c) => c.type === 'teleport')).toStrictEqual({
        type: 'teleport',
        targetMapId: 'cave',
        targetTileX: 4,
        targetTileY: 9,
        facing: 'down',
        label: 'Cave',
      })
    })

    await it('splits an npc kind into dialogue + npc-route', async () => {
      const entity = objectDefinitionToEntity({
        id: 'villager',
        kind: 'npc',
        name: 'Villager',
        sprite: { spriteSetId: 'people', spriteId: 0 },
        properties: { dialogueId: 'hello', route: [{ tileX: 1, tileY: 1 }], facing: 'left' },
      })
      expect(types(entity.components)).toStrictEqual(['visual', 'dialogue', 'npc-route'])
    })

    await it('maps a spawn-point kind', async () => {
      const entity = objectDefinitionToEntity({
        id: 'spawn',
        kind: 'spawn-point',
        name: 'Player Spawn',
        properties: { spawnId: 'player', facing: 'down' },
      })
      expect(entity.components).toStrictEqual([{ type: 'spawn-point', spawnId: 'player', facing: 'down' }])
    })

    await it('maps a custom bag to a custom-data component', async () => {
      const entity = objectDefinitionToEntity({
        id: 'pit',
        kind: 'event',
        name: 'Lava Pit',
        trigger: { on: 'walk-onto' },
        properties: { custom: { damage: 10 } },
      })
      expect(types(entity.components)).toStrictEqual(['trigger', 'custom-data'])
      expect(entity.components.find((c) => c.type === 'custom-data')).toStrictEqual({
        type: 'custom-data',
        data: { damage: 10 },
      })
    })

    await it('is idempotent — an already-migrated definition is returned unchanged', async () => {
      const already = { id: 'x', name: 'X', components: [{ type: 'collision' }] }
      expect(objectDefinitionToEntity(already)).toBe(already)
    })
  })

  await describe('characterToEntity / entityToCharacter', async () => {
    const hero: CharacterDefinition = {
      id: 'scientist',
      name: 'Scientist',
      kind: 'hero',
      spriteSetId: 'scientist',
      defaultAnimation: 'idle-down',
      speedTilesPerSec: 6,
    }

    await it('maps a character to a character-template entity', async () => {
      const entity = characterToEntity(hero)
      expect(entity.editorData?.template).toBe('character')
      expect(isCharacterEntity(entity)).toBe(true)
      expect(types(entity.components)).toStrictEqual(['visual', 'movement'])
      expect(entity.components.find((c) => c.type === 'visual')).toStrictEqual({
        type: 'visual',
        spriteSetId: 'scientist',
        spriteId: 0,
        animationId: 'idle-down',
      })
    })

    await it('round-trips through entityToCharacter (isPlayer from playerActorId)', async () => {
      const entity = characterToEntity(hero)
      const back = entityToCharacter(entity, 'scientist')
      expect(back).toStrictEqual({ ...hero, isPlayer: true })
      // Not the player when playerActorId differs.
      expect(entityToCharacter(entity, 'someone-else')?.isPlayer).toBe(false)
    })

    await it('returns null for an entity without a visual component', async () => {
      expect(entityToCharacter({ id: 'x', name: 'X', components: [{ type: 'collision' }] })).toBe(null)
    })

    await it('isCharacterEntity is strict on the template', async () => {
      // A chest has a visual but is NOT a character.
      expect(
        isCharacterEntity({
          id: 'chest',
          name: 'Chest',
          components: [{ type: 'visual', spriteSetId: 's', spriteId: 0 }],
        }),
      ).toBe(false)
    })
  })
}

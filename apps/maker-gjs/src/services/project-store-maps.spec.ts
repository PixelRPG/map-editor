import { describe, expect, it } from '@gjsify/unit'
import type { EntityDefinition, MapData } from '@pixelrpg/engine'

import {
  countDoorsInto,
  draftMapData,
  duplicateMapData,
  duplicateMapName,
  freeAtlasSlot,
  MAP_SIZE_PRESETS,
  mapReferenceFor,
  nextMapName,
  uniqueMapId,
} from './project-store-maps.ts'

const map = (overrides: Partial<MapData> = {}): MapData =>
  ({
    id: 'map-1',
    name: 'Map 1',
    version: '1.0.0',
    tileWidth: 16,
    tileHeight: 16,
    columns: 20,
    rows: 14,
    spriteSets: [],
    layers: [{ id: 'layer_0', name: 'Background', visible: true, sprites: [] }],
    ...overrides,
  }) as MapData

/** A door placement whose definition is inline on the placement. */
const door = (targetMapId: string, tileX = 1, tileY = 1) => ({
  id: `door-${targetMapId}-${tileX}-${tileY}`,
  tileX,
  tileY,
  inline: {
    id: `door-${targetMapId}`,
    name: 'Door',
    components: [{ type: 'teleport', targetMapId, targetTileX: 0, targetTileY: 0 }],
  },
})

export default async () => {
  await describe('nextMapName', async () => {
    await it('counts one past the existing maps', async () => {
      expect(nextMapName(['Map 1'])).toBe('Map 2')
      expect(nextMapName(['Forest', 'Cave', 'Town'])).toBe('Map 4')
      expect(nextMapName([])).toBe('Map 1')
    })

    await it('steps over a hand-renamed map that already holds the label', async () => {
      // Two maps, one of them called "Map 3" — the suggestion must not
      // duplicate a name the user can see in the world view.
      expect(nextMapName(['Map 3', 'Cave'])).toBe('Map 4')
      expect(nextMapName(['Map 3', 'Map 4'])).toBe('Map 5')
    })

    await it('substitutes into the translated template', async () => {
      expect(nextMapName(['Karte 1'], 'Karte %d')).toBe('Karte 2')
    })
  })

  await describe('duplicateMapName', async () => {
    await it('prefixes the source name', async () => {
      expect(duplicateMapName('Forest', ['Forest'])).toBe('Copy of Forest')
    })

    await it('numbers repeated duplicates', async () => {
      expect(duplicateMapName('Forest', ['Forest', 'Copy of Forest'])).toBe('Copy of Forest 2')
      expect(duplicateMapName('Forest', ['Forest', 'Copy of Forest', 'Copy of Forest 2'])).toBe('Copy of Forest 3')
    })
  })

  await describe('freeAtlasSlot', async () => {
    await it('returns the grid origin for an empty atlas', async () => {
      expect(freeAtlasSlot([])).toStrictEqual({ x: 20, y: 20 })
    })

    await it('walks the auto-layout grid past every occupied cell', async () => {
      expect(freeAtlasSlot([{ x: 20, y: 20 }])).toStrictEqual({ x: 380, y: 20 })
      expect(
        freeAtlasSlot([
          { x: 20, y: 20 },
          { x: 380, y: 20 },
          { x: 740, y: 20 },
        ]),
      ).toStrictEqual({ x: 20, y: 260 })
    })

    await it('treats a slightly dragged card as still holding its cell', async () => {
      // Within half a step — the new card would overlap it, so skip on.
      expect(freeAtlasSlot([{ x: 60, y: 44 }])).toStrictEqual({ x: 380, y: 20 })
    })

    await it('reuses a cell a dragged-away card left empty', async () => {
      expect(freeAtlasSlot([{ x: 2000, y: 2000 }])).toStrictEqual({ x: 20, y: 20 })
    })
  })

  await describe('uniqueMapId', async () => {
    await it('slugs the name and avoids taken ids', async () => {
      expect(uniqueMapId('Dark Cave', new Set())).toBe('dark-cave')
      expect(uniqueMapId('Dark Cave', new Set(['dark-cave']))).toBe('dark-cave-2')
    })

    await it('falls back to `map` when the name slugs to nothing', async () => {
      expect(uniqueMapId('…', new Set())).toBe('map')
    })
  })

  await describe('draftMapData', async () => {
    await it('builds a blank one-layer map at the requested size and slot', async () => {
      const data = draftMapData('cave', 'Cave', MAP_SIZE_PRESETS.medium, { x: 380, y: 20 })
      expect(data.id).toBe('cave')
      expect(data.name).toBe('Cave')
      expect(data.version).toBe('1.0.0')
      expect(data.tileWidth).toBe(16)
      expect(data.tileHeight).toBe(16)
      expect(data.columns).toBe(40)
      expect(data.rows).toBe(30)
      expect(data.spriteSets).toStrictEqual([])
      expect(data.layers).toHaveLength(1)
      expect(data.layers[0].id).toBe('layer_0')
      expect(data.layers[0].sprites).toStrictEqual([])
      expect(data.editorData?.atlasX).toBe(380)
      expect(data.editorData?.atlasY).toBe(20)
    })

    await it('clamps a custom size to a positive whole number of tiles', async () => {
      const data = draftMapData('tiny', 'Tiny', { columns: 0, rows: 7.9 }, { x: 20, y: 20 })
      expect(data.columns).toBe(1)
      expect(data.rows).toBe(7)
    })
  })

  await describe('duplicateMapData', async () => {
    await it('renames, re-slots and detaches the copy from its source', async () => {
      const source = map({
        id: 'forest',
        name: 'Forest',
        objectPlacements: [door('cave')] as MapData['objectPlacements'],
      })
      const copy = duplicateMapData(source, 'forest-2', 'Copy of Forest', { x: 380, y: 20 })
      expect(copy.id).toBe('forest-2')
      expect(copy.name).toBe('Copy of Forest')
      expect(copy.editorData?.atlasX).toBe(380)
      expect(copy.columns).toBe(source.columns)
      // Editing the copy must not reach back into the original — an
      // aliased layer array would apply every later edit to both maps.
      copy.layers[0].name = 'Changed'
      copy.objectPlacements?.push(door('town') as never)
      expect(source.layers[0].name).toBe('Background')
      expect(source.objectPlacements).toHaveLength(1)
    })
  })

  await describe('mapReferenceFor', async () => {
    await it('builds the project reference', async () => {
      expect(mapReferenceFor('cave', 'Cave', './maps/cave.json')).toStrictEqual({
        id: 'cave',
        name: 'Cave',
        path: './maps/cave.json',
        type: 'map',
      })
    })
  })

  await describe('countDoorsInto', async () => {
    const library: EntityDefinition[] = [
      {
        id: 'door-lib',
        name: 'Library Door',
        components: [{ type: 'teleport', targetMapId: 'cave', targetTileX: 0, targetTileY: 0 }],
      } as EntityDefinition,
    ]

    await it('counts every placement across every map that targets the id', async () => {
      const maps = [
        map({
          id: 'forest',
          objectPlacements: [door('cave', 1, 1), door('town', 2, 2)] as MapData['objectPlacements'],
        }),
        map({ id: 'town', objectPlacements: [door('cave', 3, 3)] as MapData['objectPlacements'] }),
      ]
      expect(countDoorsInto('cave', maps, [])).toBe(2)
      expect(countDoorsInto('town', maps, [])).toBe(1)
      expect(countDoorsInto('nowhere', maps, [])).toBe(0)
    })

    await it('counts a door created by the object brush (a defId reference)', async () => {
      const maps = [
        map({
          id: 'forest',
          objectPlacements: [{ id: 'p1', tileX: 4, tileY: 4, defId: 'door-lib' }] as MapData['objectPlacements'],
        }),
      ]
      expect(countDoorsInto('cave', maps, library)).toBe(1)
    })

    await it('ignores a map with no placements', async () => {
      expect(countDoorsInto('cave', [map()], [])).toBe(0)
    })
  })
}

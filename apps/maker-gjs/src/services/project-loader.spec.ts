import { describe, expect, it } from '@gjsify/unit'
import type { EntityDefinition, MapData } from '@pixelrpg/engine'
import { collectAtlasTeleports } from './project-loader.ts'

const makeMap = (id: string, objectPlacements: MapData['objectPlacements']): MapData =>
  ({
    id,
    name: id,
    columns: 10,
    rows: 10,
    tileWidth: 16,
    tileHeight: 16,
    layers: [],
    objectPlacements,
  }) as unknown as MapData

const teleportDef: EntityDefinition = {
  id: 'cave-door',
  name: 'Cave Door',
  components: [{ type: 'teleport', targetMapId: 'cave', targetTileX: 1, targetTileY: 2 }],
}

export default async () => {
  await describe('collectAtlasTeleports', async () => {
    await it('surfaces inline teleport placements', async () => {
      const maps = [makeMap('overworld', [{ id: 'p1', layerId: 'l1', tileX: 3, tileY: 4, inline: teleportDef }])]
      const teleports = collectAtlasTeleports(maps, [])
      expect(teleports).toStrictEqual([
        { from: 'overworld', fx: 3, fy: 4, to: 'cave', tx: 1, ty: 2, label: 'Cave Door' },
      ])
    })

    await it('surfaces defId teleport placements via the entity library', async () => {
      // REGRESSION: the overlay used to read `placement.inline` only, so a
      // teleport placed with the object brush (a defId reference) never
      // showed its atlas connection.
      const maps = [makeMap('overworld', [{ id: 'p1', layerId: 'l1', tileX: 5, tileY: 6, defId: 'cave-door' }])]
      const teleports = collectAtlasTeleports(maps, [teleportDef])
      expect(teleports).toStrictEqual([
        { from: 'overworld', fx: 5, fy: 6, to: 'cave', tx: 1, ty: 2, label: 'Cave Door' },
      ])
    })

    await it('honours per-placement overrides on a defId reference', async () => {
      const maps = [
        makeMap('overworld', [
          {
            id: 'p1',
            layerId: 'l1',
            tileX: 0,
            tileY: 0,
            defId: 'cave-door',
            overrides: {
              components: [{ type: 'teleport', targetMapId: 'dungeon', targetTileX: 9, targetTileY: 9, label: 'Down' }],
            },
          },
        ]),
      ]
      const teleports = collectAtlasTeleports(maps, [teleportDef])
      expect(teleports).toStrictEqual([{ from: 'overworld', fx: 0, fy: 0, to: 'dungeon', tx: 9, ty: 9, label: 'Down' }])
    })

    await it('skips non-teleport placements and unresolvable defIds', async () => {
      const npc: EntityDefinition = {
        id: 'npc',
        name: 'Npc',
        components: [{ type: 'visual', spriteSetId: 's', spriteId: 0 }],
      }
      const maps = [
        makeMap('overworld', [
          { id: 'p1', layerId: 'l1', tileX: 0, tileY: 0, inline: npc },
          { id: 'p2', layerId: 'l1', tileX: 1, tileY: 1, defId: 'ghost' },
        ]),
      ]
      expect(collectAtlasTeleports(maps, [teleportDef])).toStrictEqual([])
    })
  })
}

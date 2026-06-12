/**
 * `buildAgentMapData` — the agent-oriented map projection. Pins the
 * walkability fold (void / walkable / solid across visible layers,
 * solid wins, hidden layers ignored, blocking placements stamp solid)
 * and the placement summaries (canonical defId/inline resolution,
 * spawn-point + teleport extraction).
 */

import { describe, expect, it } from '@gjsify/unit'

import type { EntityDefinition, MapData, SpriteSetData } from '../types/data/index.ts'
import { buildAgentMapData } from './agent-map-data.ts'

function makeFixture(): { mapData: MapData; sets: Map<string, SpriteSetData>; library: EntityDefinition[] } {
  const sets = new Map<string, SpriteSetData>([
    [
      'terrain',
      {
        id: 'terrain',
        sprites: [
          { id: 0, col: 0, row: 0 },
          { id: 1, col: 1, row: 0, solid: true },
        ],
      } as unknown as SpriteSetData,
    ],
  ])
  const mapData = {
    id: 'm1',
    name: 'Test Map',
    columns: 3,
    rows: 2,
    tileWidth: 16,
    tileHeight: 16,
    layers: [
      {
        id: 'ground',
        name: 'Ground',
        visible: true,
        sprites: [
          { x: 0, y: 0, spriteId: 0, spriteSetId: 'terrain' },
          { x: 1, y: 0, spriteId: 1, spriteSetId: 'terrain' },
          { x: 0, y: 1, spriteId: 0, spriteSetId: 'terrain' },
        ],
      },
      {
        id: 'hidden',
        name: 'Hidden',
        visible: false,
        // Solid here must NOT count — the layer is hidden.
        sprites: [{ x: 0, y: 0, spriteId: 1, spriteSetId: 'terrain' }],
      },
    ],
    objectPlacements: [
      {
        id: 'p-door',
        layerId: 'ground',
        tileX: 2,
        tileY: 1,
        inline: {
          id: 'door-def',
          name: 'Door',
          components: [
            { type: 'trigger', on: 'walk-onto' },
            { type: 'teleport', targetMapId: 'm2', targetTileX: 5, targetTileY: 6, label: 'Inside' },
          ],
        },
      },
      {
        id: 'p-spawn',
        layerId: 'ground',
        tileX: 0,
        tileY: 1,
        defId: 'spawn-def',
      },
      {
        id: 'p-rock',
        layerId: 'ground',
        tileX: 0,
        tileY: 0,
        inline: { id: 'rock-def', name: 'Rock', components: [{ type: 'blocking' }] },
      },
    ],
  } as unknown as MapData
  const library: EntityDefinition[] = [
    {
      id: 'spawn-def',
      name: 'Player spawn',
      components: [{ type: 'spawn-point', spawnId: 'player', facing: 'down' }],
    } as unknown as EntityDefinition,
  ]
  return { mapData, sets, library }
}

export default async () => {
  await describe('buildAgentMapData', async () => {
    await it('folds walkability: walkable / solid / void, hidden layers ignored', async () => {
      const { mapData, sets, library } = makeFixture()
      const data = buildAgentMapData(mapData, sets, library)

      // (0,0) walkable tile but a blocking placement → '#'
      // (1,0) solid sprite → '#'; (2,0) no tile → ' '
      expect(data.walkability[0]).toBe('## ')
      // (0,1) walkable; (1,1) void; (2,1) void (door placement ≠ tile)
      expect(data.walkability[1]).toBe('.  ')
    })

    await it('summarises placements with resolved names + component types', async () => {
      const { mapData, sets, library } = makeFixture()
      const data = buildAgentMapData(mapData, sets, library)

      const door = data.placements.find((p) => p.id === 'p-door')
      expect(door?.name).toBe('Door')
      expect(door?.components).toStrictEqual(['trigger', 'teleport'])
      // defId placements resolve through the library (the canonical resolver)
      const spawn = data.placements.find((p) => p.id === 'p-spawn')
      expect(spawn?.name).toBe('Player spawn')
    })

    await it('extracts teleports with targets and spawn points with facing', async () => {
      const { mapData, sets, library } = makeFixture()
      const data = buildAgentMapData(mapData, sets, library)

      expect(data.teleports.length).toBe(1)
      expect(data.teleports[0].targetMapId).toBe('m2')
      expect(data.teleports[0].targetTileX).toBe(5)
      expect(data.teleports[0].label).toBe('Inside')

      expect(data.spawnPoints.length).toBe(1)
      expect(data.spawnPoints[0].spawnId).toBe('player')
      expect(data.spawnPoints[0].facing).toBe('down')
    })
  })
}

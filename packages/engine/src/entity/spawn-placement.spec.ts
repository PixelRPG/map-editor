import { describe, expect, it } from '@gjsify/unit'
import { type Actor, GraphicsGroup } from 'excalibur'
import {
  CollisionComponent,
  PlacementIdComponent,
  SpriteRefComponent,
  TeleportComponent,
  TileTransformComponent,
  TriggerComponent,
} from '../components/index.ts'
import { TIER_Z } from '../components/tilemap-tier.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { EntityDefinition, LayerData, ObjectPlacement } from '../types/data/index.ts'
import { buildPlacementEntity, placementSpawnWarnings } from './spawn-placement.ts'

const layer: LayerData = { id: 'l1', name: 'L', visible: true, sprites: [] }
const fakeMapResource = {
  mapData: { tileWidth: 16, tileHeight: 16, layers: [layer] },
  getSpriteSetResource: () => undefined,
} as unknown as MapResource
const layersById = new Map([[layer.id, layer]])

export default async () => {
  await describe('buildPlacementEntity — runtime parity', async () => {
    // Building an entity attaches Excalibur graphics (sprite or the outline
    // marker Rectangle), which need a DOM canvas. The spawn pipeline only
    // ever runs under GJS / the browser, where the DOM exists — so these
    // assertions run there and short-circuit on a bare Node run.
    const domAvailable = typeof document !== 'undefined'

    await it('attaches the always-on + per-component runtime components', async () => {
      if (!domAvailable) return
      const def: EntityDefinition = {
        id: 'cave',
        name: 'Cave',
        components: [
          { type: 'visual', spriteSetId: 'overworld', spriteId: 2 },
          { type: 'trigger', on: 'walk-onto' },
          { type: 'collision' },
          { type: 'teleport', targetMapId: 'cave', targetTileX: 1, targetTileY: 2 },
        ],
        editorData: { template: 'teleport' },
      }
      const entity = buildPlacementEntity(
        { id: 'cave-1', layerId: 'l1', tileX: 3, tileY: 4, inline: def },
        def,
        fakeMapResource,
        layersById,
      ) as Actor
      // Always-on
      expect(entity.has(TileTransformComponent)).toBe(true)
      expect(entity.get(PlacementIdComponent)?.id).toBe('cave-1')
      // Per-component
      expect(entity.has(SpriteRefComponent)).toBe(true)
      expect(entity.has(TriggerComponent)).toBe(true)
      expect(entity.has(CollisionComponent)).toBe(true)
      expect(entity.has(TeleportComponent)).toBe(true)
      // Tile-centre position + tier z
      expect(entity.pos.x).toBe(3 * 16 + 8)
      expect(entity.pos.y).toBe(4 * 16 + 8)
      expect(entity.z).toBe(TIER_Z.ground)
    })

    await it('builds no SpriteRef for a sprite-less definition', async () => {
      if (!domAvailable) return
      const def: EntityDefinition = { id: 'wall', name: 'Wall', components: [{ type: 'collision' }] }
      const entity = buildPlacementEntity(
        { id: 'wall-1', layerId: 'l1', tileX: 0, tileY: 0, inline: def },
        def,
        fakeMapResource,
        layersById,
      ) as Actor
      expect(entity.has(SpriteRefComponent)).toBe(false)
      expect(entity.has(CollisionComponent)).toBe(true)
    })

    await it('attaches the tile-like framed group graphic', async () => {
      if (!domAvailable) return
      const def: EntityDefinition = { id: 'wall', name: 'Wall', components: [{ type: 'collision' }] }
      const entity = buildPlacementEntity(
        { id: 'wall-2', layerId: 'l1', tileX: 1, tileY: 1, inline: def },
        def,
        fakeMapResource,
        layersById,
      ) as Actor
      expect(entity.graphics.current instanceof GraphicsGroup).toBe(true)
      expect((entity.graphics.current as GraphicsGroup).width).toBe(16)
    })
  })

  // Pure (no DOM) — runs on both targets.
  await describe('placementSpawnWarnings', async () => {
    const placement: ObjectPlacement = { id: 'p1', layerId: 'l1', tileX: 0, tileY: 0, defId: 'ghost' }

    await it('warns about an unresolved defId (deleted entity)', async () => {
      const warnings = placementSpawnWarnings(placement, null)
      expect(warnings.length).toBe(1)
      expect(warnings[0]).toContain('defId "ghost"')
    })

    await it('is silent for a complete definition', async () => {
      const def: EntityDefinition = {
        id: 'cave',
        name: 'Cave',
        components: [{ type: 'teleport', targetMapId: 'm', targetTileX: 1, targetTileY: 2 }],
      }
      expect(placementSpawnWarnings({ ...placement, defId: undefined, inline: def }, def)).toStrictEqual([])
    })

    await it('warns about an incomplete required field (drafted teleport)', async () => {
      // A teleport missing its required targetMapId — the save path allowed
      // it, but spawn surfaces the gap (and still spawns best-effort).
      const def: EntityDefinition = {
        id: 'cave',
        name: 'Cave',
        components: [{ type: 'teleport', targetTileX: 1, targetTileY: 2 }],
      }
      const warnings = placementSpawnWarnings({ ...placement, defId: undefined, inline: def }, def)
      expect(warnings.length).toBe(1)
      expect(warnings[0]).toContain('incomplete definition')
    })
  })
}

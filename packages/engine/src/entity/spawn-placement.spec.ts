import { describe, expect, it } from '@gjsify/unit'
import type { Actor } from 'excalibur'
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
import type { EntityDefinition, LayerData } from '../types/data/index.ts'
import { buildPlacementEntity, resolvePlacementDefinition } from './spawn-placement.ts'

const layer: LayerData = { id: 'l1', name: 'L', visible: true, sprites: [] }
const fakeMapResource = {
  mapData: { tileWidth: 16, tileHeight: 16, layers: [layer] },
  getSpriteSetResource: () => undefined,
} as unknown as MapResource
const layersById = new Map([[layer.id, layer]])

export default async () => {
  await describe('resolvePlacementDefinition', async () => {
    const library: EntityDefinition[] = [
      { id: 'apple', name: 'Apple', components: [{ type: 'item', itemId: 'apple' }] },
    ]

    await it('returns the inline definition verbatim', async () => {
      const inline: EntityDefinition = { id: 'd', name: 'D', components: [] }
      const placement = { id: 'p', layerId: 'l1', tileX: 0, tileY: 0, inline }
      expect(resolvePlacementDefinition(placement, library)).toBe(inline)
    })

    await it('looks up a library entry by defId', async () => {
      const placement = { id: 'p', layerId: 'l1', tileX: 0, tileY: 0, defId: 'apple' }
      expect(resolvePlacementDefinition(placement, library)?.name).toBe('Apple')
    })

    await it('merges overrides — name replace + wholesale-replace component per type', async () => {
      const placement = {
        id: 'p',
        layerId: 'l1',
        tileX: 0,
        tileY: 0,
        defId: 'apple',
        overrides: { name: 'Golden', components: [{ type: 'item', itemId: 'gold-apple', qty: 5 }] },
      }
      const resolved = resolvePlacementDefinition(placement, library)
      expect(resolved?.name).toBe('Golden')
      expect(resolved?.components).toStrictEqual([{ type: 'item', itemId: 'gold-apple', qty: 5 }])
    })

    await it('returns null when neither inline nor a known defId resolves', async () => {
      expect(resolvePlacementDefinition({ id: 'p', layerId: 'l1', tileX: 0, tileY: 0, defId: 'ghost' }, library)).toBe(
        null,
      )
    })
  })

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
  })
}

import { TileMap, Vector } from 'excalibur'
import type { TileSpriteRef } from '../components/map-editor.component.ts'
import { TIER_Z, TileMapTierComponent } from '../components/tilemap-tier.component.ts'
import { shadowCoordKey } from '../services/map-editor-shadow.service.ts'
import type { LayerData, LayerTier, MapData } from '../types/index.ts'
import { DEFAULT_LAYER_TIER, LAYER_TIERS } from '../types/data/LayerData.ts'

/**
 * Turning parsed {@link MapData} into the Excalibur tile grid.
 *
 * Split out of `MapResource` because it is the load-time half of that
 * class: it runs once, allocates the expensive per-cell `Tile` objects
 * (six figures for the ported worlds), and never runs again. Everything
 * else `MapResource` does is a query or a live edit against the result.
 */

/** Refs a layer contributed to one tier, keyed by the `"x,y"` shadow key. */
export type InitialSprites = Map<string, TileSpriteRef[]>

/** Whether a sprite reference makes its tile solid at load time. */
export type SolidityProbe = (spriteSetId: string, spriteId: number, placementSolid?: boolean) => boolean

/**
 * Build one `TileMap` per {@link LayerTier}, all with identical
 * dimensions and position so tile `(x, y)` resolves to congruent tiles
 * on every tier. Each carries a {@link TileMapTierComponent} marker and
 * a stable z from {@link TIER_Z}.
 *
 * All three tiers are always built, even when the map only has layers on
 * one. The unused tilemaps cost a few KB of empty grid but let
 * `TileEditorSystem` look the tier-matching tilemap up on every click
 * without first checking whether that tier exists.
 */
export function buildTierTileMaps(data: MapData): Map<LayerTier, TileMap> {
  const byTier = new Map<LayerTier, TileMap>()
  for (const tier of LAYER_TIERS) {
    const tilemap = new TileMap({
      name: `${data.name}:${tier}`,
      pos: data.pos ? new Vector(data.pos.x, data.pos.y) : undefined,
      tileWidth: data.tileWidth,
      tileHeight: data.tileHeight,
      columns: data.columns,
      rows: data.rows,
      renderFromTopOfGraphic: data.renderFromTopOfGraphic,
    })
    tilemap.addComponent(new TileMapTierComponent(tier))
    tilemap.z = TIER_Z[tier]
    byTier.set(tier, tilemap)
  }
  return byTier
}

/**
 * Route every layer's sprites into the tilemap matching its `tier`,
 * returning the per-tier initial shadow state.
 *
 * ALL layers are processed, including invisible ones, so the editor's
 * shadow holds a complete picture of every layer's content — the
 * visibility filter lives on the *render* path instead, which makes
 * toggling `layer.visible` at runtime a pure graphics refresh with no
 * re-read of the JSON.
 *
 * Layers are processed in ascending `properties.z` order, and sprite
 * positions stay global tile coordinates (the same `(x, y)` resolves to
 * congruent tiles on every tier).
 */
export function collectInitialSprites(
  data: MapData,
  tileMapsByTier: ReadonlyMap<LayerTier, TileMap>,
  isSolid: SolidityProbe,
): Map<LayerTier, InitialSprites> {
  const byTier = new Map<LayerTier, InitialSprites>()
  for (const tier of LAYER_TIERS) byTier.set(tier, new Map())

  const sortedLayers = [...data.layers].sort((a, b) => Number(a.properties?.z ?? 0) - Number(b.properties?.z ?? 0))
  for (const layer of sortedLayers) {
    const tier: LayerTier = layer.tier ?? DEFAULT_LAYER_TIER
    const tileMap = tileMapsByTier.get(tier)
    const initialSprites = byTier.get(tier)
    if (tileMap && initialSprites) collectLayer(layer, tileMap, initialSprites, isSolid)
  }
  return byTier
}

function collectLayer(
  layer: LayerData,
  tileMap: TileMap,
  initialSprites: InitialSprites,
  isSolid: SolidityProbe,
): void {
  if (!Array.isArray(layer.sprites) || layer.sprites.length === 0) return
  const layerZIndex = layer.properties?.z !== undefined ? Number(layer.properties.z) : 0

  for (const spriteData of layer.sprites) {
    if (spriteData.x < 0 || spriteData.x >= tileMap.columns || spriteData.y < 0 || spriteData.y >= tileMap.rows) {
      continue
    }
    if (spriteData.spriteId === undefined || !spriteData.spriteSetId) continue

    const tile = tileMap.getTile(spriteData.x, spriteData.y)
    if (!tile) continue

    if (spriteData.properties) {
      for (const [key, value] of Object.entries(spriteData.properties)) {
        tile.data.set(key, value)
      }
    }

    // A tile becomes solid as soon as any layer's sprite at this
    // position contributes solidity. Sticky — once true on this load
    // pass we don't let later non-solid sprites unset it.
    if (isSolid(spriteData.spriteSetId, spriteData.spriteId, spriteData.solid)) {
      tile.solid = true
    }

    const key = shadowCoordKey(spriteData.x, spriteData.y)
    const existingRefs = initialSprites.get(key) ?? []
    existingRefs.push({
      spriteSetId: spriteData.spriteSetId,
      spriteId: spriteData.spriteId,
      animationId: spriteData.animationId,
      zIndex: spriteData.zIndex !== undefined ? spriteData.zIndex : layerZIndex,
      layerId: layer.id,
    })
    initialSprites.set(key, existingRefs)
  }
}

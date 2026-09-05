import { TileMap, Vector } from 'excalibur'
import type { TileSpriteRef } from '../components/map-editor.component.ts'
import { TileMapPlaneComponent, zFor } from '../components/tilemap-plane.component.ts'
import { shadowCoordKey } from '../services/map-editor-shadow.service.ts'
import type { LayerData, LayerPlane, MapData } from '../types/index.ts'
import { DEFAULT_LAYER_PLANE, LAYER_PLANES } from '../types/data/LayerData.ts'

/**
 * Turning parsed {@link MapData} into the Excalibur tile grid.
 *
 * Split out of `MapResource` because it is the load-time half of that
 * class: it runs once, allocates the expensive per-cell `Tile` objects
 * (six figures for the ported worlds), and never runs again. Everything
 * else `MapResource` does is a query or a live edit against the result.
 */

/** Refs a layer contributed to one plane, keyed by the `"x,y"` shadow key. */
export type InitialSprites = Map<string, TileSpriteRef[]>

/** Whether a sprite reference makes its tile solid at load time. */
export type SolidityProbe = (spriteSetId: string, spriteId: number, placementSolid?: boolean) => boolean

/**
 * Build one `TileMap` per {@link LayerPlane}, all with identical
 * dimensions and position so tile `(x, y)` resolves to congruent tiles
 * on every plane. Each carries a {@link TileMapPlaneComponent} marker
 * and its z from {@link zFor}.
 *
 * All three planes are always built, even when the map only has layers
 * on one. The unused tilemaps cost a few KB of empty grid but let
 * `TileEditorSystem` look the plane-matching tilemap up on every click
 * without first checking whether that plane exists.
 */
export function buildPlaneTileMaps(data: MapData): Map<LayerPlane, TileMap> {
  const byPlane = new Map<LayerPlane, TileMap>()
  for (const plane of LAYER_PLANES) {
    const tilemap = new TileMap({
      name: `${data.name}:${plane}`,
      pos: data.pos ? new Vector(data.pos.x, data.pos.y) : undefined,
      tileWidth: data.tileWidth,
      tileHeight: data.tileHeight,
      columns: data.columns,
      rows: data.rows,
      renderFromTopOfGraphic: data.renderFromTopOfGraphic,
    })
    tilemap.addComponent(new TileMapPlaneComponent(plane))
    tilemap.z = zFor(plane)
    byPlane.set(plane, tilemap)
  }
  return byPlane
}

/**
 * Route every layer's sprites into the tilemap matching its `plane`,
 * returning the per-plane initial shadow state.
 *
 * ALL layers are processed, including invisible ones, so the editor's
 * shadow holds a complete picture of every layer's content — the
 * visibility filter lives on the *render* path instead, which makes
 * toggling `layer.visible` at runtime a pure graphics refresh with no
 * re-read of the JSON.
 *
 * Layers are walked in array order and sprite positions stay global
 * tile coordinates (the same `(x, y)` resolves to congruent tiles on
 * every plane). The shadow's insertion order carries no meaning: the
 * render path sorts each cell by layer order (`services/layer-order.ts`).
 */
export function collectInitialSprites(
  data: MapData,
  tileMapsByPlane: ReadonlyMap<LayerPlane, TileMap>,
  isSolid: SolidityProbe,
): Map<LayerPlane, InitialSprites> {
  const byPlane = new Map<LayerPlane, InitialSprites>()
  for (const plane of LAYER_PLANES) byPlane.set(plane, new Map())

  for (const layer of data.layers) {
    const plane: LayerPlane = layer.plane ?? DEFAULT_LAYER_PLANE
    const tileMap = tileMapsByPlane.get(plane)
    const initialSprites = byPlane.get(plane)
    if (tileMap && initialSprites) collectLayer(layer, tileMap, initialSprites, isSolid)
  }
  return byPlane
}

function collectLayer(
  layer: LayerData,
  tileMap: TileMap,
  initialSprites: InitialSprites,
  isSolid: SolidityProbe,
): void {
  if (!Array.isArray(layer.sprites) || layer.sprites.length === 0) return

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
      layerId: layer.id,
    })
    initialSprites.set(key, existingRefs)
  }
}

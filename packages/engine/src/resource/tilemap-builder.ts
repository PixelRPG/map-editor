import type { Tile, TileMap } from 'excalibur'
import { Vector } from 'excalibur'
import type { TileSpriteRef } from '../components/map-editor.component.ts'
import { BakedChunksComponent } from '../components/baked-chunks.component.ts'
import { makeChunkGrid } from '../services/tile-chunks.ts'
import { TileMapPlaneComponent, zFor } from '../components/tilemap-plane.component.ts'
import { shadowCoordKey } from '../services/map-editor-shadow.service.ts'
import type { LayerData, LayerPlane, MapData } from '../types/index.ts'
import { DEFAULT_LAYER_PLANE, LAYER_PLANES } from '../types/data/LayerData.ts'
import { PlaneTileMap } from './plane-tile-map.ts'
import { type TileCollisionRef, tileCollisionOf } from './tile-collision.ts'
import { applyTileColliders } from './tile-collider.ts'

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

/**
 * What a sprite reference contributes to its tile's collision at load
 * time — whether it blocks, and the shapes it blocks with.
 */
export type CollisionProbe = (spriteSetId: string, spriteId: number, placementSolid?: boolean) => TileCollisionRef

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
    const tilemap = new PlaneTileMap({
      name: `${data.name}:${plane}`,
      pos: data.pos ? new Vector(data.pos.x, data.pos.y) : undefined,
      tileWidth: data.tileWidth,
      tileHeight: data.tileHeight,
      columns: data.columns,
      rows: data.rows,
      renderFromTopOfGraphic: data.renderFromTopOfGraphic,
      // Set explicitly rather than inherited: Excalibur's physics config
      // default never reaches a TileMap (1.0's constructor assigns
      // 'separate' before applying `options`), so leaving it out would
      // silently pin the value to whatever that constructor does next.
      // Benched both on the Zelda-like map: the run scenario differs by
      // ~2 % (p50 36.80 ms 'together' vs 37.57 ms 'separate'), i.e. noise,
      // and we listen to no tilemap collision events — so take 1.0's own
      // level-building default. See docs/design/excalibur-1.md § O4.
      compositeStrategy: 'separate',
    })
    tilemap.addComponent(new TileMapPlaneComponent(plane))
    tilemap.addComponent(new BakedChunksComponent(makeChunkGrid(data.columns, data.rows)))
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
  probe: CollisionProbe,
): Map<LayerPlane, InitialSprites> {
  const byPlane = new Map<LayerPlane, InitialSprites>()
  for (const plane of LAYER_PLANES) byPlane.set(plane, new Map())

  // Only tiles something blocks on land here, so the map stays small
  // even on the ported worlds' six-figure grids. Folding is deferred
  // to the end because solidity and shapes are a union over every
  // layer's sprite at that coordinate, not a per-layer decision.
  const blocking = new Map<Tile, TileCollisionRef[]>()

  for (const layer of data.layers) {
    const plane: LayerPlane = layer.plane ?? DEFAULT_LAYER_PLANE
    const tileMap = tileMapsByPlane.get(plane)
    const initialSprites = byPlane.get(plane)
    if (tileMap && initialSprites) collectLayer(layer, tileMap, initialSprites, probe, blocking)
  }

  for (const [tile, refs] of blocking) {
    const collision = tileCollisionOf(refs)
    tile.isSolid = collision.solid
    // An empty shape list means "use the tile bounds", which is also
    // the fresh state of every tile — so only touch the tile when it
    // really carries shapes.
    if (collision.colliders?.length) applyTileColliders(tile, collision.colliders)
  }
  return byPlane
}

function collectLayer(
  layer: LayerData,
  tileMap: TileMap,
  initialSprites: InitialSprites,
  probe: CollisionProbe,
  blocking: Map<Tile, TileCollisionRef[]>,
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
    // position contributes solidity, and carries the union of those
    // sprites' shapes. Collected now, folded once per tile by the
    // caller.
    const ref = probe(spriteData.spriteSetId, spriteData.spriteId, spriteData.solid)
    if (ref.solid) {
      const refs = blocking.get(tile)
      if (refs) refs.push(ref)
      else blocking.set(tile, [ref])
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

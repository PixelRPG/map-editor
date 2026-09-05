// Pure draw-op assembly for {@link MapPreview}: which tiles a bake
// paints, which atlas region each reads from, and where the snapshot has
// to be translated to line that region up with the tile. GTK-free (the
// Gdk import is type-only) so it can be unit-tested — `map-preview.bake.ts`
// pulls in Gsk/Gtk for the actual rasterisation and cannot.

import type Gdk from '@girs/gdk-4.0'
import { isLayerDataVisible, type MapData } from '@pixelrpg/engine'

import type { GdkSpriteSheet } from '../../sprite/objects/GdkSpriteSheet'
import { type MapRect, tileIntersectsClip } from './map-preview.geometry.ts'

/** One tile of a bake: where to read from the atlas and where to put it. */
export interface DrawOp {
  texture: Gdk.Texture
  /** Sprite location in the atlas (source coordinates, source pixels). */
  sx: number
  sy: number
  sw: number
  sh: number
  /** Tile position in the map (pre-scale, in map-pixel units). */
  tx: number
  ty: number
  tw: number
  th: number
}

/** A sprite-set's decoded sheet plus the global id range it covers. */
export interface SheetRange {
  spriteSetId: string
  start: number
  end: number
  sheet: GdkSpriteSheet
}

/** Where and how a bake paints: scale plus the map-pixel offset. */
export interface BakeOffset {
  scale: number
  offsetXMapPx: number
  offsetYMapPx: number
}

/**
 * Look up a sprite by its `(spriteSetId, spriteId)` reference and resolve it
 * to a renderable atlas region. The map format stores `spriteId` as a
 * **local** 0-based index within the named set.
 */
function resolveSpriteByLocalId(
  ranges: readonly SheetRange[],
  spriteSetId: string,
  localId: number,
): { texture: Gdk.Texture; x: number; y: number; width: number; height: number } | null {
  const sprite = ranges.find((r) => r.spriteSetId === spriteSetId)?.sheet.sprites[localId]
  const texture = sprite?.sourceTexture
  if (!sprite || !texture) return null
  return { texture, x: sprite.x, y: sprite.y, width: sprite.width, height: sprite.height }
}

/**
 * Build the per-tile draw ops for a map, optionally clipped to a map-px rect.
 *
 * Layer visibility goes through the engine's `isLayerDataVisible`, not a
 * local truthiness test: a descriptor with no `visible` key is VISIBLE,
 * and a truthy test here dropped such a layer from every preview while
 * the engine rendered it. `fingerprintMapData` must use the same
 * predicate — it is the cache key for what this function bakes.
 */
export function buildDrawOps(mapData: MapData, ranges: readonly SheetRange[], clip: MapRect | null): DrawOp[] {
  const ops: DrawOp[] = []
  for (const layer of mapData.layers ?? []) {
    if (!isLayerDataVisible(layer) || !layer.sprites) continue
    for (const tile of layer.sprites) {
      const tx = tile.x * mapData.tileWidth
      const ty = tile.y * mapData.tileHeight
      if (clip && !tileIntersectsClip(tx, ty, mapData.tileWidth, mapData.tileHeight, clip)) continue
      const resolved = resolveSpriteByLocalId(ranges, tile.spriteSetId, tile.spriteId)
      if (!resolved) continue
      ops.push({
        texture: resolved.texture,
        sx: resolved.x,
        sy: resolved.y,
        sw: resolved.width,
        sh: resolved.height,
        tx,
        ty,
        tw: mapData.tileWidth,
        th: mapData.tileHeight,
      })
    }
  }
  return ops
}

/** Where one tile's clip rect, atlas translation and full-atlas rect land. */
export interface TileTransform {
  /** Clip rect for the tile, in bake pixels. */
  targetX: number
  targetY: number
  targetW: number
  targetH: number
  /** Snapshot translation that lines the atlas sub-region up with the clip. */
  translateX: number
  translateY: number
  /** Factor the whole atlas is drawn at so `sw` source px cover `targetW`. */
  atlasScale: number
}

/**
 * Bake-space placement of a single tile.
 *
 * The atlas texture is painted WHOLE and clipped down to the tile, so the
 * translation has to cancel the sprite's own atlas offset at the same
 * scale the atlas is drawn at — `atlasScale` is that factor, not the bake
 * scale. A source width of 0 (a malformed sheet entry) would make it
 * infinite, so it degrades to `scale` and the tile paints from the atlas
 * origin instead of poisoning the snapshot with NaN geometry.
 */
export function tileTransform(op: DrawOp, placement: BakeOffset): TileTransform {
  const { scale, offsetXMapPx, offsetYMapPx } = placement
  const targetX = (op.tx + offsetXMapPx) * scale
  const targetY = (op.ty + offsetYMapPx) * scale
  const targetW = op.tw * scale
  const targetH = op.th * scale
  const atlasScale = op.sw > 0 ? targetW / op.sw : scale
  return {
    targetX,
    targetY,
    targetW,
    targetH,
    translateX: targetX - op.sx * atlasScale,
    translateY: targetY - op.sy * atlasScale,
    atlasScale,
  }
}

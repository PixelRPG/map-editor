import { isLayerDataVisible, type MapData } from '@pixelrpg/engine'

/**
 * Pure geometry + cache-key helpers for {@link MapPreview}, split out so they
 * carry no GTK/Gdk dependency and can be unit-tested headlessly (the widget
 * itself can't — it subclasses `Gtk.Widget`).
 */

/** An axis-aligned rectangle in map pixels. */
export interface MapRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Cheap content stamp for cache keys: tile edits change the result, so a
 * re-entered atlas re-bakes exactly the maps that changed. Not cryptographic
 * — a collision merely shows a stale thumbnail.
 *
 * Skips exactly the layers `buildDrawOps` skips, via the same
 * `isLayerDataVisible` predicate. If the two disagreed, an edit to a
 * layer one of them ignores would not move the key and the cache would
 * serve a preview that never had it.
 */
export function fingerprintMapData(mapData: MapData): number {
  let hash = ((mapData.columns * 73856093) ^ (mapData.rows * 19349663)) | 0
  for (const layer of mapData.layers ?? []) {
    if (!isLayerDataVisible(layer) || !layer.sprites) continue
    hash = (hash * 31 + layer.sprites.length) | 0
    for (const tile of layer.sprites) {
      // Mix each field SEQUENTIALLY. The previous shape summed a weighted
      // per-tile term into the accumulator, which is commutative: two
      // tiles that swapped their sprite ids — or their positions —
      // fingerprinted identically, and the bake cache then served the
      // pre-edit thumbnail. `spriteSetId` rides along because the same
      // local sprite index means a different image in another set.
      hash = (hash * 31 + tile.x) | 0
      hash = (hash * 31 + tile.y) | 0
      hash = (hash * 31 + tile.spriteId) | 0
      hash = hashText(hash, tile.spriteSetId ?? '')
    }
  }
  return hashText(hash, mapData.backgroundColor ?? '') >>> 0
}

/** Fold `text` into `hash` (djb2-style), so string fields count too. */
function hashText(hash: number, text: string): number {
  let next = hash
  for (let i = 0; i < text.length; i++) next = (next * 33 + text.charCodeAt(i)) | 0
  return next
}

/**
 * Destination rect: the whole map scaled to fit the widget and centred in
 * it, preserving aspect.
 */
export function fitDestRect(widgetWidth: number, widgetHeight: number, mapWidth: number, mapHeight: number): MapRect {
  const scale = Math.min(widgetWidth / mapWidth, widgetHeight / mapHeight)
  const w = mapWidth * scale
  const h = mapHeight * scale
  return { x: (widgetWidth - w) / 2, y: (widgetHeight - h) / 2, w, h }
}

/**
 * Bake scale: the whole map, never upscaled and never wider or taller than
 * `maxEdge` — those bakes are small thumbnails held in an LRU, so their
 * memory cost is capped rather than proportional to the world.
 */
export function fitBakeScale(mapWidth: number, mapHeight: number, maxEdge: number): number {
  return Math.min(1, maxEdge / Math.max(mapWidth, mapHeight))
}

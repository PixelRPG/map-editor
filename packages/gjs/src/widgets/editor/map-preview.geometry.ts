import type { MapData } from '@pixelrpg/engine'

/**
 * Pure geometry + cache-key helpers for {@link MapPreview}, split out so they
 * carry no GTK/Gdk dependency and can be unit-tested headlessly (the widget
 * itself can't — it subclasses `Gtk.Widget`).
 */

/**
 * Cheap content stamp for cache keys: tile edits change the result, so a
 * re-entered atlas re-bakes exactly the maps that changed. Not cryptographic
 * — a collision merely shows a stale thumbnail.
 */
export function fingerprintMapData(mapData: MapData): number {
  let hash = ((mapData.columns * 73856093) ^ (mapData.rows * 19349663)) | 0
  for (const layer of mapData.layers ?? []) {
    if (!layer.visible || !layer.sprites) continue
    hash = (hash * 31 + layer.sprites.length) | 0
    for (const tile of layer.sprites) {
      hash = (hash + tile.x * 31 + tile.y * 131 + tile.spriteId * 7) | 0
    }
  }
  const background = mapData.backgroundColor ?? ''
  for (let i = 0; i < background.length; i++) hash = (hash * 33 + background.charCodeAt(i)) | 0
  return hash >>> 0
}

/**
 * Keep the viewport centre inside the map. Maps smaller than the viewport
 * centre. `widgetExtent` 0 (pre-allocation) also centres — the bake re-clamps
 * once the real widget size is known. `zoom` scales the visible half-extent.
 */
export function clampViewportCenter(value: number, mapExtent: number, widgetExtent: number, zoom: number): number {
  const half = widgetExtent > 0 ? widgetExtent / zoom / 2 : 0
  if (!half || mapExtent <= half * 2) return mapExtent / 2
  return Math.min(Math.max(value, half), mapExtent - half)
}

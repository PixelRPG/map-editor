import type { MapData } from '@pixelrpg/engine'

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

/**
 * Fit-mode destination rect: the whole map scaled to fit the widget and
 * centred in it, preserving aspect.
 */
export function fitDestRect(widgetWidth: number, widgetHeight: number, mapWidth: number, mapHeight: number): MapRect {
  const scale = Math.min(widgetWidth / mapWidth, widgetHeight / mapHeight)
  const w = mapWidth * scale
  const h = mapHeight * scale
  return { x: (widgetWidth - w) / 2, y: (widgetHeight - h) / 2, w, h }
}

/**
 * Fit-mode bake scale: the whole map, never upscaled and never wider or
 * taller than `maxEdge` — those bakes are small thumbnails held in an LRU,
 * so their memory cost is capped rather than proportional to the world.
 */
export function fitBakeScale(mapWidth: number, mapHeight: number, maxEdge: number): number {
  return Math.min(1, maxEdge / Math.max(mapWidth, mapHeight))
}

/**
 * Viewport-mode source rect in map pixels for a widget of `widgetWidth ×
 * widgetHeight` at `zoom`, centred on `(centerX, centerY)`.
 *
 * The origin is rounded to a whole map pixel: a fractional origin lands
 * every tile's clip edge between device pixels, and the NEAREST-sampled
 * atlas then bleeds a hairline of the neighbouring sheet cell through —
 * visible as faint seams across the preview.
 */
export function viewportSourceRect(
  centerX: number,
  centerY: number,
  widgetWidth: number,
  widgetHeight: number,
  zoom: number,
): MapRect {
  const w = widgetWidth / zoom
  const h = widgetHeight / zoom
  return { x: Math.round(centerX - w / 2), y: Math.round(centerY - h / 2), w, h }
}

/** Whether a tile at `(x, y)` of size `tileWidth × tileHeight` overlaps `clip`. */
export function tileIntersectsClip(
  x: number,
  y: number,
  tileWidth: number,
  tileHeight: number,
  clip: MapRect,
): boolean {
  return x + tileWidth > clip.x && x < clip.x + clip.w && y + tileHeight > clip.y && y < clip.y + clip.h
}

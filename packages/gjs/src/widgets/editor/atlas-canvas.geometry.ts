// Pure atlas-surface geometry: how big a scene's map is in atlas space,
// how far the world reaches, and where a dragged card lands. All values
// are in ATLAS space — turning them into surface pixels at the current
// zoom is `atlas-camera.ts`'s job. GTK-free so it can be unit-tested
// (the canvas subclasses `Adw.Bin`).

/** The scene fields the surface geometry reads — `SampleScene` satisfies it. */
export interface SceneBox {
  x: number
  y: number
  tilePx: number
  rows: string[]
  cols?: number
  previewRows?: number
}

/** A scene's bounding box on the atlas surface, in surface pixels. */
export interface SceneRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * A scene card's rendered size. Real-project scenes carry no terrain rows
 * — fall back to the `cols`/`previewRows` card geometry so the surface
 * still spans them.
 */
export function sceneGeometry(scene: SceneBox): { w: number; h: number } {
  const cols = scene.rows[0]?.length || scene.cols || 0
  const rows = scene.rows.length || scene.previewRows || 0
  return { w: cols * scene.tilePx, h: rows * scene.tilePx }
}

/** Every scene's bounding box, in scene order — feeds the overview minimap. */
export function sceneRects(scenes: readonly SceneBox[]): SceneRect[] {
  return scenes.map((scene) => ({ x: scene.x, y: scene.y, ...sceneGeometry(scene) }))
}

/**
 * Bottom-right corner of the union of a set of rects (0,0 when empty).
 * Works in whichever space the rects are in — the camera measures the
 * drawn world with it, {@link worldExtent} measures the atlas world.
 */
export function rectExtent(rects: readonly SceneRect[]): { width: number; height: number } {
  let width = 0
  let height = 0
  for (const rect of rects) {
    width = Math.max(width, rect.x + rect.w)
    height = Math.max(height, rect.y + rect.h)
  }
  return { width, height }
}

/** Bottom-right corner of the union of every scene box (0,0 for an empty world). */
export function worldExtent(scenes: readonly SceneBox[]): { width: number; height: number } {
  return rectExtent(sceneRects(scenes))
}

/** Scrollable surface size: the world extent plus `padding` on every side. */
export function surfaceSize(scenes: readonly SceneBox[], padding: number): { width: number; height: number } {
  const extent = worldExtent(scenes)
  return { width: extent.width + padding * 2, height: extent.height + padding * 2 }
}

/** Snap a dragged card's release position to the atlas grid, never off-surface. */
export function snapToGrid(value: number, grid: number): number {
  return Math.max(0, Math.round(value / grid) * grid)
}

/**
 * Scroll offset that centres a world of `extent` px in a viewport `pageSize`
 * px wide, clamped to the adjustment's own `[0, upper - pageSize]` range.
 */
export function centeredScrollValue(extent: number, upper: number, pageSize: number): number {
  return Math.max(0, Math.min(upper - pageSize, extent / 2 - pageSize / 2))
}

/** Keep the atlas's global preview zoom inside a sane native-pixel range. */
export function clampPreviewZoom(zoom: number): number {
  return Math.min(6, Math.max(0.5, zoom))
}

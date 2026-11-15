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
 * Works in whichever space the rects are in — the atlas world via
 * {@link sceneRects}, the drawn world via the camera's own rects.
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

/** Snap a dragged card's release position to the atlas grid, never off-surface. */
export function snapToGrid(value: number, grid: number): number {
  return Math.max(0, Math.round(value / grid) * grid)
}

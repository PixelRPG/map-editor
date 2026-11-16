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

/** A layout correction applied to a card rect, in surface px. */
export interface RectShift {
  dx: number
  dy: number
}

/**
 * Passes {@link separateCardRects} takes. Each pass resolves every pair
 * once, and a card pushed clear of one neighbour can land on the next —
 * six is far past what a world of a dozen maps needs, and the loop stops
 * as soon as a pass moves nothing.
 */
const SEPARATION_PASSES = 6

function shiftedRect(rect: SceneRect, shift: RectShift): SceneRect {
  return { x: rect.x + shift.dx, y: rect.y + shift.dy, w: rect.w, h: rect.h }
}

/**
 * Shifts that pull overlapping cards apart, leaving `gap` px between
 * them — one shift per input rect, in input order, `{0, 0}` for a card
 * that stays put.
 *
 * Only cards flagged `movable` are moved. That flag means "the minimum
 * card size enlarged this card beyond its true scale": such a card is
 * drawn bigger than the world says, so the overlap is the camera's doing
 * and the camera may undo it. A card drawn at its true scale stays
 * exactly where the user dropped it — the atlas is a world the user
 * arranges, and silently re-arranging it would be worse than the overlap
 * (REDESIGN.md § 6.1).
 *
 * Pass the FULL card rects, not the body rects: a card's title sits
 * above its body, so two bodies can clear each other while the title of
 * the lower card is drawn across the body of the upper one — which is
 * exactly how the two Link's Tree House cards collided at Fit on phone
 * widths.
 *
 * Deterministic by construction: pairs are visited in index order, the
 * later-indexed card yields when both may move, and each push is along
 * the axis of least penetration.
 */
export function separateCardRects(
  rects: readonly SceneRect[],
  movable: readonly boolean[],
  gap = 0,
  passes = SEPARATION_PASSES,
): RectShift[] {
  const shifts: RectShift[] = rects.map(() => ({ dx: 0, dy: 0 }))
  for (let pass = 0; pass < passes; pass += 1) {
    let moved = false
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        // Whoever may move; the later card when both may. Neither
        // movable means the overlap is the user's own arrangement.
        const target = movable[j] ? j : movable[i] ? i : -1
        if (target === -1) continue
        const a = shiftedRect(rects[i], shifts[i])
        const b = shiftedRect(rects[j], shifts[j])
        if (!(a.w > 0) || !(a.h > 0) || !(b.w > 0) || !(b.h > 0)) continue
        const penX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + gap
        const penY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + gap
        if (!(penX > 0) || !(penY > 0)) continue
        const self = target === j ? b : a
        const other = target === j ? a : b
        if (penX <= penY) {
          const sign = self.x + self.w / 2 >= other.x + other.w / 2 ? 1 : -1
          shifts[target].dx += sign * penX
        } else {
          const sign = self.y + self.h / 2 >= other.y + other.h / 2 ? 1 : -1
          shifts[target].dy += sign * penY
        }
        moved = true
      }
    }
    if (!moved) break
  }
  return shifts
}

/**
 * The selection that survives a world change: the same scene while the
 * new world still holds it, otherwise nothing. A project closed, a map
 * deleted or a different project opened must not leave a selection
 * behind — the card carrying it is gone, but the connection overlay
 * would keep its lines lit and the selection bar would go on naming a
 * map the user cannot see or reach (REDESIGN.md § 4.2).
 */
export function survivingSelection(selected: string | null, sceneIds: readonly string[]): string | null {
  if (!selected) return null
  return sceneIds.includes(selected) ? selected : null
}

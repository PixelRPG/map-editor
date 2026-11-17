import { Actor, Color, Rectangle, type Scene, type TileMap, Vector } from 'excalibur'
import { type Point2, tileToWorldCenter } from './tile-geometry.ts'

/**
 * The brief fading outline that says "someone else edited here" — the AI
 * collaborator on its own machine (`AssistantPresenceController.flashTile`)
 * and an attributed remote op on the receiving side
 * (`peer-edit-flash.ts`). One implementation so both read the same.
 */

/** Below the remote cursors (z 10_000), above the tilemap. */
const FLASH_Z = 9_000
const PEAK_OPACITY = 0.95
const FADE_MS = 700

/**
 * Above this many cells, the per-cell outlines collapse into a single
 * bounding box. A bucket fill is ONE command over an arbitrary region —
 * an actor per cell would mean thousands of actors, each with its own
 * per-frame update, for a decoration that lasts 700 ms. The box says the
 * same thing ("they changed this area") at constant cost.
 */
export const MAX_FLASH_CELLS = 24

/** A tile-grid cell to outline. */
export interface FlashCell {
  tileX: number
  tileY: number
}

/** World-space rectangle, positioned by its CENTRE (Excalibur's actor anchor). */
export interface FlashRect {
  centre: Point2
  width: number
  height: number
}

/** The tilemap geometry {@link flashRects} reads — structural, so it tests without Excalibur. */
export interface FlashGrid {
  pos: Point2
  tileWidth: number
  tileHeight: number
}

/**
 * The outlines to draw for `cells`: one per cell, or — past
 * {@link MAX_FLASH_CELLS} — a single box around all of them. Pure
 * geometry, kept apart from the actor construction so the collapse rule
 * is testable under the node target.
 */
export function flashRects(grid: FlashGrid, cells: readonly FlashCell[]): FlashRect[] {
  if (cells.length === 0) return []
  if (cells.length <= MAX_FLASH_CELLS) return cells.map((cell) => cellRect(grid, cell))
  return [boundingRect(grid, cells)]
}

/**
 * Outline `cells` on `tileMap` in `colour` and fade them out over 700 ms.
 * Self-disposing via `onPostUpdate`, so no external timer and nothing to
 * clean up — the actors kill themselves, and any that outlive their scene
 * go with it. No-op for an empty cell list.
 */
export function flashTiles(scene: Scene, tileMap: TileMap, cells: readonly FlashCell[], colour: Color): void {
  for (const rect of flashRects(tileMap, cells)) scene.add(flashActor(rect, colour))
}

function cellRect(grid: FlashGrid, cell: FlashCell): FlashRect {
  return {
    centre: tileToWorldCenter(grid.pos, grid.tileWidth, grid.tileHeight, cell.tileX, cell.tileY),
    width: grid.tileWidth,
    height: grid.tileHeight,
  }
}

function boundingRect(grid: FlashGrid, cells: readonly FlashCell[]): FlashRect {
  let minX = cells[0].tileX
  let maxX = cells[0].tileX
  let minY = cells[0].tileY
  let maxY = cells[0].tileY
  for (const cell of cells) {
    if (cell.tileX < minX) minX = cell.tileX
    if (cell.tileX > maxX) maxX = cell.tileX
    if (cell.tileY < minY) minY = cell.tileY
    if (cell.tileY > maxY) maxY = cell.tileY
  }
  const first = tileToWorldCenter(grid.pos, grid.tileWidth, grid.tileHeight, minX, minY)
  const last = tileToWorldCenter(grid.pos, grid.tileWidth, grid.tileHeight, maxX, maxY)
  return {
    centre: { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 },
    width: (maxX - minX + 1) * grid.tileWidth,
    height: (maxY - minY + 1) * grid.tileHeight,
  }
}

function flashActor(rect: FlashRect, colour: Color): Actor {
  const actor = new Actor({ pos: new Vector(rect.centre.x, rect.centre.y), z: FLASH_Z })
  // Outline (not a fill) so the edited tile content stays visible.
  actor.graphics.use(
    new Rectangle({
      width: rect.width,
      height: rect.height,
      color: Color.Transparent,
      strokeColor: colour,
      lineWidth: 2,
    }),
  )
  let elapsed = 0
  actor.graphics.opacity = PEAK_OPACITY
  actor.onPostUpdate = (_engine, elapsedMs: number) => {
    elapsed += elapsedMs
    if (elapsed >= FADE_MS) {
      actor.kill()
      return
    }
    actor.graphics.opacity = PEAK_OPACITY * (1 - elapsed / FADE_MS)
  }
  return actor
}

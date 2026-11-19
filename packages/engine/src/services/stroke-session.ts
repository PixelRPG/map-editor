import type { Scene } from 'excalibur'
import {
  type CellSprites,
  PaintCellsCommand,
  type PaintCellsPayload,
  sameCellSprites,
} from '../commands/paint-tile.command.ts'
import type { Command } from '../commands/types.ts'
import type { MapEditorComponent } from '../components/map-editor.component.ts'
import { snapshotPreviousSprites } from './tile-paint.service.ts'

/**
 * One in-progress brush stroke: the cells it has already painted, what
 * every touched cell looked like BEFORE the finger went down, and the
 * single command it becomes on release (TERRAIN.md §6.3).
 *
 * **The preview is the real thing.** Each newly crossed cell is planned
 * and its command is `apply`-ed straight to the scene — no overlay
 * actor, no second rendering path. Two reasons, and the second is the
 * load-bearing one:
 *
 * 1. A terrain brush resolves each cell against its neighbours, so what
 *    a ghost would have to draw is exactly what the planner produces.
 *    Drawing it twice means two implementations of the same 47-piece
 *    resolution, and the overlay would be the one nobody tests.
 * 2. The planner reads the SHADOW state. Cell three of a stroke has to
 *    see cells one and two already in place or the path it resolves
 *    will not join up. A preview that lived beside the shadow would
 *    plan every cell against a map the user is no longer looking at.
 *
 * What the stroke withholds is not the pixels, it is the COMMAND: the
 * undo stack and the collab op-log see nothing until the finger lifts,
 * and then they see one `tile.cells` for the whole stroke instead of
 * one per cell (REDESIGN §8).
 *
 * The window in which the shadow holds uncommitted paint lasts exactly
 * one gesture and ends in {@link toCommand} or {@link revert} — both of
 * which the owning system calls from `POINTER_DRAG_END`, including the
 * `pointer-cancel` the second finger produces.
 */
export class StrokeSession {
  /**
   * Pre-stroke sprite list per touched cell, keyed by coordinate.
   * Written ONCE per cell — the first time the stroke touches it — so
   * a cell the brush crosses twice still reverts to what was there
   * before the finger went down, not to what the first pass left.
   */
  private readonly before = new Map<string, { tileX: number; tileY: number; previousSprites: CellSprites }>()

  /** Origin cells already painted, so a wobbling finger paints each cell once. */
  private readonly painted = new Set<string>()

  private lastCoords: { x: number; y: number } | null = null

  constructor(
    private readonly scene: Scene,
    private readonly editor: MapEditorComponent,
    public readonly layerId: string,
    private readonly label: PaintCellsPayload['label'],
  ) {}

  /** The last cell the brush was applied at, for the closing `TILE_PLACED`. */
  public get lastOrigin(): { x: number; y: number } | null {
    return this.lastCoords
  }

  /** Whether the stroke has changed anything yet. */
  public get isEmpty(): boolean {
    return this.before.size === 0
  }

  /**
   * Claim `(tileX, tileY)` as a brush origin, or report that this
   * stroke has already painted there.
   *
   * Only ORIGINS are deduplicated, not the cells a footprint covers:
   * a 2×2 terrain brush at two adjacent origins legitimately rewrites
   * the cells they share, and the ring re-resolution rewrites
   * neighbours over and over as the stroke grows past them.
   */
  public claim(tileX: number, tileY: number): boolean {
    const key = cellKey(tileX, tileY)
    if (this.painted.has(key)) return false
    this.painted.add(key)
    this.lastCoords = { x: tileX, y: tileY }
    return true
  }

  /**
   * Draw one brush application into the scene and remember what it
   * covered.
   *
   * A command with no {@link Command.footprint} is refused rather than
   * applied: the footprint is how the stroke learns which cells to
   * snapshot, and paint this session could not snapshot is paint it
   * could not take back when the second finger lands.
   */
  public apply(command: Command): boolean {
    const footprint = command.footprint?.() ?? null
    if (!footprint) return false
    for (const tile of footprint.tiles) {
      const key = cellKey(tile.tileX, tile.tileY)
      if (this.before.has(key)) continue
      this.before.set(key, {
        tileX: tile.tileX,
        tileY: tile.tileY,
        previousSprites: snapshotPreviousSprites(this.editor, this.layerId, tile.tileX, tile.tileY),
      })
    }
    command.apply(this.scene)
    return true
  }

  /**
   * The whole stroke as ONE command, or `null` when it changed nothing
   * in the end (a brush dragged across cells it had already painted,
   * or a terrain that resolved back to what was there).
   *
   * `sprites` is read from the shadow as it stands NOW, which is where
   * every applied brush left it — so the command describes the result
   * the user has been looking at, cell for cell. Applying it again on
   * dispatch writes the same data a second time, which is a no-op by
   * construction and keeps the commit path identical to the one a tap
   * takes.
   */
  public toCommand(): PaintCellsCommand | null {
    const cells: PaintCellsPayload['cells'] = []
    for (const cell of this.before.values()) {
      const sprites = snapshotPreviousSprites(this.editor, this.layerId, cell.tileX, cell.tileY)
      if (sameCellSprites(sprites, cell.previousSprites)) continue
      cells.push({ tileX: cell.tileX, tileY: cell.tileY, sprites, previousSprites: cell.previousSprites })
    }
    if (cells.length === 0) return null
    return new PaintCellsCommand({ layerId: this.layerId, label: this.label, cells })
  }

  /**
   * Put every touched cell back the way it was and leave the stroke
   * spent. The second finger's path (§6.3), and the one that must not
   * leave a trace: nothing was ever dispatched, so there is no undo
   * entry to clean up and no peer that saw anything.
   */
  public revert(): void {
    const cells: PaintCellsPayload['cells'] = []
    for (const cell of this.before.values()) {
      cells.push({
        tileX: cell.tileX,
        tileY: cell.tileY,
        sprites: cell.previousSprites,
        previousSprites: cell.previousSprites,
      })
    }
    this.before.clear()
    this.painted.clear()
    if (cells.length === 0) return
    // Reverting through the same command the stroke would have become
    // is what keeps the un-paint on the one write path that also
    // rebuilds the graphics and refreshes collision.
    new PaintCellsCommand({ layerId: this.layerId, cells }).apply(this.scene)
  }
}

function cellKey(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`
}

/**
 * The armed tile brush as a rectangular BLOCK of tiles — what a drag
 * across the palette sheet picks (REDESIGN §5.3: "a drag picks a
 * rectangle that becomes a stamp brush").
 *
 * A single tile is the 1×1 case, deliberately: the editor has ONE
 * armed-brush shape instead of a tile id and a stamp living side by
 * side, so no mutating path has to choose which of the two to read
 * (the repo's anti-parallel-state rule). `ActiveTileComponent` stores
 * exactly this, and `EditorSession.activeTile` is a lens on its
 * anchor.
 *
 * Pure arithmetic over plain data — no Excalibur, no scene — so the
 * cells a stamp would write are unit-testable without a map.
 */

/** A rectangular block of tiles, armed as one brush. */
export interface TileStamp {
  /** Tiles across; always `>= 1`. */
  readonly columns: number
  /** Tiles down; always `>= 1`. */
  readonly rows: number
  /**
   * Global tile ids (sprite-set local index + `firstGid`), row-major,
   * exactly `columns * rows` long.
   *
   * An id `<= 0` is a cell the stamp SKIPS rather than one it erases:
   * a stamp lays tiles down, and leaving a hole is the only sensible
   * reading of "no tile here" for a brush that covers many cells at
   * once. A sheet drag never produces one (every cell of a tileset
   * rectangle is a real tile), but the picker is not the only possible
   * source of a stamp.
   */
  readonly spriteIds: readonly number[]
}

/** One tile a stamp writes, in map coordinates. */
export interface TileStampCell {
  readonly tileX: number
  readonly tileY: number
  /** Global tile id; always `> 0` (skipped cells are never emitted). */
  readonly spriteId: number
}

/** The map extent a stamp is clipped to — `MapData.columns` / `.rows`. */
export interface TileStampBounds {
  readonly columns: number
  readonly rows: number
}

/** The 1×1 stamp for one tile — the shape every single-tile pick takes. */
export function singleTileStamp(spriteId: number): TileStamp {
  return { columns: 1, rows: 1, spriteIds: [spriteId] }
}

/**
 * A stamp from a row-major run of ids, or `null` when the run cannot
 * be a rectangle: no columns, no ids, or a length that is not a whole
 * number of rows. Rejecting rather than padding keeps a caller's
 * off-by-one from silently arming a brush with a torn last row.
 */
export function makeTileStamp(spriteIds: readonly number[], columns: number): TileStamp | null {
  if (!Number.isInteger(columns) || columns < 1) return null
  if (spriteIds.length === 0 || spriteIds.length % columns !== 0) return null
  return { columns, rows: spriteIds.length / columns, spriteIds: [...spriteIds] }
}

/**
 * The stamp's top-left tile id, or `null` when it has none.
 *
 * This is what every surface that can only show ONE tile reads — the
 * context chip's swatch, the recent-tiles strip, the bucket fill. The
 * anchor rather than "the first non-empty cell" so the answer is
 * stable while a stamp is being re-picked.
 */
export function stampAnchorId(stamp: TileStamp): number | null {
  const id = stamp.spriteIds[0]
  return id === undefined || id <= 0 ? null : id
}

/** Whether the stamp covers exactly one cell (the pencil's classic case). */
export function isSingleTileStamp(stamp: TileStamp): boolean {
  return stamp.columns === 1 && stamp.rows === 1
}

/**
 * The cells laying `stamp` with its top-left at `origin` would write:
 * row-major, skipping ids `<= 0`, and — when `bounds` is given —
 * dropping every cell that falls off the map.
 *
 * Top-left anchoring (rather than centring) is what makes a stamp
 * predictable next to the pencil: the hovered tile is the one the
 * stamp's first tile lands on, for a 1×1 brush and a 4×3 brush alike.
 *
 * Clipping rather than refusing: a stamp placed at the map's edge
 * writes the part that fits. Refusing would make the last row of a map
 * unpaintable with anything but a 1×1 brush.
 */
export function stampCellsAt(
  stamp: TileStamp,
  origin: { readonly x: number; readonly y: number },
  bounds?: TileStampBounds,
): TileStampCell[] {
  const cells: TileStampCell[] = []
  for (let row = 0; row < stamp.rows; row++) {
    for (let column = 0; column < stamp.columns; column++) {
      const spriteId = stamp.spriteIds[row * stamp.columns + column]
      if (spriteId === undefined || spriteId <= 0) continue
      const tileX = origin.x + column
      const tileY = origin.y + row
      if (bounds && (tileX < 0 || tileY < 0 || tileX >= bounds.columns || tileY >= bounds.rows)) continue
      cells.push({ tileX, tileY, spriteId })
    }
  }
  return cells
}

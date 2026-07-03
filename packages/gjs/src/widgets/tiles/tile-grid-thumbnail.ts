import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'

import type { GdkSpriteSetResource } from '../../sprite/index.ts'

/** Grid dimensions + cell size of the representative tileset excerpt. */
const MAX_COLS = 6
const MAX_ROWS = 4
const CELL_PX = 24
const GRID_ALPHA = 0.18

/**
 * A readable tileset thumbnail: a representative excerpt of the first
 * few tiles laid out on a grid (soll-sheets), instead of the whole
 * sheet downscaled to an unreadable strip. Each cell renders a real
 * sprite's paintable at a uniform size with thin grid lines between —
 * so a wide tileset still shows recognisable tiles at a legible scale.
 *
 * Drawn entirely in `vfunc_snapshot` (paintable snapshots + grid rects);
 * no offscreen texture. Fed via {@link setSpriteSet}.
 */
export class TileGridThumbnail extends Gtk.Widget {
  private _paintables: Gdk.Paintable[] = []
  private _cols = MAX_COLS
  private _rows = MAX_ROWS

  static {
    GObject.registerClass({ GTypeName: 'PixelRpgTileGridThumbnail' }, TileGridThumbnail)
  }

  constructor() {
    super()
    this.set_overflow(Gtk.Overflow.HIDDEN)
  }

  /**
   * Populate from a sprite-set's first tiles. `columns` bounds the grid
   * width so a narrow sheet doesn't render empty trailing cells.
   */
  setSpriteSet(resource: GdkSpriteSetResource | null, columns: number): void {
    this._paintables = []
    if (resource) {
      this._cols = Math.max(1, Math.min(MAX_COLS, columns || MAX_COLS))
      const max = this._cols * MAX_ROWS
      for (let i = 0; i < max; i++) {
        const sprite = resource.getSprite(i)
        if (!sprite) break
        this._paintables.push(sprite.createPaintable())
      }
      this._rows = Math.max(1, Math.min(MAX_ROWS, Math.ceil(this._paintables.length / this._cols)))
    }
    this.queue_resize()
    this.queue_draw()
  }

  vfunc_measure(orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    const size = orientation === Gtk.Orientation.HORIZONTAL ? this._cols * CELL_PX : this._rows * CELL_PX
    return [size, size, -1, -1]
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const cols = this._cols
    for (let i = 0; i < this._paintables.length; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      snapshot.save()
      snapshot.translate(new Graphene.Point({ x: col * CELL_PX, y: row * CELL_PX }))
      this._paintables[i].snapshot(snapshot, CELL_PX, CELL_PX)
      snapshot.restore()
    }
    this._drawGrid(snapshot)
  }

  private _drawGrid(snapshot: Gtk.Snapshot): void {
    const grid = new Gdk.RGBA()
    grid.parse(`rgba(255,255,255,${GRID_ALPHA})`)
    const w = this._cols * CELL_PX
    const h = this._rows * CELL_PX
    const line = (x: number, y: number, lw: number, lh: number) => {
      const rect = new Graphene.Rect()
      rect.init(x, y, lw, lh)
      snapshot.append_color(grid, rect)
    }
    for (let c = 1; c < this._cols; c++) line(c * CELL_PX, 0, 1, h)
    for (let r = 1; r < this._rows; r++) line(0, r * CELL_PX, w, 1)
  }
}

GObject.type_ensure(TileGridThumbnail.$gtype)

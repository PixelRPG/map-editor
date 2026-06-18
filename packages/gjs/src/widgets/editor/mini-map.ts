import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'
import { TILE_COLOR_MAP, TILE_DEFAULT_COLOR } from '../../__demo__/world-sample'

const colorCache = new Map<string, Gdk.RGBA>()

function parseColor(hex: string): Gdk.RGBA {
  const cached = colorCache.get(hex)
  if (cached) return cached
  const rgba = new Gdk.RGBA()
  if (!rgba.parse(hex)) rgba.parse(TILE_DEFAULT_COLOR)
  colorCache.set(hex, rgba)
  return rgba
}

/**
 * Pixel-grid mini-map renderer.
 *
 * Takes an array of equal-length char rows (`'GGGTFGG…'`) and paints one
 * filled square per character through `vfunc_snapshot`. The cell colour
 * is looked up from {@link TILE_COLOR_MAP}; unknown characters use
 * {@link TILE_DEFAULT_COLOR}.
 *
 * Used by:
 * - `scene-card` — small atlas-card preview (`tilePx ≈ 7`)
 * - `scene-inspector` — the inspector preview (`tilePx ≈ 14`)
 *
 * Cheap enough to live as a Gtk.Widget; no canvas / pixbuf involved.
 */
export class MiniMap extends Gtk.Widget {
  private _rows: string[] = []
  private _tilePx: number = 8

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgMiniMap',
        Properties: {
          'tile-px': GObject.ParamSpec.int(
            'tile-px',
            'Tile size',
            'Side length of one tile in CSS pixels',
            GObject.ParamFlags.READWRITE,
            1,
            64,
            8,
          ),
        },
      },
      MiniMap,
    )
  }

  constructor(params: Partial<{ rows: string[]; tilePx: number }> = {}) {
    super()
    if (params.tilePx !== undefined) this._tilePx = params.tilePx
    if (params.rows !== undefined) this._rows = [...params.rows]
    this._updateSize()
  }

  setRows(rows: string[]): void {
    this._rows = [...rows]
    this._updateSize()
    this.queue_draw()
  }

  get tilePx(): number {
    return this._tilePx ?? 8
  }

  set tilePx(value: number) {
    if (this._tilePx === value) return
    this._tilePx = value
    this.notify('tile-px')
    this._updateSize()
    this.queue_draw()
  }

  /** Render a flat placeholder of these dimensions when no row data is set. */
  setPlaceholder(cols: number, rows: number, tilePx: number, color = TILE_DEFAULT_COLOR): void {
    this._rows = []
    this._placeholderCols = Math.max(0, Math.floor(cols))
    this._placeholderRows = Math.max(0, Math.floor(rows))
    this._placeholderColor = color
    this._tilePx = tilePx
    this._updateSize()
    this.queue_draw()
  }

  private _placeholderCols = 0
  private _placeholderRows = 0
  private _placeholderColor = TILE_DEFAULT_COLOR

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const tile = this._tilePx
    const rect = new Graphene.Rect()

    if (this._rows.length === 0 && this._placeholderCols > 0 && this._placeholderRows > 0) {
      rect.init(0, 0, this._placeholderCols * tile, this._placeholderRows * tile)
      snapshot.append_color(parseColor(this._placeholderColor), rect)
      return
    }

    for (let y = 0; y < this._rows.length; y++) {
      const row = this._rows[y]
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]
        const color = parseColor(TILE_COLOR_MAP[ch] ?? TILE_DEFAULT_COLOR)
        rect.init(x * tile, y * tile, tile, tile)
        snapshot.append_color(color, rect)
      }
    }
  }

  vfunc_measure(orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    // Report the natural size for the requested orientation. Returning the
    // width for both axes mis-sized a non-square mini-map vertically.
    const size = orientation === Gtk.Orientation.HORIZONTAL ? this.cols * this._tilePx : this.rows * this._tilePx
    return [size, size, -1, -1]
  }

  private _updateSize(): void {
    this.width_request = this.cols * this._tilePx
    this.height_request = this.rows * this._tilePx
  }

  get cols(): number {
    return this._rows[0]?.length ?? this._placeholderCols
  }

  get rows(): number {
    return this._rows.length || this._placeholderRows
  }
}

GObject.type_ensure(MiniMap.$gtype)

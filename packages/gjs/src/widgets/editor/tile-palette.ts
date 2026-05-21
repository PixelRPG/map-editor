import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import type { GdkSpriteSheet } from '../../sprite'

import Template from './tile-palette.blp'

/**
 * Descriptor for a single tile shown in {@link TilePalette}.
 *
 * `color` is rendered as the fallback swatch background; `paintable`,
 * when present, takes precedence and is painted via `Gtk.Picture`.
 */
export interface TileDescriptor {
  id: number
  name?: string
  color?: string
  paintable?: Gdk.Paintable
}

/**
 * 5-column FlowBox of tile swatches. Emits `tile-selected::<id>` when a
 * swatch is activated. Used by `tiles-tab` and the active-tile popover
 * inside `context-chip`.
 *
 * The swatch size is configurable; default 42px matches the design
 * handoff §"Tiles tab" spec.
 */
export class TilePalette extends Adw.Bin {
  declare _flow: Gtk.FlowBox

  private _tiles: TileDescriptor[] = []
  private _tileSize: number = 42
  private _selectedId: number | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTilePalette',
        Template,
        InternalChildren: ['flow'],
        Properties: {
          'tile-size': GObject.ParamSpec.int(
            'tile-size',
            'Tile Size',
            'Swatch side length in pixels',
            GObject.ParamFlags.READWRITE,
            12,
            128,
            42,
          ),
          'columns': GObject.ParamSpec.int(
            'columns',
            'Columns',
            'Number of swatches per row',
            GObject.ParamFlags.READWRITE,
            1,
            32,
            5,
          ),
        },
        Signals: {
          'tile-selected': { param_types: [GObject.TYPE_INT] },
        },
      },
      TilePalette,
    )
  }

  constructor(params: Partial<{ tiles: TileDescriptor[]; tileSize: number; columns: number }> = {}) {
    super()
    if (params.tileSize !== undefined) this.tileSize = params.tileSize
    if (params.columns !== undefined) this.columns = params.columns
    if (params.tiles) this.setTiles(params.tiles)
    this._flow.connect('child-activated', (_box, child) => {
      const idx = child.get_index()
      const tile = this._tiles[idx]
      if (!tile) return
      this._selectedId = tile.id
      this.emit('tile-selected', tile.id)
    })
  }

  get tileSize(): number {
    return this._tileSize ?? 42
  }

  set tileSize(value: number) {
    if (this._tileSize === value) return
    this._tileSize = value
    this.notify('tile-size')
    this._reflowSwatchSize()
  }

  get columns(): number {
    return this._flow.get_max_children_per_line()
  }

  set columns(value: number) {
    this._flow.set_min_children_per_line(value)
    this._flow.set_max_children_per_line(value)
    this.notify('columns')
  }

  get selectedId(): number | null {
    return this._selectedId
  }

  /**
   * Load tiles from a `GdkSpriteSheet`, automatically reflowing the
   * palette to match the sheet's native column count (so 32-column
   * tilesets render in their canonical 32×N grid by default).
   *
   * The host can still override `columns` afterwards if the layout
   * needs to be denser (e.g., inside a narrow popover).
   */
  setFromSpriteSheet(sheet: GdkSpriteSheet, names?: Record<number, string>): void {
    this.columns = sheet.columns
    this.setTiles(
      sheet.sprites.map((sprite, idx) => ({
        id: idx,
        name: names?.[idx],
        paintable: sprite.createPaintable(),
      })),
    )
  }

  setTiles(tiles: TileDescriptor[]): void {
    this._tiles = [...tiles]
    let child = this._flow.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._flow.remove(child)
      child = next
    }
    for (const tile of this._tiles) {
      this._flow.append(this._buildSwatch(tile))
    }
  }

  selectTile(id: number): void {
    const idx = this._tiles.findIndex((t) => t.id === id)
    if (idx < 0) return
    const child = this._flow.get_child_at_index(idx)
    if (child) this._flow.select_child(child)
    this._selectedId = id
  }

  private _reflowSwatchSize(): void {
    let child = this._flow.get_first_child() as Gtk.FlowBoxChild | null
    while (child) {
      const swatch = child.get_child()
      if (swatch) {
        swatch.set_size_request(this._tileSize, this._tileSize)
      }
      child = child.get_next_sibling() as Gtk.FlowBoxChild | null
    }
  }

  private _buildSwatch(tile: TileDescriptor): Gtk.FlowBoxChild {
    const child = new Gtk.FlowBoxChild()

    let swatch: Gtk.Widget
    if (tile.paintable) {
      const picture = new Gtk.Picture()
      picture.set_paintable(tile.paintable)
      picture.set_content_fit(Gtk.ContentFit.FILL)
      swatch = picture
    } else {
      swatch = new TileSwatch(tile.color ?? '#9aa0a6')
    }
    swatch.set_size_request(this._tileSize, this._tileSize)
    if (tile.name) child.set_tooltip_text(tile.name)
    child.set_child(swatch)
    return child
  }
}

/**
 * Internal: a Gtk.Widget that paints a solid-colored rounded rectangle.
 * Used as the fallback swatch when no `Gdk.Paintable` is provided.
 */
class TileSwatch extends Gtk.Widget {
  private _color: Gdk.RGBA

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTileSwatch',
      },
      TileSwatch,
    )
  }

  constructor(color: string) {
    super()
    this._color = new Gdk.RGBA()
    if (!this._color.parse(color)) this._color.parse('#9aa0a6')
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const w = this.get_width()
    const h = this.get_height()
    const rect = new Graphene.Rect()
    rect.init(0, 0, w, h)
    const rounded = new Gsk.RoundedRect()
    rounded.init_from_rect(rect, 6)
    snapshot.push_rounded_clip(rounded)
    snapshot.append_color(this._color, rect)
    snapshot.pop()
  }
}

GObject.type_ensure(TileSwatch.$gtype)
GObject.type_ensure(TilePalette.$gtype)

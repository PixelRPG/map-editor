import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import type { GdkSpriteSheet } from '../../sprite'

import Template from './tile-palette.blp'

/**
 * Max swatches per line in `wrap` mode — high enough that the available
 * width (not this cap) decides how many fixed-size tiles fit per row, so
 * tiles never stretch to fill a wide window.
 */
const WRAP_MAX_CHILDREN = 64

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
 * Build the swatch widget for one palette cell: a `Gtk.Picture` for a
 * paintable, else a solid-colour {@link TileSwatch}. The single shared
 * renderer for tile-like previews — {@link TilePalette} cells and the
 * Objects tab's placement rows both go through here, so a sprite looks
 * identical wherever it appears.
 */
export function createSwatchWidget(
  desc: { color?: string; paintable?: Gdk.Paintable | null },
  width: number,
  height: number,
  contentFit: 'fill' | 'contain' = 'fill',
): Gtk.Widget {
  let swatch: Gtk.Widget
  if (desc.paintable) {
    const picture = new Gtk.Picture()
    picture.set_paintable(desc.paintable)
    picture.set_content_fit(contentFit === 'contain' ? Gtk.ContentFit.CONTAIN : Gtk.ContentFit.FILL)
    swatch = picture
  } else {
    swatch = new TileSwatch(desc.color ?? '#9aa0a6')
  }
  swatch.set_size_request(width, height)
  return swatch
}

/**
 * 5-column FlowBox of tile swatches. Emits `tile-selected::<id>` when a
 * swatch is activated. Used by `tiles-tab` and the active-tile popover
 * surfaced inside `floating-top-bar`.
 *
 * The swatch size is configurable; default 42px matches the design
 * handoff §"Tiles tab" spec.
 */
/** Two rendering modes for sprite swatches. */
export type TilePaletteAspectMode = 'fill' | 'contain'

export class TilePalette extends Adw.Bin {
  declare _flow: Gtk.FlowBox

  private _tiles: TileDescriptor[] = []
  private _tileSize: number = 42
  private _selectedId: number | null = null
  private _aspectMode: TilePaletteAspectMode = 'fill'
  private _wrap = false
  /**
   * Aspect ratio (width / height) of the active sprite-sheet's
   * sprites — populated by `setFromSpriteSheet` from the first
   * sprite (character sprite-sheets are uniform so this is
   * reliable). `null` when the palette holds raw `TileDescriptor`s
   * with no shared aspect or when `aspectMode === 'fill'`.
   */
  private _cellAspect: number | null = null

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
            'Swatch side length in pixels (for aspect-mode = fill) OR shorter-edge length (for aspect-mode = contain)',
            GObject.ParamFlags.READWRITE,
            12,
            128,
            42,
          ),
          columns: GObject.ParamSpec.int(
            'columns',
            'Columns',
            'Number of swatches per row',
            GObject.ParamFlags.READWRITE,
            1,
            32,
            5,
          ),
          // Rendering policy for swatches:
          //  - `fill` (default, preserves the tile-tab use case where
          //    map tiles are uniformly square and the FlowBox cells
          //    are sized identically): the Picture stretches the
          //    paintable to fill the swatch + the underlying paintable
          //    uses independent X/Y scales.
          //  - `contain`: aspect-preserving Picture + paintable. Cells
          //    are sized to the sprite's own aspect (so non-square
          //    character sprites land in non-square cells) so the
          //    sprite fills the cell without distortion.
          'aspect-mode': GObject.ParamSpec.string(
            'aspect-mode',
            'Aspect Mode',
            'Swatch rendering policy: `fill` stretches, `contain` preserves the sprite-sheet aspect',
            GObject.ParamFlags.READWRITE,
            'fill',
          ),
          // Whether the FlowBox is allowed to wrap to available width.
          //
          //  - `false` (default — scene-editor tile-tab + popover
          //    use cases that want a fixed column count): `columns`
          //    pins both `min-children-per-line` and
          //    `max-children-per-line` so the grid stays rectangular
          //    and the host scrolls horizontally if the sheet is wide.
          //  - `true` (tiles-view + custom-animation picker — the user
          //    wants to see as many frames at once as possible without
          //    scrolling sideways): `min-children-per-line` stays at
          //    1, `max-children-per-line` becomes the cap. The FlowBox
          //    then flows freely against whatever width the host
          //    allocates.
          wrap: GObject.ParamSpec.boolean(
            'wrap',
            'Wrap',
            'Whether the FlowBox is allowed to wrap to the available width (vs. pinned to a fixed column count)',
            GObject.ParamFlags.READWRITE,
            false,
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

  get aspectMode(): TilePaletteAspectMode {
    return this._aspectMode ?? 'fill'
  }

  set aspectMode(value: TilePaletteAspectMode) {
    if (this._aspectMode === value) return
    this._aspectMode = value
    this.notify('aspect-mode')
    // Aspect mode toggles BOTH the Picture's content-fit AND the
    // underlying paintable's snapshot mode. Existing swatches need a
    // full rebuild — `_reflowSwatchSize` only re-applies sizing.
    this.setTiles(this._tiles)
  }

  get columns(): number {
    return this._flow.get_max_children_per_line()
  }

  set columns(value: number) {
    // `wrap` decides the line policy:
    //  - off → both min + max = value (rectangular grid that stretches
    //    to fill, scrolls horizontally if the sheet is wider).
    //  - on  → min 1, max = a high cap (NOT `value`), so the available
    //    width — not the sheet's column count — decides how many
    //    fixed-size tiles fit per row. Pinning max to the column count
    //    made a wide window stretch each cell to `width / columns`.
    this._flow.set_min_children_per_line(this._wrap ? 1 : value)
    this._flow.set_max_children_per_line(this._wrap ? WRAP_MAX_CHILDREN : value)
    this.notify('columns')
  }

  get wrap(): boolean {
    return this._wrap ?? false
  }

  set wrap(value: boolean) {
    if (this._wrap === value) return
    this._wrap = value
    this.notify('wrap')
    // Homogeneous makes the FlowBox stretch every cell to fill its line
    // — fine for a fixed-column grid (wrap off), but in wrap mode it
    // stretches fixed-size tiles across a wide window. Turn it off so
    // wrapped tiles keep their `tile-size` and just pack left.
    this._flow.set_homogeneous(!value)
    // Reapply the current column setting under the new policy so
    // `set columns` picks the right min/max-children-per-line.
    this.columns = this.columns
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
    // Only pin the column count in fixed-grid (wrap off) mode. In wrap
    // mode the width decides the columns (high cap), so the sheet's
    // native column count must NOT cap the line — that's what stretched
    // a wide window's tiles.
    if (!this._wrap) this.columns = sheet.columns
    // Capture the per-cell aspect from the first sprite so swatch
    // sizing can match (aspect-mode `contain` only — `fill` ignores
    // this and stays square). Character sprite-sheets are uniform so
    // sprite[0] is representative for the whole set.
    const first = sheet.sprites[0]
    this._cellAspect = first && first.height > 0 ? first.width / first.height : null
    const keepAspectRatio = this._aspectMode === 'contain'
    this.setTiles(
      sheet.sprites.map((sprite, idx) => ({
        id: idx,
        name: names?.[idx],
        paintable: sprite.createPaintable({ keepAspectRatio }),
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
    const [w, h] = this._swatchDimensions()
    let child = this._flow.get_first_child() as Gtk.FlowBoxChild | null
    while (child) {
      const swatch = child.get_child()
      if (swatch) {
        swatch.set_size_request(w, h)
      }
      child = child.get_next_sibling() as Gtk.FlowBoxChild | null
    }
  }

  /**
   * Return `[width, height]` for a single swatch. In `fill` mode
   * stays square at `tileSize × tileSize` — that's what the
   * tile-tab / scene-editor pickers expect. In `contain` mode with
   * a known cell aspect (set by `setFromSpriteSheet`), the cell is
   * sized so the LONGER axis equals `tileSize` and the shorter
   * derives from the aspect: 16×32 sprites with `tileSize=48` →
   * 24×48 cells; 32×16 sprites with `tileSize=48` → 48×24 cells.
   * Square sprites still fall through to `tileSize × tileSize`.
   */
  private _swatchDimensions(): [number, number] {
    if (this._aspectMode === 'fill' || this._cellAspect === null) {
      return [this._tileSize, this._tileSize]
    }
    if (this._cellAspect >= 1) {
      // Wider than tall — width is the longer axis.
      return [this._tileSize, Math.max(1, Math.round(this._tileSize / this._cellAspect))]
    }
    // Taller than wide — height is the longer axis.
    return [Math.max(1, Math.round(this._tileSize * this._cellAspect)), this._tileSize]
  }

  /** Clear the visual selection (no tile armed). */
  clearSelection(): void {
    this._flow.unselect_all()
    this._selectedId = null
  }

  private _buildSwatch(tile: TileDescriptor): Gtk.FlowBoxChild {
    const child = new Gtk.FlowBoxChild()
    // Picture's content-fit + the paintable's `keepAspectRatio` option
    // pull in the same direction — both must match the aspect-mode
    // setting. `fill` stretches the sprite to fill the square cell
    // (tile-tab / scene-editor use case); `contain` preserves aspect
    // inside cells sized by `_swatchDimensions`.
    const [w, h] = this._swatchDimensions()
    const swatch = createSwatchWidget(tile, w, h, this._aspectMode)
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

import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { GdkSpriteSheet } from '../../sprite'
import { SignalScope } from '../../utils/signal-scope.ts'
import { cellAspectOf, linePolicy, swatchDimensions, type TilePaletteAspectMode } from './tile-palette.geometry.ts'
import { createSwatchWidget } from './tile-swatch.ts'

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
 * 5-column FlowBox of tile swatches. Emits `tile-selected::<id>` when a
 * swatch is activated. Used by `tiles-tab` and the active-tile popover
 * surfaced inside `floating-top-bar`.
 *
 * The swatch size is configurable; default 42px matches the design
 * handoff §"Tiles tab" spec.
 */
export class TilePalette extends Adw.Bin {
  declare _flow: Gtk.FlowBox

  private _tiles: TileDescriptor[] = []
  private _tileSize: number = 42
  private _selectedId: number | null = null
  private _aspectMode: TilePaletteAspectMode = 'fill'
  private _wrap = false
  private _dragSource = false
  /**
   * Aspect ratio (width / height) of the active sprite-sheet's
   * sprites — populated by `setFromSpriteSheet` from the first
   * sprite (character sprite-sheets are uniform so this is
   * reliable). `null` when the palette holds raw `TileDescriptor`s
   * with no shared aspect or when `aspectMode === 'fill'`.
   */
  private _cellAspect: number | null = null
  private _signals = new SignalScope()

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
          // Whether the FlowBox is allowed to wrap to available width —
          // see `linePolicy` in `tile-palette.geometry.ts` for what the
          // two modes do to the children-per-line bounds.
          wrap: GObject.ParamSpec.boolean(
            'wrap',
            'Wrap',
            'Whether the FlowBox is allowed to wrap to the available width (vs. pinned to a fixed column count)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          // When on, each swatch becomes a `Gtk.DragSource` carrying its
          // tile id, so cells can be DRAGGED out (e.g. into the animation
          // editor's timeline to insert a frame at a caret) in addition to
          // click-to-select. Off by default — the map/scene pickers only
          // click. See `tile-drag-started` / `tile-drag-ended`.
          'drag-source': GObject.ParamSpec.boolean(
            'drag-source',
            'Drag Source',
            'Whether swatches can be dragged out (carrying their tile id)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
        Signals: {
          'tile-selected': { param_types: [GObject.TYPE_INT] },
          // A swatch drag began / ended (only fired in `drag-source` mode).
          // The host uses these to arm/disarm its own drop handling — the
          // dragged tile id rides `tile-drag-started`.
          'tile-drag-started': { param_types: [GObject.TYPE_INT] },
          'tile-drag-ended': {},
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
    const [min, max] = linePolicy(value, this._wrap, WRAP_MAX_CHILDREN)
    this._flow.set_min_children_per_line(min)
    this._flow.set_max_children_per_line(max)
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

  get dragSource(): boolean {
    return this._dragSource ?? false
  }

  set dragSource(value: boolean) {
    if (this._dragSource === value) return
    this._dragSource = value
    this.notify('drag-source')
    // Existing swatches need a rebuild so the DragSource controller is
    // added/removed (mirrors `aspectMode`).
    if (this._tiles.length > 0) this.setTiles(this._tiles)
  }

  get selectedId(): number | null {
    return this._selectedId
  }

  vfunc_map(): void {
    super.vfunc_map()
    this._signals.connect(this._flow, 'child-activated', (_box: Gtk.FlowBox, child: Gtk.FlowBoxChild) => {
      const tile = this._tiles[child.get_index()]
      if (!tile) return
      this._selectedId = tile.id
      this.emit('tile-selected', tile.id)
    })
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    super.vfunc_unmap()
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
    this._cellAspect = cellAspectOf(sheet.sprites[0])
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

  /** Clear the visual selection (no tile armed). */
  clearSelection(): void {
    this._flow.unselect_all()
    this._selectedId = null
  }

  /** `[width, height]` of one swatch under the current sizing policy. */
  private _swatchDimensions(): [number, number] {
    return swatchDimensions(this._tileSize, this._aspectMode, this._cellAspect)
  }

  private _reflowSwatchSize(): void {
    const [w, h] = this._swatchDimensions()
    let child = this._flow.get_first_child() as Gtk.FlowBoxChild | null
    while (child) {
      child.get_child()?.set_size_request(w, h)
      child = child.get_next_sibling() as Gtk.FlowBoxChild | null
    }
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
    if (this._dragSource) this._attachDragSource(child, tile, w, h)
    return child
  }

  /**
   * Make a swatch draggable: a `Gtk.DragSource` carrying the tile id as a
   * string (the drop handler reads it via the host's side-channel, armed by
   * `tile-drag-started`). Coexists with click-to-select — GTK only starts
   * the drag once the press passes the movement threshold.
   */
  private _attachDragSource(child: Gtk.FlowBoxChild, tile: TileDescriptor, w: number, h: number): void {
    const source = new Gtk.DragSource({ actions: Gdk.DragAction.COPY })
    source.connect('prepare', () => {
      const value = new GObject.Value()
      value.init(GObject.TYPE_STRING)
      value.set_string(String(tile.id))
      return Gdk.ContentProvider.new_for_value(value)
    })
    source.connect('drag-begin', () => {
      if (tile.paintable) source.set_icon(tile.paintable, Math.round(w / 2), Math.round(h / 2))
      this.emit('tile-drag-started', tile.id)
    })
    source.connect('drag-end', () => this.emit('tile-drag-ended'))
    child.add_controller(source)
  }
}

GObject.type_ensure(TilePalette.$gtype)

import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Pango from '@girs/pango-1.0'
import { LAYER_PLANES, type LayerPlane, type TileCollisionRef } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import { SignalScope } from '../../utils/signal-scope.ts'
import { SheetThumbnail } from '../tiles/sheet-thumbnail.ts'
import { DepthGlyph } from './depth-glyph.ts'
import { GLYPH_SIZES } from './depth-glyph.geometry.ts'
import { TerrainThumbnail } from './terrain-thumbnail.ts'
import { TilePalette } from './tile-palette.ts'
import { TileSheet } from './tile-sheet.ts'
import type { SheetGrid, SheetSpan, SheetStampPick } from './tile-sheet.geometry.ts'

import Template from './brush-page.blp'

GObject.type_ensure(TilePalette.$gtype)
GObject.type_ensure(TileSheet.$gtype)
GObject.type_ensure(DepthGlyph.$gtype)
GObject.type_ensure(TerrainThumbnail.$gtype)

/** One placeable library object shown in the page's Things grid. */
export interface ObjectBrushDescriptor {
  /** Library entity id (string — unlike numeric tile ids). */
  id: string
  name?: string
  /** Sprite thumbnail; falls back to {@link ObjectBrushDescriptor.color}. */
  paintable?: Gdk.Paintable | null
  /** Solid fallback swatch colour (e.g. the def's marker colour). */
  color?: string
}

/** One tileset the map references, shown as a chip above the sheet. */
export interface TilesetChipDescriptor {
  /** Sprite-set id — what {@link BrushPage} emits when the chip is tapped. */
  id: string
  name: string
  /**
   * The sheet's own texture, drawn whole by {@link SheetThumbnail}; an
   * icon stands in without one. The chip takes the FULL texture rather
   * than a pre-shrunk copy so the sheet is resampled exactly once, with
   * the filter its fit asks for (§ 7).
   */
  sheet?: Gdk.Texture | null
}

/** One terrain brush of the loaded tileset, shown as a chip above the sheet. */
export interface TerrainChipDescriptor {
  /** Terrain id, unique within its sprite set — what the chip emits. */
  id: string
  name: string
  /**
   * The nine sprites of the brush's 3×3 sample, row-major (the engine's
   * `terrainPreviewSpriteIds`, resolved to paintables by the host). A
   * `null` entry draws as bare checkerboard.
   */
  tiles: ReadonlyArray<Gdk.Paintable | null>
  /** Side of one tile in the source sheet, so the patch is drawn at a whole scale. */
  tilePx?: number
}

/** The three planes, top of the world first — the order the Layers page shows. */
const CHIP_PLANES: readonly LayerPlane[] = ['overlay', 'hero', 'ground'] as const

/** The child-legible name of each plane. The long form is the tooltip. */
const PLANE_CAPTIONS: Record<LayerPlane, { short: () => string; long: () => string }> = {
  ground: { short: () => _('Below'), long: () => _('Below the hero') },
  hero: { short: () => _('Hero height'), long: () => _('At hero height') },
  overlay: { short: () => _('Above'), long: () => _('Above the hero') },
}

/** Thumbnail box of a tileset chip — landscape, because sheets are wide. */
const CHIP_THUMB = { width: 56, height: 40 } as const

/**
 * Typed view of the signals {@link BrushPage} registers, layered on the
 * parent's own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface BrushPageSignals extends Adw.Bin.SignalSignatures {
  'tile-selected': (tileId: number) => void
  'stamp-selected': (pick: SheetStampPick) => void
  'object-brush-selected': (defId: string) => void
  'plane-selected': (plane: string) => void
  'tileset-selected': (spriteSetId: string) => void
  'terrain-selected': (terrainId: string) => void
  'layers-requested': () => void
}

/**
 * Everything that decides what the next stroke lays: which plane, which
 * layer, which tileset, which tile, which object.
 *
 * Tiles and Things are PEERS here, one `Adw.ToggleGroup` apart. They used
 * to share a scroll with the Things grid below a palette tall enough to
 * need its own scrollbar, so on a phone sheet nobody ever reached it.
 *
 * One instance with two homes — the wide inspector's Brush page and the
 * phone sheet's Brush page — because "what the next stroke lays" should
 * have one implementation, not an inspector copy and a sheet copy that
 * drift. `EditorPages.host` moves it between the two slot sets; nothing
 * about the widget knows which home it is in.
 *
 * Pure view: it renders what the host pushes in and emits what the user
 * picked. The host owns the engine writes.
 */
export class BrushPage extends Adw.Bin {
  declare _plane_chips: Adw.ToggleGroup
  declare _layers_button: Gtk.Button
  declare _mode_toggle: Adw.ToggleGroup
  declare _tileset_row: Gtk.Box
  declare _tileset_chips: Adw.ToggleGroup
  declare _terrain_row: Gtk.ScrolledWindow
  declare _terrain_chips: Adw.ToggleGroup
  declare _sheet_scroller: Gtk.ScrolledWindow
  declare _sheet: TileSheet
  declare _empty_state: Adw.StatusPage
  declare _object_palette: TilePalette
  declare _objects_empty: Gtk.Label

  private _layerName = ''
  private _objectBrushIds: string[] = []
  private _planes = new Set<LayerPlane>()
  /** Set while a programmatic plane write is in flight, so it never re-emits. */
  private _echo = false
  /** The same guard for the tileset chips, which the host also writes. */
  private _tilesetEcho = false
  /** And for the terrain chips, which the host clears whenever a tile is picked. */
  private _terrainEcho = false
  /** How many brushes the loaded tileset has — the row hides at zero. */
  private _terrainCount = 0
  /** Whether a sheet is loaded at all; the chip row cannot outlive it. */
  private _hasSheet = false
  private _signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgBrushPage',
        Template,
        InternalChildren: [
          'plane_chips',
          'layers_button',
          'mode_toggle',
          'tileset_row',
          'tileset_chips',
          'terrain_row',
          'terrain_chips',
          'sheet_scroller',
          'sheet',
          'empty_state',
          'object_palette',
          'objects_empty',
        ],
        Properties: {
          'layer-name': GObject.ParamSpec.string(
            'layer-name',
            'Layer Name',
            'Name of the active layer, shown above the palette',
            GObject.ParamFlags.READWRITE,
            '',
          ),
        },
        Signals: {
          'tile-selected': { param_types: [GObject.TYPE_INT] },
          // The sheet's multi-tile pick, forwarded as it arrives: right
          // after the `tile-selected` that carries its anchor.
          'stamp-selected': { param_types: [GObject.TYPE_JSOBJECT] },
          'object-brush-selected': { param_types: [GObject.TYPE_STRING] },
          // A plane chip was tapped — the host activates that plane's
          // last-used layer.
          'plane-selected': { param_types: [GObject.TYPE_STRING] },
          // A tileset chip was tapped — the host re-points the sheet.
          'tileset-selected': { param_types: [GObject.TYPE_STRING] },
          // A brush chip was tapped — the host arms that terrain. Only
          // ever carries an id: a brush is disarmed by picking a tile,
          // not by tapping the armed chip again.
          'terrain-selected': { param_types: [GObject.TYPE_STRING] },
          // "Layers…" — the host opens the full list.
          'layers-requested': { param_types: [] },
        },
      },
      BrushPage,
    )
  }

  declare connect: GObject.SignalMethods<this, BrushPageSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, BrushPageSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, BrushPageSignals>['emit']

  constructor() {
    super()
    this._buildPlaneChips()
  }

  vfunc_map(): void {
    super.vfunc_map()
    this._signals.connect(this._sheet, 'tile-selected', (_s: TileSheet, tileId: number) =>
      this.emit('tile-selected', tileId),
    )
    this._signals.connect(this._sheet, 'stamp-selected', (_s: TileSheet, pick: SheetStampPick) =>
      this.emit('stamp-selected', pick),
    )
    this._signals.connect(this._object_palette, 'tile-selected', (_p: TilePalette, idx: number) => {
      const defId = this._objectBrushIds[idx]
      if (defId) this.emit('object-brush-selected', defId)
    })
    this._signals.connect(this._plane_chips, 'notify::active-name', () => {
      if (this._echo) return
      const name = this._plane_chips.get_active_name()
      if (name) this.emit('plane-selected', name)
    })
    this._signals.connect(this._tileset_chips, 'notify::active-name', () => {
      if (this._tilesetEcho) return
      const name = this._tileset_chips.get_active_name()
      if (name) this.emit('tileset-selected', name)
    })
    this._signals.connect(this._terrain_chips, 'notify::active-name', () => {
      if (this._terrainEcho) return
      const name = this._terrain_chips.get_active_name()
      if (name) this.emit('terrain-selected', name)
    })
    this._signals.connect(this._layers_button, 'clicked', () => this.emit('layers-requested'))
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    super.vfunc_unmap()
  }

  get layerName(): string {
    return this._layerName ?? ''
  }

  set layerName(value: string) {
    if (this._layerName === value) return
    this._layerName = value
    this.notify('layer-name')
  }

  /** The project's player sprite, drawn in every plane chip's glyph. */
  set heroPaintable(paintable: Gdk.Paintable | null) {
    for (const plane of CHIP_PLANES) {
      const glyph = this._plane_chips.get_toggle_by_name(plane)?.get_child()?.get_first_child()
      if (glyph instanceof DepthGlyph) glyph.heroPaintable = paintable
    }
  }

  /**
   * Show a tileset as the contiguous picture it is. Passing `null` for
   * either argument swaps the sheet for the "Import a picture…" state.
   *
   * `collision` is what each tile blocks, for the "Show walls" hatch.
   * It rides along with the texture rather than arriving on its own
   * setter so it can never describe the previous tileset.
   */
  setSheet(
    texture: Gdk.Texture | null,
    grid: SheetGrid | null,
    collision: ReadonlyMap<number, TileCollisionRef> | null = null,
  ): void {
    const has = texture !== null && grid !== null
    this._hasSheet = has
    this._sheet.setSheet(texture, grid)
    this._sheet.setCollision(collision)
    this._tileset_row.set_visible(has)
    this._sheet_scroller.set_visible(has)
    this._empty_state.set_visible(!has)
    this._syncTerrainRow()
  }

  /**
   * Re-point the wall hatch without touching the picture — for a
   * collision edit that landed while this sheet was already loaded.
   * The host owns the "is this still the same tileset?" check.
   */
  setCollision(collision: ReadonlyMap<number, TileCollisionRef> | null): void {
    this._sheet.setCollision(collision)
  }

  /** Ring the active tile on the sheet without re-emitting. */
  selectTile(id: number): void {
    this._sheet.selectTile(id)
  }

  /** Ring the whole armed block on the sheet without re-emitting. */
  selectStamp(span: SheetSpan | null): void {
    this._sheet.selectStamp(span)
  }

  /**
   * Check the chip of the tileset the host actually loaded, without
   * re-emitting — the load can be refused or redirected, so the chips
   * follow the host's answer rather than the tap.
   */
  selectTileset(spriteSetId: string): void {
    if (!this._tileset_chips.get_toggle_by_name(spriteSetId)) return
    this._tilesetEcho = true
    try {
      this._tileset_chips.set_active_name(spriteSetId)
    } finally {
      this._tilesetEcho = false
    }
  }

  /**
   * List the map's tilesets as chips and check the active one. This is
   * the ONLY way to change the painting tileset — there is no second
   * "Switch…" path that could hold a different answer.
   */
  setTilesets(tilesets: ReadonlyArray<TilesetChipDescriptor>, activeId: string | null): void {
    this._tilesetEcho = true
    try {
      this._tileset_chips.remove_all()
      for (const tileset of tilesets) {
        this._tileset_chips.add(
          new Adw.Toggle({ name: tileset.id, child: tilesetChipChild(tileset), tooltip: tileset.name }),
        )
      }
      if (activeId && tilesets.some((tileset) => tileset.id === activeId)) {
        this._tileset_chips.set_active_name(activeId)
      }
    } finally {
      this._tilesetEcho = false
    }
  }

  /**
   * List the loaded tileset's terrain brushes as chips between the
   * tileset row and the sheet, and check the armed one (`null`: none).
   *
   * Called on every tileset load, so an empty list is the normal way the
   * row disappears again — a brush of the previous sheet must never stay
   * on screen, since terrain ids are only unique within their set.
   */
  setTerrains(terrains: ReadonlyArray<TerrainChipDescriptor>, activeId: string | null): void {
    this._terrainEcho = true
    try {
      this._terrain_chips.remove_all()
      for (const terrain of terrains) {
        this._terrain_chips.add(
          new Adw.Toggle({ name: terrain.id, child: terrainChipChild(terrain), tooltip: terrain.name }),
        )
      }
      this._terrainCount = terrains.length
      this._terrain_chips.set_active_name(
        activeId && terrains.some((terrain) => terrain.id === activeId) ? activeId : null,
      )
    } finally {
      this._terrainEcho = false
    }
    this._syncTerrainRow()
  }

  /**
   * Check the chip of the armed brush, or none on `null`, without
   * re-emitting. `null` is the common case: every tile pick disarms the
   * brush (§6.2's mutual exclusion), and the row has to say so — an
   * armed-looking chip that paints nothing is worse than no chip.
   */
  selectTerrain(terrainId: string | null): void {
    const name = terrainId && this._terrain_chips.get_toggle_by_name(terrainId) ? terrainId : null
    this._terrainEcho = true
    try {
      this._terrain_chips.set_active_name(name)
    } finally {
      this._terrainEcho = false
    }
  }

  /** The row exists only where there is both a sheet and a brush on it. */
  private _syncTerrainRow(): void {
    this._terrain_row.set_visible(this._hasSheet && this._terrainCount > 0)
  }

  setObjectBrushes(brushes: ReadonlyArray<ObjectBrushDescriptor>): void {
    this._objectBrushIds = brushes.map((b) => b.id)
    this._object_palette.setTiles(
      brushes.map((b, idx) => ({ id: idx, name: b.name, color: b.color, paintable: b.paintable ?? undefined })),
    )
    this._objects_empty.set_visible(brushes.length === 0)
  }

  /**
   * Mirror an externally-armed object brush (`null` clears) without
   * re-emitting. An armed object also brings the Things page forward —
   * the brush the user just armed has to be the one they can see.
   */
  selectObjectBrush(defId: string | null): void {
    const idx = defId ? this._objectBrushIds.indexOf(defId) : -1
    if (idx < 0) {
      this._object_palette.clearSelection()
      return
    }
    this._object_palette.selectTile(idx)
    this._mode_toggle.set_active_name('things')
  }

  /**
   * Check the chip for the active layer's plane, and grey out the planes
   * the map has no layer on — tapping one would have nowhere to go, and
   * a tooltip says so rather than the tap silently doing nothing.
   */
  setActivePlane(plane: LayerPlane, populated: readonly LayerPlane[]): void {
    this._planes = new Set(populated)
    for (const candidate of CHIP_PLANES) {
      const toggle = this._plane_chips.get_toggle_by_name(candidate)
      if (!toggle) continue
      const has = this._planes.has(candidate)
      toggle.set_enabled(has)
      toggle.set_tooltip(has ? PLANE_CAPTIONS[candidate].long() : _('No layer here yet'))
    }
    this._echo = true
    try {
      this._plane_chips.set_active_name(plane)
    } finally {
      this._echo = false
    }
  }

  private _buildPlaneChips(): void {
    for (const plane of CHIP_PLANES) {
      const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 })
      box.append(new DepthGlyph({ plane, size: GLYPH_SIZES.row }))
      // Ellipsizing is what lets the chips ADAPT: `can-shrink` on the
      // group is a no-op for custom children (gtkbutton.c), so without it
      // three rigid captions are the sheet's widest row — and the widest
      // row is the whole editor's minimum width (see brush-page.blp). At
      // the default text scale nothing is ever cut; at a larger one the
      // caption shortens before the window refuses to shrink.
      const caption = new Gtk.Label({ label: PLANE_CAPTIONS[plane].short(), ellipsize: Pango.EllipsizeMode.END })
      caption.add_css_class('caption')
      box.append(caption)
      this._plane_chips.add(new Adw.Toggle({ name: plane, child: box, tooltip: PLANE_CAPTIONS[plane].long() }))
    }
  }
}

/** Thumbnail over an ellipsizing name — the body of one tileset chip. */
function tilesetChipChild(tileset: TilesetChipDescriptor): Gtk.Widget {
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 })
  let thumb: Gtk.Widget
  if (tileset.sheet) {
    const sheet = new SheetThumbnail(CHIP_THUMB)
    sheet.setSheet(tileset.sheet)
    thumb = sheet
  } else {
    thumb = new Gtk.Image({ iconName: 'image-x-generic-symbolic' })
    thumb.set_size_request(CHIP_THUMB.width, CHIP_THUMB.height)
  }
  box.append(thumb)
  const caption = new Gtk.Label({
    label: tileset.name,
    ellipsize: Pango.EllipsizeMode.END,
    maxWidthChars: 10,
  })
  caption.add_css_class('caption')
  box.append(caption)
  return box
}

/** The 3×3 patch over an ellipsizing name — the body of one brush chip. */
function terrainChipChild(terrain: TerrainChipDescriptor): Gtk.Widget {
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 })
  const thumb = new TerrainThumbnail()
  thumb.setTiles(terrain.tiles, terrain.tilePx)
  box.append(thumb)
  const caption = new Gtk.Label({ label: terrain.name, ellipsize: Pango.EllipsizeMode.END, maxWidthChars: 10 })
  caption.add_css_class('caption')
  box.append(caption)
  return box
}

/** Every plane a map has at least one layer on, for {@link BrushPage.setActivePlane}. */
export function populatedPlanes(layers: ReadonlyArray<{ plane?: LayerPlane }>): LayerPlane[] {
  const seen = new Set(layers.map((layer) => layer.plane ?? 'ground'))
  return LAYER_PLANES.filter((plane) => seen.has(plane))
}

GObject.type_ensure(BrushPage.$gtype)

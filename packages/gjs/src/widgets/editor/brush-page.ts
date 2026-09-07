import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { LAYER_PLANES, type LayerPlane } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import { SignalScope } from '../../utils/signal-scope.ts'
import { DepthGlyph } from './depth-glyph.ts'
import { GLYPH_SIZES } from './depth-glyph.geometry.ts'
import type { ObjectBrushDescriptor } from './tiles-tab.ts'
import { type TileDescriptor, TilePalette } from './tile-palette.ts'

import Template from './brush-page.blp'

GObject.type_ensure(TilePalette.$gtype)
GObject.type_ensure(DepthGlyph.$gtype)

/** The three planes, top of the world first — the order the Layers tab shows. */
const CHIP_PLANES: readonly LayerPlane[] = ['overlay', 'hero', 'ground'] as const

/** The child-legible name of each plane. The long form is the tooltip. */
const PLANE_CAPTIONS: Record<LayerPlane, { short: () => string; long: () => string }> = {
  ground: { short: () => _('Below'), long: () => _('Below the hero') },
  hero: { short: () => _('Hero height'), long: () => _('At hero height') },
  overlay: { short: () => _('Above'), long: () => _('Above the hero') },
}

/**
 * Everything that decides what the next stroke lays: which plane, which
 * layer, which tile, which object.
 *
 * One instance with two homes — the brush badge's popover on wide
 * layouts, the bottom sheet's Brush page on phone — because "what a
 * layer looks like" should have one implementation, not a popover copy
 * and a sheet copy that drift. `SceneEditor.setLayout` moves it; nothing
 * about the widget knows which home it is in.
 *
 * Pure view: it renders what the host pushes in and emits what the user
 * picked. The host owns the engine writes.
 */
export class BrushPage extends Adw.Bin {
  declare _plane_chips: Adw.ToggleGroup
  declare _layer_label: Gtk.Label
  declare _layers_button: Gtk.Button
  declare _search: Gtk.SearchEntry
  declare _palette: TilePalette
  declare _objects_section: Gtk.Box
  declare _object_palette: TilePalette
  declare _objects_empty: Gtk.Label

  private _layerName = ''
  private _tiles: TileDescriptor[] = []
  private _objectBrushIds: string[] = []
  private _activeTileId: number | null = null
  private _planes = new Set<LayerPlane>()
  /** Set while a programmatic plane write is in flight, so it never re-emits. */
  private _echo = false
  private _signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgBrushPage',
        Template,
        InternalChildren: [
          'plane_chips',
          'layer_label',
          'layers_button',
          'search',
          'palette',
          'objects_section',
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
          'object-brush-selected': { param_types: [GObject.TYPE_STRING] },
          // A plane chip was tapped — the host activates that plane's
          // last-used layer.
          'plane-selected': { param_types: [GObject.TYPE_STRING] },
          // "Layers…" — the host opens the full list.
          'layers-requested': { param_types: [] },
        },
      },
      BrushPage,
    )
  }

  constructor() {
    super()
    this._buildPlaneChips()
  }

  vfunc_map(): void {
    super.vfunc_map()
    this._signals.connect(this._palette, 'tile-selected', (_p: TilePalette, tileId: number) =>
      this.emit('tile-selected', tileId),
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
    this._signals.connect(this._layers_button, 'clicked', () => this.emit('layers-requested'))
    this._signals.connect(this._search, 'search-changed', () => this._applyFilter())
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

  setTiles(tiles: TileDescriptor[]): void {
    this._tiles = tiles
    this._applyFilter()
  }

  /** Ring the swatch for the active tile without re-emitting. */
  selectTile(id: number): void {
    this._activeTileId = id
    this._palette.selectTile(id)
  }

  setObjectBrushes(brushes: ReadonlyArray<ObjectBrushDescriptor>): void {
    this._objectBrushIds = brushes.map((b) => b.id)
    this._object_palette.setTiles(
      brushes.map((b, idx) => ({ id: idx, name: b.name, color: b.color, paintable: b.paintable ?? undefined })),
    )
    this._objects_section.set_visible(brushes.length > 0)
    this._objects_empty.set_visible(brushes.length === 0)
  }

  /** Mirror an externally-armed object brush (`null` clears) without re-emitting. */
  selectObjectBrush(defId: string | null): void {
    const idx = defId ? this._objectBrushIds.indexOf(defId) : -1
    if (idx < 0) this._object_palette.clearSelection()
    else this._object_palette.selectTile(idx)
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
      const caption = new Gtk.Label({ label: PLANE_CAPTIONS[plane].short() })
      caption.add_css_class('caption')
      box.append(caption)
      this._plane_chips.add(new Adw.Toggle({ name: plane, child: box, tooltip: PLANE_CAPTIONS[plane].long() }))
    }
  }

  /**
   * Narrow the palette to the tiles whose name matches the search. The
   * active tile survives the filter when it still matches, so typing
   * does not silently disarm the brush.
   */
  private _applyFilter(): void {
    const needle = this._search.get_text().trim().toLowerCase()
    const shown = needle
      ? this._tiles.filter((tile) => (tile.name ?? `Tile ${tile.id}`).toLowerCase().includes(needle))
      : this._tiles
    this._palette.setTiles(shown)
    if (this._activeTileId != null && shown.some((tile) => tile.id === this._activeTileId)) {
      this._palette.selectTile(this._activeTileId)
    }
  }
}

/** Every plane a map has at least one layer on, for {@link BrushPage.setActivePlane}. */
export function populatedPlanes(layers: ReadonlyArray<{ plane?: LayerPlane }>): LayerPlane[] {
  const seen = new Set(layers.map((layer) => layer.plane ?? 'ground'))
  return LAYER_PLANES.filter((plane) => seen.has(plane))
}

GObject.type_ensure(BrushPage.$gtype)

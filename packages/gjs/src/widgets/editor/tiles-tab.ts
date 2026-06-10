import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { type TileDescriptor, TilePalette } from './tile-palette'

import Template from './tiles-tab.blp'

GObject.type_ensure(TilePalette.$gtype)

/** One placeable library object shown in the tab's Objects grid. */
export interface ObjectBrushDescriptor {
  /** Library entity id (string — unlike numeric tile ids). */
  id: string
  name?: string
  /** Sprite thumbnail; falls back to {@link color}. */
  paintable?: Gdk.Paintable | null
  /** Solid fallback swatch colour (e.g. the def's marker colour). */
  color?: string
}

/**
 * Inspector's "Tiles" tab.
 *
 * Hosts a search entry, the active tileset name + "Switch…" button, the
 * {@link TilePalette}, and below it an **Objects grid** — the same
 * palette widget fed with the project's placeable library objects, so
 * picking an object feels exactly like picking a tile. Tile selections
 * re-emit as `tile-selected::<id>`; object picks as
 * `object-brush-selected::<defId>` (the host arms the Object tool).
 *
 * Stamps are deferred until the tileset editor lands — once tilesets
 * own a stamps collection, this tab will gain a configurable stamps
 * grid sourced from the active tileset.
 */
export class TilesTab extends Adw.Bin {
  declare _search: Gtk.SearchEntry
  declare _tileset_label: Gtk.Label
  declare _switch_button: Gtk.Button
  declare _palette: TilePalette
  declare _objects_section: Gtk.Box
  declare _object_palette: TilePalette

  private _tilesetName = ''
  /** defIds by palette index — `TilePalette` ids are numeric, objects are strings. */
  private _objectBrushIds: string[] = []

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTilesTab',
        Template,
        InternalChildren: ['search', 'tileset_label', 'switch_button', 'palette', 'objects_section', 'object_palette'],
        Properties: {
          'tileset-name': GObject.ParamSpec.string(
            'tileset-name',
            'Tileset Name',
            'Caption shown above the palette',
            GObject.ParamFlags.READWRITE,
            '',
          ),
        },
        Signals: {
          'tile-selected': { param_types: [GObject.TYPE_INT] },
          // A library object was picked from the Objects grid (defId).
          'object-brush-selected': { param_types: [GObject.TYPE_STRING] },
        },
      },
      TilesTab,
    )
  }

  constructor() {
    super()
    this._palette.connect('tile-selected', (_p, tileId) => this.emit('tile-selected', tileId))
    this._object_palette.connect('tile-selected', (_p, idx: number) => {
      const defId = this._objectBrushIds[idx]
      if (defId) this.emit('object-brush-selected', defId)
    })
  }

  get tilesetName(): string {
    return this._tilesetName ?? ''
  }

  set tilesetName(value: string) {
    if (this._tilesetName === value) return
    this._tilesetName = value
    this.notify('tileset-name')
  }

  setTiles(tiles: TileDescriptor[]): void {
    this._palette.setTiles(tiles)
  }

  /** Visually highlight a tile in the inner palette, used to mirror an
   * external selection (e.g. via the top-bar tile popover). */
  selectTile(id: number): void {
    this._palette.selectTile(id)
  }

  /**
   * Populate the Objects grid with the project's placeable library
   * objects. Hidden when there are none. Cells render the object's
   * sprite contain-fitted into a tile-sized framed cell (or its marker
   * colour as a solid swatch) — the same visual language as placements
   * on the map.
   */
  setObjectBrushes(brushes: ReadonlyArray<ObjectBrushDescriptor>): void {
    this._objectBrushIds = brushes.map((b) => b.id)
    this._object_palette.setTiles(
      brushes.map((b, idx) => ({
        id: idx,
        name: b.name,
        color: b.color,
        paintable: b.paintable ?? undefined,
      })),
    )
    this._objects_section.set_visible(brushes.length > 0)
  }

  /**
   * Mirror an externally-armed object brush (`null` clears) without
   * re-emitting `object-brush-selected`.
   */
  selectObjectBrush(defId: string | null): void {
    const idx = defId ? this._objectBrushIds.indexOf(defId) : -1
    if (idx < 0) this._object_palette.clearSelection()
    else this._object_palette.selectTile(idx)
  }
}

GObject.type_ensure(TilesTab.$gtype)

import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { type TileDescriptor, TilePalette } from './tile-palette'

import Template from './tiles-tab.blp'

GObject.type_ensure(TilePalette.$gtype)

/**
 * Inspector's "Tiles" tab.
 *
 * Hosts a search entry, the active tileset name + "Switch…" button, and
 * the {@link TilePalette}. Tile selections re-emit on the tab as
 * `tile-selected::<id>` for the parent inspector to relay.
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

  private _tilesetName = ''

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTilesTab',
        Template,
        InternalChildren: ['search', 'tileset_label', 'switch_button', 'palette'],
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
        },
      },
      TilesTab,
    )
  }

  constructor() {
    super()
    this._palette.connect('tile-selected', (_p, tileId) => this.emit('tile-selected', tileId))
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
   * external selection (e.g. via the context-chip popover). */
  selectTile(id: number): void {
    this._palette.selectTile(id)
  }
}

GObject.type_ensure(TilesTab.$gtype)

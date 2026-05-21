import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'

import Template from './context-chip.blp'

/**
 * Top-right OSD chip combining the active-tile and active-layer
 * selectors.
 *
 * Two pill-shaped `MenuButton`s separated by a vertical rule. Popovers
 * are attached externally via {@link ContextChip.setTilePopover} /
 * {@link ContextChip.setLayerPopover} so the parent (typically the
 * scene editor) controls their contents.
 */
export class ContextChip extends Adw.Bin {
  declare _tile_button: Gtk.MenuButton
  declare _layer_button: Gtk.MenuButton
  declare _tile_name: Gtk.Label
  declare _layer_name: Gtk.Label
  declare _tile_swatch: Gtk.Image

  private _tileName = ''
  private _layerName = ''

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgContextChip',
        Template,
        InternalChildren: ['tile_button', 'layer_button', 'tile_name', 'layer_name', 'tile_swatch'],
        Properties: {
          'tile-name': GObject.ParamSpec.string(
            'tile-name',
            'Tile Name',
            'Name of the active tile',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'layer-name': GObject.ParamSpec.string(
            'layer-name',
            'Layer Name',
            'Name of the active layer',
            GObject.ParamFlags.READWRITE,
            '',
          ),
        },
      },
      ContextChip,
    )
  }

  get tileName(): string {
    return this._tileName ?? ''
  }

  set tileName(value: string) {
    if (this._tileName === value) return
    this._tileName = value
    this.notify('tile-name')
  }

  get layerName(): string {
    return this._layerName ?? ''
  }

  set layerName(value: string) {
    if (this._layerName === value) return
    this._layerName = value
    this.notify('layer-name')
  }

  setTilePopover(popover: Gtk.Popover): void {
    this._tile_button.set_popover(popover)
  }

  /**
   * Replace the active-tile swatch icon with a `Gdk.Paintable` rendering
   * of the currently-selected tile. Falls back to the generic
   * `view-grid-symbolic` icon when called with `null` (no tileset yet).
   */
  setTilePaintable(paintable: Gdk.Paintable | null): void {
    if (paintable) {
      this._tile_swatch.set_from_paintable(paintable)
    } else {
      this._tile_swatch.set_from_icon_name('view-grid-symbolic')
    }
  }

  setLayerPopover(popover: Gtk.Popover): void {
    this._layer_button.set_popover(popover)
  }
}

GObject.type_ensure(ContextChip.$gtype)

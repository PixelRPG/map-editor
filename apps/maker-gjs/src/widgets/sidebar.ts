import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import {
  MapEditorPanel,
  SpriteSheetWidget,
  LayersWidget,
} from '@pixelrpg/ui-gjs'

import Template from './sidebar.blp'

export class Sidebar extends Adw.Bin {
  // GObject internal children
  declare _mapEditorPanel: MapEditorPanel

  static {
    GObject.registerClass(
      {
        GTypeName: 'Sidebar',
        Template,
        InternalChildren: ['mapEditorPanel'],
      },
      this,
    )
  }

  constructor(params: Partial<Adw.Bin.ConstructorProps>) {
    super(params)
  }

  /**
   * Set the sprite sheet widget for tileset selection
   * @param tileset The sprite sheet widget to set
   */
  setSpriteSheet(tileset: SpriteSheetWidget) {
    this._mapEditorPanel.setSpriteSheet(tileset)
  }

  /**
   * Set the layers widget for layer selection
   * @param layers The layers widget to set
   */
  setLayers(layers: LayersWidget) {
    this._mapEditorPanel.setLayers(layers)
  }
}
// WORKAROUND: Make sure the MapEditorPanel is registered before the Sidebar, try fixed by import order?
GObject.type_ensure(MapEditorPanel.$gtype)

GObject.type_ensure(Sidebar.$gtype)

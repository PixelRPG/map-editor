import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { SidebarPageTilesets } from './sidebar-page-tilesets.ts'
import { SidebarPageLayer } from './sidebar-page-layer.ts'
import { SpriteSheetWidget } from './sprite-sheet.widget.ts'
import { LayersWidget } from './layers.widget.ts'

import Template from './sidebar.ui?raw'

GObject.type_ensure(SidebarPageTilesets.$gtype)
GObject.type_ensure(SidebarPageLayer.$gtype)

export class Sidebar extends Adw.Bin {

  // GObject internal children
  declare _pageTilesets: SidebarPageTilesets
  declare _pageLayer: SidebarPageLayer

  static {
    GObject.registerClass({
      GTypeName: 'Sidebar',
      Template,
      InternalChildren: ['pageTilesets', 'pageLayer']
    }, this);
  }

  constructor(params: Partial<Adw.Bin.ConstructorProps>) {
    super(params)
  }

  /**
   * Set the content widget of the sidebar
   * @param content The content widget to set
   */
  setSpriteSheet(tileset: SpriteSheetWidget) {
    this._pageTilesets.set_child(tileset)
  }

  setLayers(layers: LayersWidget) {
    this._pageLayer.set_child(layers)
  }
}

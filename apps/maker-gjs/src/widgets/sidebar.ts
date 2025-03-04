import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { SidebarPageTilesets } from './sidebar-page-tilesets.ts'
import { SidebarPageLayer } from './sidebar-page-layer.ts'
import { TilesetWidget } from './tileset.widget.ts'
import { LayersWidget } from './layers.widget.ts'

import Template from './sidebar.ui?raw'

GObject.type_ensure(SidebarPageTilesets.$gtype)
GObject.type_ensure(SidebarPageLayer.$gtype)

export interface Sidebar {
  // Child widgets
  _pageTilesets: InstanceType<typeof SidebarPageTilesets>
  _pageLayer: InstanceType<typeof SidebarPageLayer>
}

export class Sidebar extends Adw.Bin {

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
  setTileset(tileset: InstanceType<typeof TilesetWidget>) {
    this._pageTilesets.set_child(tileset)
  }

  setLayers(layers: InstanceType<typeof LayersWidget>) {
    this._pageLayer.set_child(layers)
  }
}

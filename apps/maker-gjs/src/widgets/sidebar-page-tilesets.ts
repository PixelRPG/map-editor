import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'

import { TilesetWidget } from './tileset.widget'

import Template from './sidebar-page-tilesets.ui?raw'

export interface SidebarPageTilesets {
  // Child widgets
}

export class SidebarPageTilesets extends Adw.Bin {

  static {
    GObject.registerClass({
      GTypeName: 'SidebarPageTilesets',
      Template,
      InternalChildren: []
    }, this);
  }

  constructor(params: Partial<Adw.Bin.ConstructorProps>) {
    super(params)
  }

  set_child(child: InstanceType<typeof TilesetWidget>) {
    return super.set_child(child);
  }
}

import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'

import { SpriteSheetWidget } from './sprite-sheet.widget'

import Template from './sidebar-page-tilesets.ui?raw'

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

  set_child(child: SpriteSheetWidget) {
    return super.set_child(child);
  }
}

GObject.type_ensure(SidebarPageTilesets.$gtype)
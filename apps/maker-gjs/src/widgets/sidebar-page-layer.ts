import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import { LayersWidget } from './layers.widget.ts'

import Template from './sidebar-page-layer.ui?raw'

export class SidebarPageLayer extends Adw.Bin {

  static {
    GObject.registerClass({
      GTypeName: 'SidebarPageLayer',
      Template,
      InternalChildren: []
    }, this);
  }

  constructor(params: Partial<Adw.Bin.ConstructorProps>) {
    super(params)
  }

  set_child(child: LayersWidget) {
    super.set_child(child);
  }
}

GObject.type_ensure(SidebarPageLayer.$gtype)
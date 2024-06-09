import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import { LayersWidget } from './layers.widget.ts'

import Template from './sidebar-page-layer.ui?raw'

interface _SidebarPageLayer {
  // Child widgets
}

class _SidebarPageLayer extends Adw.Bin {
  constructor(params: Partial<Adw.Bin.ConstructorProps>) {
    super(params)
  }

  set_child(child: InstanceType<typeof LayersWidget>) {
    super.set_child(child);
  }
}

export const SidebarPageLayer = GObject.registerClass(
  {
    GTypeName: 'SidebarPageLayer',
    Template,
    InternalChildren: []
  },
  _SidebarPageLayer
)

import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'

import Template from './sidebar-page-layer.ui?raw'

interface _SidebarPageLayer {
  // Child widgets
}

class _SidebarPageLayer extends Adw.Bin {
  constructor(params: Partial<Adw.Bin.ConstructorProps>) {
    super(params)
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

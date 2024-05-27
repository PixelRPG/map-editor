import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'

// import Template from './sidebar-content.ui?raw'

export const SidebarContent = GObject.registerClass(
  {
    GTypeName: 'SidebarContent',
    //  Template,
  },
  class SidebarContent extends Adw.Bin {

    constructor(params: Partial<Adw.Bin.ConstructorProps>) {
      super(params)
    }
  },
)

import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'

import Template from './sidebar.ui?raw'

export const Sidebar = GObject.registerClass(
  {
    GTypeName: 'Sidebar',
    Template,
  },
  class Sidebar extends Adw.Bin {
    constructor(params: Adw.Bin.ConstructorProps) {
      // params.orientation = Gtk.Orientation.VERTICAL
      super(params)
    }
  },
)

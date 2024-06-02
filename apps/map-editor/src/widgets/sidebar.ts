import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { SidebarContent } from './sidebar-content.ts'

import Template from './sidebar.ui?raw'

GObject.type_ensure(SidebarContent.$gtype)

interface _Sidebar {
  _sidebarContent: InstanceType<typeof SidebarContent>
}

class _Sidebar extends Adw.Bin {

  setContent(content: Gtk.Widget) {
    console.log('Setting content')
    this._sidebarContent.set_child(content)
  }

  constructor(params: Partial<Adw.Bin.ConstructorProps>) {
    // params.orientation = Gtk.Orientation.VERTICAL
    super(params)
  }
}

export const Sidebar = GObject.registerClass(
  {
    GTypeName: 'Sidebar',
    Template,
    InternalChildren: ['sidebarContent']
  },
  _Sidebar
)

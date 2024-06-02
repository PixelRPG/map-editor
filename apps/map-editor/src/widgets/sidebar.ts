import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { SidebarContent } from './sidebar-content.ts'

import Template from './sidebar.ui?raw'

GObject.type_ensure(SidebarContent.$gtype)

interface _Sidebar {
  // Child widgets
  /** The content widget of the sidebar */
  _sidebarContent: InstanceType<typeof SidebarContent>
}

class _Sidebar extends Adw.Bin {

  /**
   * Set the content widget of the sidebar
   * @param content The content widget to set
   */
  setContent(contentWidget: Gtk.Widget) {
    this._sidebarContent.set_child(contentWidget)
  }

  constructor(params: Partial<Adw.Bin.ConstructorProps>) {
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

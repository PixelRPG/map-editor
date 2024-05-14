import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'

import { WebView } from './webview.ts'
import { Sidebar } from './sidebar.ts'

import Template from './application-window.ui?raw'

// Ensure widgets are loaded and can be used in the XML
GObject.type_ensure(WebView as unknown as GObject.GType)
GObject.type_ensure(Sidebar as unknown as GObject.GType)

export const ApplicationWindow = GObject.registerClass(
  {
    GTypeName: 'ApplicationWindow',
    Template,
  },
  class ApplicationWindow extends Adw.ApplicationWindow {
    constructor(application: Adw.Application) {
      super({ application })
    }
  },
)

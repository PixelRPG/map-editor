import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import Gtk from '@girs/gtk-4.0'

import { WebView } from './webview.ts'
import { Sidebar } from './sidebar.ts'
import { Tileset } from './tileset.ts'

import Template from './application-window.ui?raw'

import type { EventDataStateChanged, State } from '@pixelrpg/common'

// Ensure widgets are loaded and can be used in the XML
GObject.type_ensure(WebView.$gtype)
GObject.type_ensure(Sidebar.$gtype)

interface _ApplicationWindow {
  _sidebar: InstanceType<typeof Sidebar> | undefined
  _webView: InstanceType<typeof WebView> | undefined
}

class _ApplicationWindow extends Adw.ApplicationWindow {
  constructor(application: Adw.Application) {
    super({ application })

    this._webView?.messagesService.onEvent('state-changed', (event) => {

      // TODO: Continue here
      // new Tileset(event.data.data.state.tilesets[0])

      this._sidebar?.setContent(new Adw.StatusPage({ title: 'State changed' }))
    })

    this._webView?.messagesService.onMessage((message) => {
      console.log('Message from WebView:', message)
      this._webView?.messagesService.send({ type: 'text', data: 'Hello back from GJS!' })
    })
  }
}

export const ApplicationWindow = GObject.registerClass(
  {
    GTypeName: 'ApplicationWindow',
    Template,
    InternalChildren: ['sidebar', 'webView'],
  },
  _ApplicationWindow
)

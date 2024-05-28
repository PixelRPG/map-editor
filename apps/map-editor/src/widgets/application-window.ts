import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import Gtk from '@girs/gtk-4.0'

import { WebView } from './webview.ts'
import { Sidebar } from './sidebar.ts'
import { Tileset } from './tileset.ts'

import { clientResourceManager } from '../managers/client-resource.manager.ts'

import type { ImageResource } from '../types/image-resource.ts'
import type { DataResource } from '@pixelrpg/common'

import Template from './application-window.ui?raw'

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

      const imageResources = this.parseImageResources(event.data.data.state.resources)

      // TODO: Continue here
      new Tileset(event.data.data.state.tilesets[0], imageResources)

      this._sidebar?.setContent(new Adw.StatusPage({ title: 'State changed' }))
    })

    this._webView?.messagesService.onMessage((message) => {
      console.log('Message from WebView:', message)
      this._webView?.messagesService.send({ type: 'text', data: 'Hello back from GJS!' })
    })
  }

  // TODO: Move to a parser?
  parseImageResources(resources: DataResource[]) {
    const imageResources: ImageResource[] = []

    for (const resource of resources) {
      if (resource.mimeType === 'image/png') {
        // const image = clientResourceManager.get(resource.path)
        imageResources.push({
          ...resource,
          mimeType: 'image/png',
          pixbuf: GdkPixbuf.Pixbuf.new_from_file(resource.path)
        })
      } else {
        console.log('Unsupported resource type:', resource.mimeType)
      }
    }

    return imageResources
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

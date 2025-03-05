import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'

import { WebView } from './webview.ts'
import { Sidebar } from './sidebar.ts'
import { SpriteSheetWidget } from './sprite-sheet.widget.ts'
import { LayersWidget } from './layers.widget.ts'

import { SpriteSheet } from '../g-objects/sprite-sheet.ts'
import { Layer } from '../g-objects/layer.ts'

import { clientResourceManager } from '../managers/client-resource.manager.ts'

import type { ImageReference } from '@pixelrpg/data-core'
import type { ImageResource } from '@pixelrpg/data-gjs'
import type { State } from '@pixelrpg/data-core'
import type { MessageEvent, EventDataStateChanged, MessageText } from '@pixelrpg/messages-core'

import Template from './application-window.ui?raw'

// Ensure widgets are loaded and can be used in the XML
GObject.type_ensure(WebView.$gtype)
GObject.type_ensure(Sidebar.$gtype)

export interface ApplicationWindow {
  // Child widgets
  _sidebar: Sidebar | undefined
  _webView: WebView | undefined
}

export class ApplicationWindow extends Adw.ApplicationWindow {

  static {
    GObject.registerClass({
      GTypeName: 'ApplicationWindow',
      Template,
      InternalChildren: ['sidebar', 'webView'],
    }, this);
  }

  constructor(application: Adw.Application) {
    super({ application })
    this.onWebViewStateChanged = this.onWebViewStateChanged.bind(this)
    this.onWebViewMessage = this.onWebViewMessage.bind(this)

    this._webView?.messagesService.onEvent('state-changed', this.onWebViewStateChanged)

    this._webView?.messagesService.onMessage(this.onWebViewMessage)
  }

  protected onWebViewMessage(message: MessageText) {
    console.log('Message from WebView:', message)
    this._webView?.messagesService.send({ type: 'text', data: 'Hello back from GJS!' })
  }

  protected onWebViewStateChanged(event: MessageEvent<EventDataStateChanged<State>>) {
    const state = this._webView?.messagesService.state

    if (!state) {
      console.error('No state in event')
      return
    }

    console.log('onWebViewStateChanged Property:', event.data.data.property)

    switch (event.data.data.property) {
      case "spriteSheets":
        if (!state?.spriteSheets.length) {
          console.log('No resources or spriteSheets in state')
          return
        }

        if (!state.spriteSheets[0].image) {
          console.error('No image in spriteSheet')
          return
        }

        const imageResource = this.parseImageResource(state.spriteSheets[0].image)
        if (!imageResource) {
          console.error('Failed to parse image resource')
          return
        }

        const spriteSheet = new SpriteSheet(state.spriteSheets[0], imageResource)

        const spriteSheetWidget = new SpriteSheetWidget(spriteSheet)
        this._sidebar?.setSpriteSheet(spriteSheetWidget)
        break;

      case "map":
        console.log('onWebViewStateChanged Map:', event.data.data.value)
        break;
      case "layers":
        console.log('onWebViewStateChanged Layers:', event.data.data.value)
        const layers = state.layers.map((layer) => new Layer({ name: layer.name, type: layer.type }))
        const layersWidget = new LayersWidget(layers)
        this._sidebar?.setLayers(layersWidget)
        break;

      default:
        break;
    }


  }

  // TODO: Move to a parser?
  parseImageResource(resource: ImageReference): ImageResource | null {

    const pixbuf = clientResourceManager.getPixbuf(resource.path)
    if (!pixbuf) {
      console.error('Failed to get pixbuf for resource:', resource.path)
      return null
    }
    const imageResource: ImageResource = {
      path: resource.path,
      mimeType: 'image/png',
      pixbuf,
    }
    return imageResource
  }
}

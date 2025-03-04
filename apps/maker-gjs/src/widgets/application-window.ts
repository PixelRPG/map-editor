import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'

import { WebView } from './webview.ts'
import { Sidebar } from './sidebar.ts'
import { TilesetWidget } from './tileset.widget.ts'
import { LayersWidget } from './layers.widget.ts'

import { Tileset } from '../g-objects/tileset.ts'
import { Layer } from '../g-objects/layer.ts'

import { clientResourceManager } from '../managers/client-resource.manager.ts'

import type { ImageResource } from '../types/image-resource.ts'
import type { DataResource, MessageEvent, EventDataStateChanged, State, MessageText } from '@pixelrpg/messages-core'

import Template from './application-window.ui?raw'

// Ensure widgets are loaded and can be used in the XML
GObject.type_ensure(WebView.$gtype)
GObject.type_ensure(Sidebar.$gtype)

export interface ApplicationWindow {
  // Child widgets
  _sidebar: InstanceType<typeof Sidebar> | undefined
  _webView: InstanceType<typeof WebView> | undefined
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
      case "resources":
      case "tilesets":
        if (!state?.resources.length || !state?.tilesets.length) {
          console.log('No resources or tilesets in state')
          return
        }

        const imageResources = this.parseImageResources(state.resources)
        const tileset = new Tileset(state.tilesets[0], imageResources)

        const tilesetWidget = new TilesetWidget(tileset)
        this._sidebar?.setTileset(tilesetWidget)
        break;

      case "map":
        console.log('onWebViewStateChanged Map:', event.data.data.value)
        break;
      case "layers":
        console.log('onWebViewStateChanged Layers:', event.data.data.value)
        const layers = state.layers.map((layer) => new Layer(layer.name))
        const layersWidget = new LayersWidget(layers)
        this._sidebar?.setLayers(layersWidget)
        break;

      default:
        break;
    }


  }

  // TODO: Move to a parser?
  parseImageResources(resources: DataResource[]) {
    const imageResources: ImageResource[] = []

    for (const resource of resources) {
      if (resource.mimeType === 'image/png') {
        const pixbuf = clientResourceManager.getPixbuf(resource.path)
        if (!pixbuf) {
          console.error('Failed to get pixbuf for resource:', resource.path)
          continue
        }
        imageResources.push({
          ...resource,
          mimeType: 'image/png',
          pixbuf,
        })
      } else {
        console.warn('Unsupported resource type:', resource.mimeType)
      }
    }

    return imageResources
  }
}

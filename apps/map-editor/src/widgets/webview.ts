// Inspirations: https://github.com/sonnyp/Tangram/blob/main/src/WebView.js

import GObject from '@girs/gobject-2.0'
import WebKit from '@girs/webkit-6.0'
import Gtk from '@girs/gtk-4.0'

import { MessagesService } from '@pixelrpg/messages-gjs'
import mime from 'mime'

import Template from './webview.ui?raw'
import { clientResource } from '../resource.ts'
import { EventControllerInput } from '../event-controller-input.ts'

export const WebView = GObject.registerClass(
  {
    GTypeName: 'WebView',
    Template,
  },
  class WebView extends WebKit.WebView {

    protected messagesService: MessagesService

    constructor(props: Partial<WebKit.WebView.ConstructorProps>) {
      const network_session = new WebKit.NetworkSession({})

      const web_context = new WebKit.WebContext()
      web_context.set_spell_checking_enabled(true)

      const settings = new WebKit.Settings({
        enable_smooth_scrolling: true,
        media_playback_requires_user_gesture: false,
        enable_developer_extras: true,
        javascript_can_open_windows_automatically: true,
        allow_top_navigation_to_data_urls: false,
        // allow_file_access_from_file_urls: true,
        // allow_universal_access_from_file_urls: true,
      })

      settings.set_user_agent_with_application_details("PixelRPG", /*pkg.version*/ "0.0.1");

      super({
        ...props,
        web_context,
        settings,
        network_session,
      })

      this.onReady = this.onReady.bind(this)
      this.onMouseMotion = this.onMouseMotion.bind(this)
      this.onMouseLeave = this.onMouseLeave.bind(this)
      this.onMouseEnter = this.onMouseEnter.bind(this)
      this.onURISchemeRequest = this.onURISchemeRequest.bind(this)

      this.registerURIScheme('pixelrpg', this.onURISchemeRequest)
      this.messagesService = this.initMessagesService()

      this.initInputController()
      this.initPageLoadListener()

      this.load_uri('pixelrpg:///org/pixelrpg/map-editor/client/index.html')
    }

    protected initMessagesService() {
      const messagesService = new MessagesService('pixelrpg', this)
      messagesService.onMessage((message) => {
        console.log('Message from WebView:', message)
        messagesService.send({ type: 'text', data: 'Hello back from GJS!' })
      })
      return messagesService
    }

    protected initInputController() {
      const motionEventController = new EventControllerInput()
      motionEventController.connect('leave', this.onMouseLeave)
      motionEventController.connect('enter', this.onMouseEnter)
      motionEventController.connect('motion', this.onMouseMotion)
      motionEventController.addTo(this)
    }

    protected initPageLoadListener() {
      const signalId = this.connect('load-changed', (_source: this, loadEvent: WebKit.LoadEvent) => {
        console.log('WebView load changed')
        if (loadEvent === WebKit.LoadEvent.FINISHED) {
          console.log('WebView load finished')
          this.onReady()
          this.disconnect(signalId);
        }
      });
    }

    protected registerURIScheme(scheme: string, handler: (schemeRequest: WebKit.URISchemeRequest) => void) {
      const security_manager = this.web_context.get_security_manager()
      security_manager.register_uri_scheme_as_cors_enabled(scheme);
      this.web_context.register_uri_scheme(scheme, handler)
    }

    protected onReady() {
      console.log('First page view is finished')
    }

    protected onMouseMotion(inputController: InstanceType<typeof EventControllerInput>, x: number, y: number) {
      // Round to 10th
      x = Math.round(x * 10) / 10
      y = Math.round(y * 10) / 10
      console.log('Mouse has moved in the WebView', inputController.isOutside, x, y);
      this.messagesService.send({ type: 'event', data: { name: 'mouse-move', data: { x, y } } })
    }

    protected onMouseLeave() {
      console.log('Mouse has left the WebView');
      this.messagesService.send({ type: 'event', data: { name: 'mouse-leave', data: null } })
    }

    protected onMouseEnter() {
      console.log('Mouse has entered the WebView');
      this.messagesService.send({ type: 'event', data: { name: 'mouse-enter', data: null } })
    }

    protected onURISchemeRequest(schemeRequest: WebKit.URISchemeRequest) {
      // const uri = schemeRequest.get_uri()

      const path = schemeRequest.get_path()
      const extension = path.split('.').pop()

      const stream = clientResource.stream(path)
      if (!stream) {
        console.error('Error opening stream', path)
        return
      }
      const contentType = extension ? mime.getType(extension) : null
      schemeRequest.finish(stream, -1, contentType)
    }

  }
)

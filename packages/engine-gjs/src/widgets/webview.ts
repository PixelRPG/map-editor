// Inspirations: https://github.com/sonnyp/Tangram/blob/main/src/WebView.js

import GObject from '@girs/gobject-2.0'
import WebKit from '@girs/webkit-6.0'
import Gio from '@girs/gio-2.0'

import { MessagesService } from '@pixelrpg/messages-gjs'
import mime from 'mime'

import Template from './webview.ui?raw'
import { EventControllerInput, INTERNAL_PROTOCOL } from '../utils/index.ts'
import {
    InputEventType,
    engineMessagesService,
    engineInputEventsService,
    type EngineMessage
} from '@pixelrpg/engine-core'

import { ResourceManager } from '../services/resource-manager.ts'

/**
 * WebView component for rendering the Excalibur.js engine
 */
export class WebView extends WebKit.WebView {

    private resourceManager: ResourceManager = new ResourceManager()

    static {
        GObject.registerClass({
            GTypeName: 'WebView',
            Template,
        }, this);
    }

    protected _messagesService: MessagesService<EngineMessage>

    /**
     * Get the messages service for communication with the WebView
     */
    get messagesService() {
        return this._messagesService
    }

    /**
     * Create a new WebView instance
     * @param props Constructor properties
     * @param resourceManager Resource manager for handling internal requests
     */
    constructor(
        props: Partial<WebKit.WebView.ConstructorProps>
    ) {
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
            network_session
        })

        this.onReady = this.onReady.bind(this)
        this.onMouseMotion = this.onMouseMotion.bind(this)
        this.onMouseLeave = this.onMouseLeave.bind(this)
        this.onMouseEnter = this.onMouseEnter.bind(this)
        this.onInternalRequest = this.onInternalRequest.bind(this)

        this.registerURIScheme(INTERNAL_PROTOCOL, this.onInternalRequest)
        this._messagesService = this.initMessagesService()

        this.initInputController()
        this.initPageLoadListener()

        this.load_uri(`${INTERNAL_PROTOCOL}:///index.html`)
    }

    /**
     * Initialize the messages service for communication with the WebView
     */
    protected initMessagesService() {
        const messagesService = new MessagesService<EngineMessage>(INTERNAL_PROTOCOL, this)
        return messagesService
    }

    /**
     * Initialize the input controller for handling mouse events
     */
    protected initInputController() {
        const motionEventController = new EventControllerInput()
        motionEventController.connect('leave', this.onMouseLeave)
        motionEventController.connect('enter', this.onMouseEnter)
        motionEventController.connect('motion', this.onMouseMotion)
        motionEventController.addTo(this)
    }

    /**
     * Initialize the page load listener
     */
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

    /**
     * Register a URI scheme handler
     * @param scheme The URI scheme to register
     * @param handler The handler function
     */
    protected registerURIScheme(scheme: string, handler: (schemeRequest: WebKit.URISchemeRequest) => void) {
        const security_manager = this.web_context.get_security_manager()
        security_manager.register_uri_scheme_as_cors_enabled(scheme);
        this.web_context.register_uri_scheme(scheme, handler)
    }

    /**
     * Called when the page is ready
     */
    protected onReady() {
        console.log('First page view is finished')
    }

    /**
     * Called when the mouse moves in the WebView
     * @param _source The event source
     * @param x The x coordinate
     * @param y The y coordinate
     */
    protected onMouseMotion(_source: EventControllerInput, x: number, y: number) {
        // Round to 10th
        x = Math.round(x * 10) / 10
        y = Math.round(y * 10) / 10

        // Send mouse move event
        this._messagesService.send(engineMessagesService.inputEvent(
            engineInputEventsService.mouseMove({ x, y })
        ));
    }

    /**
     * Called when the mouse leaves the WebView
     * @param _source The event source
     */
    protected onMouseLeave(_source: EventControllerInput) {
        console.log('Mouse has left the WebView');

        // Send mouse leave event with no position data
        this._messagesService.send(engineMessagesService.inputEvent(
            engineInputEventsService.mouseLeave()
        ));
    }

    /**
     * Called when the mouse enters the WebView
     * @param _source The event source
     * @param x The x coordinate
     * @param y The y coordinate
     */
    protected onMouseEnter(_source: EventControllerInput, x: number, y: number) {
        console.log('Mouse has entered the WebView');

        // Send mouse enter event
        this._messagesService.send(engineMessagesService.inputEvent(
            engineInputEventsService.mouseEnter({ x, y })
        ));
    }

    /**
     * Handle internal requests
     * @param schemeRequest The scheme request
     */
    protected onInternalRequest(schemeRequest: WebKit.URISchemeRequest) {
        const path = schemeRequest.get_path()
        console.log(`Handling internal request for: ${path}`)

        const extension = path.split('.').pop()

        const stream = this.resourceManager.stream(path)
        if (!stream) {
            console.error('Error opening stream', path)
            return
        }
        const contentType = extension ? mime.getType(extension) : null
        schemeRequest.finish(stream, -1, contentType)
    }
} 
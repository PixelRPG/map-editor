// Inspirations: https://github.com/sonnyp/Tangram/blob/main/src/WebView.js

import GObject from '@girs/gobject-2.0'
import WebKit from '@girs/webkit-6.0'
import Gio from '@girs/gio-2.0'

import { RpcEndpoint } from '@pixelrpg/message-channel-gjs'
import mime from 'mime'

import Template from './webview.ui?raw'
import { EventControllerInput, INTERNAL_PROTOCOL } from '../utils/index.ts'
import {
    engineInputEventsService,
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
            Signals: {
                'ready': {}
            }
        }, this);
    }

    protected _rpc?: RpcEndpoint

    /**
     * Get the RPC server for communication with the WebView
     */
    get rpc() {
        return this._rpc
    }

    /**
     * Set resource paths for the resource manager
     * @param paths Array of resource paths
     */
    setResourcePaths(paths: string[]) {
        // Create a new resource manager with the updated paths
        this.resourceManager = new ResourceManager(paths, this.resourceManager.gresourcePath)
        console.log('Resource paths updated:', paths)
    }

    /**
     * Add a resource path to the resource manager
     * @param path Resource path to add
     */
    addResourcePath(path: string) {
        this.resourceManager.addPath(path)
        console.log('Resource path added:', path)
    }

    /**
     * Set the GResource path for the resource manager
     * @param path GResource path
     */
    setGResourcePath(path: string) {
        this.resourceManager.setGResourcePath(path)
        console.log('GResource path updated:', path)
    }

    /**
     * Create a new WebView instance
     * @param props Constructor properties
     * @param resourceManager Resource manager for handling internal requests
     */
    constructor(
        props: Partial<WebKit.WebView.ConstructorProps>
    ) {
        console.log('Creating WebView')
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

        console.log('Initializing WebView')

        this.connect('realize', () => {
            console.log('WebView realized')
            this._rpc = this.initRpcServer()

            this.initInputController()
            this.initPageLoadListener()

            this.load_uri(`${INTERNAL_PROTOCOL}:///index.html`)
        })
    }

    /**
     * Initialize the RPC server for communication with the WebView
     */
    protected initRpcServer() {
        console.log('Initializing RpcServer, webView:', this)
        const rpc = RpcEndpoint.getInstance(INTERNAL_PROTOCOL, this)

        // Register RPC methods
        // TODO: Make this type safe
        rpc.registerHandler('handleInputEvent', async (params) => {
            console.log('Handling input event:', params);
            // Process the input event
            // The implementation would depend on how input events are handled
            return { success: true };
        });

        return rpc
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
        this.emit('ready')
    }

    /**
     * Called when the mouse moves in the WebView
     * @param _source The event source
     * @param x The x coordinate
     * @param y The y coordinate
     */
    protected onMouseMotion(_source: EventControllerInput, x: number, y: number) {
        if (!this._rpc) {
            console.error('RPC server is not initialized');
            return;
        }

        // Round to 10th for optimization
        x = Math.round(x * 10) / 10;
        y = Math.round(y * 10) / 10;

        try {
            // Send mouse move event using notification (no response expected)
            // This prevents timeouts for frequent events
            this._rpc.sendNotification(
                'handleInputEvent',
                engineInputEventsService.mouseMove({ x, y })
            ).catch(error => {
                console.error('Error sending mouse move event:', error);
            });
        } catch (error) {
            console.error('Error creating mouse move event:', error);
        }
    }

    /**
     * Called when the mouse leaves the WebView
     * @param _source The event source
     */
    protected onMouseLeave(_source: EventControllerInput) {
        if (!this._rpc) {
            console.error('RPC server is not initialized');
            return;
        }

        console.log('Mouse has left the WebView');

        // Send mouse leave event with no position data using notification (fire and forget)
        this._rpc.sendNotification(
            'handleInputEvent',
            engineInputEventsService.mouseLeave()
        ).catch(error => {
            console.error('Error sending mouse leave event:', error);
        });
    }

    /**
     * Called when the mouse enters the WebView
     * @param _source The event source
     * @param x The x coordinate
     * @param y The y coordinate
     */
    protected onMouseEnter(_source: EventControllerInput, x: number, y: number) {
        if (!this._rpc) {
            console.error('RPC server is not initialized');
            return;
        }

        console.log('Mouse has entered the WebView');

        // Send mouse enter event using notification (fire and forget)
        this._rpc.sendNotification(
            'handleInputEvent',
            engineInputEventsService.mouseEnter({ x, y })
        ).catch(error => {
            console.error('Error sending mouse enter event:', error);
        });
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
            schemeRequest.finish_error(new Gio.IOErrorEnum({
                code: Gio.IOErrorEnum.NOT_FOUND,
                message: `Resource not found: ${path}`
            }))
            return
        }
        const contentType = extension ? mime.getType(extension) : null
        schemeRequest.finish(stream, -1, contentType)
    }
}

GObject.type_ensure(WebView.$gtype)
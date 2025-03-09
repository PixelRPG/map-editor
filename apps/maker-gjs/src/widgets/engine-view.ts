import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import { GjsEngine, ResourceManager } from '@pixelrpg/engine-gjs'
import { EngineMessage } from '@pixelrpg/engine-core'

import { clientResourceManager } from '../managers/client-resource.manager.ts'
import { CLIENT_DIR_PATH } from '../constants.ts'

import Template from './engine-view.ui?raw'

/**
 * EngineView component that wraps the GjsEngine
 */
export class EngineView extends Adw.Bin {
    static {
        GObject.registerClass({
            GTypeName: 'EngineView',
            Template,
            Signals: {
                'message-received': { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    private engine: GjsEngine

    constructor() {
        super()

        // Create a resource manager for the engine
        const resourceManager = new ResourceManager([
            CLIENT_DIR_PATH.get_path()!,
        ])

        // Initialize the engine with resource paths and the GResource path
        this.engine = new GjsEngine(
            [CLIENT_DIR_PATH.get_path()!],
            '/org/pixelrpg/maker/engine-excalibur'
        )
        this.initEngine()
    }

    /**
     * Initialize the engine
     */
    private async initEngine() {
        try {
            await this.engine.initialize()

            // Get the WebView from the engine and add it to this container
            const webView = this.engine.getWebView()
            if (webView) {
                console.log("WebView obtained from engine, adding to EngineView");

                // Add the WebView to this container
                this.set_child(webView);

                // Ensure the WebView is shown
                webView.show();
                this.show();

                console.log("WebView added to EngineView");

                // Set up message handlers
                this.setupMessageHandlers()
            } else {
                console.error('Failed to get WebView from engine')
            }
        } catch (error) {
            console.error('Failed to initialize engine:', error)
        }
    }

    /**
     * Set up message handlers for communication with the engine
     */
    private setupMessageHandlers() {
        const webView = this.engine.getWebView()
        if (!webView) return

        // Handle text messages from the WebView
        webView.messagesService.on('text', (message) => {
            console.log('Message from WebView:', message)

            // Emit a signal that can be caught by the application
            this.emit('message-received', JSON.stringify(message))
        })
    }

    /**
     * Send a message to the engine
     * @param message The message to send
     */
    public sendMessage(message: any) {
        const webView = this.engine.getWebView()
        if (!webView) return

        webView.messagesService.send(message)
    }

    /**
     * Load a project
     * @param projectPath Path to the project file
     */
    public async loadProject(projectPath: string) {
        try {
            await this.engine.loadProject(projectPath)
        } catch (error) {
            console.error('Failed to load project:', error)
        }
    }

    /**
     * Load a map
     * @param mapId ID of the map to load
     */
    public async loadMap(mapId: string) {
        try {
            await this.engine.loadMap(mapId)
        } catch (error) {
            console.error('Failed to load map:', error)
        }
    }

    /**
     * Start the engine
     */
    public async start() {
        try {
            await this.engine.start()
        } catch (error) {
            console.error('Failed to start engine:', error)
        }
    }

    /**
     * Stop the engine
     */
    public async stop() {
        try {
            await this.engine.stop()
        } catch (error) {
            console.error('Failed to stop engine:', error)
        }
    }

    /**
     * Pause the engine
     */
    public pause() {
        try {
            this.engine.pause()
        } catch (error) {
            console.error('Failed to pause engine:', error)
        }
    }

    /**
     * Resume the engine
     */
    public resume() {
        try {
            this.engine.resume()
        } catch (error) {
            console.error('Failed to resume engine:', error)
        }
    }

    /**
     * Get the engine instance
     */
    public getEngine() {
        return this.engine
    }
} 
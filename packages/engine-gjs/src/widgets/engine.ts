import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import { EventDispatcher } from '@pixelrpg/message-channel-core'
import {
    EngineInterface,
    EngineEvent,
    EngineEventType,
    EngineStatus,
    ProjectLoadOptions,
    EngineCommandType,
    EngineEventHandler,
    createInitializationError,
    createRuntimeError,
    createValidationError,
    createResourceError,
    formatError,
} from '@pixelrpg/engine-core'
import { CLIENT_DIR_PATH, CLIENT_RESOURCE_PATH } from '../utils/constants.ts'

import { WebView } from './webview.ts'
import Template from './engine.ui?raw'

GObject.type_ensure(WebView.$gtype)

export namespace Engine {

    export type ConstructorProps = Partial<Adw.Bin.ConstructorProps>

    export interface SignalProps {
        'message-received': [string]
        'ready': []
    }
}

/**
 * GJS implementation of the game engine as a GObject widget
 */
export class Engine extends Adw.Bin implements EngineInterface {

    /**
     * WebView for rendering the game
     */
    declare _webView: WebView | null

    static {
        GObject.registerClass({
            GTypeName: 'Engine',
            Template,
            Signals: {
                'message-received': { param_types: [GObject.TYPE_STRING] },
                'ready': {},
            },
            InternalChildren: ['webView'],
        }, this);
    }

    /**
     * Current status of the engine
     */
    public status: EngineStatus = EngineStatus.INITIALIZING

    /**
     * Resource paths for the engine
     */
    private resourcePaths: string[] = [CLIENT_DIR_PATH.get_path()!]

    /**
     * GResource path for the engine
     */
    private gresourcePath: string = CLIENT_RESOURCE_PATH

    /**
     * Signal handlers for the engine
     */
    private engineEventHandlers = new Map<string, Set<EngineEventHandler>>()

    /**
     * Create a new GJS engine
     */
    constructor(params: Engine.ConstructorProps = {}) {
        super(params);

        try {
            this.setStatus(EngineStatus.INITIALIZING);

            // Initialize resource paths
            this._webView?.setResourcePaths(this.resourcePaths);
            this._webView?.setGResourcePath(this.gresourcePath);

            this._webView?.connect('ready', () => {
                console.log('[GJS Engine] WebView ready');

                // Set up event listeners
                this.setupEventListeners();

                this.setStatus(EngineStatus.READY);
                this.emit('ready');
            })
        } catch (error) {
            console.error('[GJS Engine] Failed to initialize engine:', error);
            this.setStatus(EngineStatus.ERROR);
            throw createInitializationError('Failed to initialize GJS engine', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Initialize the engine
     */
    public async initialize(): Promise<void> {
        // Nothing to do yet
    }

    /**
     * Load a project
     */
    public async loadProject(projectPath: string, options?: ProjectLoadOptions): Promise<void> {
        if (!this._webView?.rpc) {
            throw createRuntimeError('RPC server is not initialized');
        }

        if (this.status === EngineStatus.INITIALIZING) {
            throw createRuntimeError('Engine not initialized');
        }

        if (!projectPath || projectPath.trim() === '') {
            throw createValidationError('Invalid project path');
        }

        projectPath = Gio.File.new_for_path(projectPath).get_path()!

        try {
            // Send an RPC request to load the project
            await this._webView.rpc.sendRequest('loadProject', {
                projectPath,
                options
            });

            console.log('[GJS Engine] Project load request sent:', projectPath);
        } catch (error) {
            console.error('[GJS Engine] Failed to load project:', error);
            throw createResourceError(`Failed to load project: ${projectPath}`, error instanceof Error ? error : undefined);
        }
    }

    /**
     * Load a map
     */
    public async loadMap(mapId: string): Promise<void> {
        if (this.status === EngineStatus.INITIALIZING) {
            throw createRuntimeError('Engine not initialized');
        }

        if (!mapId || mapId.trim() === '') {
            throw createValidationError('Invalid map ID');
        }

        try {
            // Send an RPC request to load the map
            await this._webView?.rpc?.sendRequest('loadMap', {
                mapId
            });

            console.log('[GJS Engine] Map load request sent:', mapId);
        } catch (error) {
            console.error('[GJS Engine] Failed to load map:', error);
            throw createResourceError(`Failed to load map: ${mapId}`, error instanceof Error ? error : undefined);
        }
    }

    /**
     * Start the engine
     */
    public async start(): Promise<void> {
        if (this.status === EngineStatus.INITIALIZING) {
            throw createRuntimeError('Engine not initialized');
        }

        try {
            // Send an RPC request to start the engine
            await this._webView?.rpc?.sendRequest('engineCommand', {
                command: EngineCommandType.START
            });

            console.log('[GJS Engine] Start command sent');
            this.setStatus(EngineStatus.RUNNING);
        } catch (error) {
            console.error('[GJS Engine] Failed to start engine:', error);
            throw createRuntimeError('Failed to start engine', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Stop the engine
     */
    public async stop(): Promise<void> {
        if (this.status === EngineStatus.INITIALIZING) {
            throw createRuntimeError('Engine not initialized');
        }

        try {
            // Send an RPC request to stop the engine
            await this._webView?.rpc?.sendRequest('engineCommand', {
                command: EngineCommandType.STOP
            });

            console.log('[GJS Engine] Stop command sent');
        } catch (error) {
            console.error('[GJS Engine] Failed to stop engine:', error);
            throw createRuntimeError('Failed to stop engine', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Set up event listeners for the WebView
     */
    private setupEventListeners(): void {
        if (!this._webView?.rpc) {
            throw new Error('RPC server is not initialized');
        }

        // Register handler for engine events from the WebView using RPC
        // TODO: Make this type safe
        this._webView.rpc.registerHandler('notifyEngineEvent', async (event) => {
            console.log('[GJS Engine] Engine event received from WebView:', event);
            // Handle the event with proper typing
            if (event && typeof event === 'object' && 'type' in event) {
                this.onEngineEventMessage(event as EngineEvent);
                return { success: true };
            }
            return { success: false, error: 'Invalid engine event format' };
        });

        console.log('[GJS Engine] Event listeners set up');
    }

    /**
     * Handler for event messages
     * @param event The engine event
     */
    private onEngineEventMessage(event: EngineEvent): void {
        try {
            if (typeof event === 'object' && 'type' in event) {
                const engineEventType = event.type;
                const engineEventData = event.data;

                // Update the engine status if needed
                if (engineEventType === EngineEventType.STATUS_CHANGED) {
                    this.status = engineEventData as EngineStatus;
                    console.info('[GJS Engine] Engine status changed to:', this.status);
                }

                // Emit a signal that can be caught by the application
                this.emit('message-received', JSON.stringify({
                    type: engineEventType,
                    data: engineEventData
                }));

                // Dispatch the event to registered handlers
                const handlers = this.engineEventHandlers.get(engineEventType);
                if (handlers) {
                    for (const handler of handlers) {
                        try {
                            handler(event);
                        } catch (handlerError) {
                            console.error('[GJS Engine] Error in event handler:', handlerError);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[GJS Engine] Error handling message:', formatError(error instanceof Error ? error : new Error(String(error))));
        }
    }

    /**
     * Set the engine status and dispatch a status changed event
     * @param status New engine status
     */
    private setStatus(status: EngineStatus): void {
        if (!Object.values(EngineStatus).includes(status)) {
            console.warn(`[GJS Engine] Invalid engine status: ${status}`);
            return;
        }

        this.status = status;

        // Dispatch a status changed event
        const statusEvent: EngineEvent<EngineEventType.STATUS_CHANGED> = {
            type: EngineEventType.STATUS_CHANGED,
            data: status
        };

        // Dispatch to local handlers
        const handlers = this.engineEventHandlers.get(EngineEventType.STATUS_CHANGED);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(statusEvent);
                } catch (error) {
                    console.error('[GJS Engine] Error in status event handler:', error);
                }
            }
        }

        // Also send to the WebView using RPC
        try {
            this._webView?.rpc?.sendRequest('notifyStatusChange', {
                status: status
            }).catch(error => console.error('[GJS Engine] Error notifying status change:', error));
        } catch (error) {
            console.error('[GJS Engine] Failed to send status change:', error);
        }
    }

    /**
     * Set resource paths for the engine
     * @param resourcePaths Array of resource paths
     */
    public setResourcePaths(resourcePaths: string[]): void {
        this.resourcePaths = resourcePaths;
        this._webView?.setResourcePaths(resourcePaths);
    }

    /**
     * Set the GResource path for the engine
     * @param gresourcePath GResource path
     */
    public setGResourcePath(gresourcePath: string): void {
        this.gresourcePath = gresourcePath;
        this._webView?.setGResourcePath(gresourcePath);
    }

    /**
     * Add a resource path to the engine
     * @param path Resource path to add
     */
    public addResourcePath(path: string): void {
        if (!this.resourcePaths.includes(path)) {
            this.resourcePaths.push(path);
            this._webView?.addResourcePath(path);
        }
    }

    /**
     * Add an event handler for an engine event
     * @param type Type of event to listen for
     * @param handler Handler function
     */
    addEventListener(type: string, handler: EngineEventHandler): void {
        if (!this.engineEventHandlers.has(type)) {
            this.engineEventHandlers.set(type, new Set());
        }
        this.engineEventHandlers.get(type)!.add(handler);
    }

    /**
     * Remove an event handler for an engine event
     * @param type Type of event to remove handler for
     * @param handler Handler function to remove
     */
    removeEventListener(type: string, handler: EngineEventHandler): void {
        const handlers = this.engineEventHandlers.get(type);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    /**
     * Check if we have event listeners for a given event type
     * @param type Type of event to check for
     */
    hasEventListener(type: string): boolean {
        const handlers = this.engineEventHandlers.get(type);
        return !!handlers && handlers.size > 0;
    }
}

GObject.type_ensure(Engine.$gtype)
import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import { EventDispatcher } from '@pixelrpg/message-channel-core'
import {
    EngineInterface,
    EngineEvent,
    EngineEventType,
    EngineStatus,
    InputEvent,
    ProjectLoadOptions,
    InputEventType,
    EngineCommandType,
    EngineMessageType,
    EngineEventHandler,
    isEngineMessage,
    isEngineEventMessage,
    getEventType,
    getEventData,
    isStatusChangedEvent,
    createInitializationError,
    createRuntimeError,
    createValidationError,
    createResourceError,
    formatError,
} from '@pixelrpg/engine-core'
import { CLIENT_DIR_PATH, CLIENT_RESOURCE_PATH } from '../utils/constants.ts'

import { WebView } from './webview.ts'
import Template from './engine.ui?raw'

/**
 * GJS implementation of the game engine as a GObject widget
 */
export class Engine extends Adw.Bin implements EngineInterface {

    /**
     * WebView for rendering the game
     */
    declare _webView: WebView

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
     * Event dispatcher for engine events
     */
    // public events = new EventDispatcher<EngineEvent>()

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
    constructor() {
        super();

        try {
            this.setStatus(EngineStatus.INITIALIZING);

            // Initialize resource paths
            this._webView.setResourcePaths(this.resourcePaths);
            this._webView.setGResourcePath(this.gresourcePath);

            this._webView.connect('ready', () => {
                console.log('[Engine] WebView ready');

                // Set up event listeners
                this.setupEventListeners();

                this.setStatus(EngineStatus.READY);
                this.emit('ready');
            })
        } catch (error) {
            console.error('Failed to initialize engine:', error);
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
        if (this.status === EngineStatus.INITIALIZING) {
            throw createRuntimeError('Engine not initialized');
        }

        if (!projectPath || projectPath.trim() === '') {
            throw createValidationError('Invalid project path');
        }

        try {
            // Send an RPC request to load the project
            await this._webView.rpcServer?.sendRequest('loadProject', {
                projectPath,
                options
            });

            console.log('[Engine] Project load request sent:', projectPath);
        } catch (error) {
            console.error('[Engine] Failed to load project:', error);
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
            await this._webView.rpcServer?.sendRequest('loadMap', {
                mapId
            });

            console.log('[Engine] Map load request sent:', mapId);
        } catch (error) {
            console.error('[Engine] Failed to load map:', error);
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
            await this._webView.rpcServer?.sendRequest('engineCommand', {
                command: EngineCommandType.START
            });

            console.log('[Engine] Start command sent');
            this.setStatus(EngineStatus.RUNNING);
        } catch (error) {
            console.error('[Engine] Failed to start engine:', error);
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
            await this._webView.rpcServer?.sendRequest('engineCommand', {
                command: EngineCommandType.STOP
            });

            console.log('[Engine] Stop command sent');
        } catch (error) {
            console.error('[Engine] Failed to stop engine:', error);
            throw createRuntimeError('Failed to stop engine', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Send a message to the other side of the engine (WebView)
     * @param messageType Type of message
     * @param payload Payload of the message
     */
    public postMessage<P = any>(messageType: EngineMessageType, payload: P): void {
        try {
            // Map engine message types to RPC methods
            let method: string;
            switch (messageType) {
                case EngineMessageType.ENGINE_EVENT:
                    method = 'handleEngineEvent';
                    break;
                case EngineMessageType.INPUT_EVENT:
                    method = 'handleInputEvent';
                    break;
                case EngineMessageType.COMMAND:
                    method = 'engineCommand';
                    break;
                case EngineMessageType.LOAD_PROJECT:
                    method = 'loadProject';
                    break;
                case EngineMessageType.LOAD_MAP:
                    method = 'loadMap';
                    break;
                default:
                    method = 'handleMessage';
            }

            this._webView.rpcServer?.sendRequest(method, payload)
                .catch(error => console.error(`[Engine] Error sending message (${method}):`, error));

            console.log(`[Engine] Sent message: ${method}`, payload);
        } catch (error) {
            console.error('[Engine] Failed to send message:', error);
        }
    }

    /**
     * Set up event listeners for the WebView
     */
    private setupEventListeners(): void {
        if (!this._webView.rpcServer) {
            throw new Error('RPC server is not initialized');
        }

        // Register a handler for engine messages
        this._webView.rpcServer.events.on((message) => {
            try {
                // Check if this is a valid engine message
                if (isEngineMessage(message)) {
                    console.log('[Engine] Engine message received:', message);

                    // Emit a signal that can be caught by the application
                    this.emit('message-received', JSON.stringify(message));

                    // Handle specific message types
                    if (message.messageType === EngineMessageType.ENGINE_EVENT) {
                        this.onEngineEventMessage(message.payload);
                    }
                    // Add other message type handlers as needed
                }
            } catch (error) {
                console.error('[Engine] Error handling message:', error);
            }
        });

        // Register RPC methods to handle events from the WebView
        this._webView.rpcServer.registerMethod('notifyEngineEvent', async (event) => {
            console.log('[Engine] Engine event received from WebView:', event);
            this.onEngineEventMessage(event as EngineEvent);
            return { success: true };
        });

        console.log('[Engine] Event listeners set up');
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
                    console.info('[Engine] Engine status changed to:', this.status);
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
                            console.error('[Engine] Error in event handler:', handlerError);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Engine] Error handling message:', formatError(error instanceof Error ? error : new Error(String(error))));
        }
    }

    /**
     * Set the engine status and dispatch a status changed event
     * @param status New engine status
     */
    private setStatus(status: EngineStatus): void {
        if (!Object.values(EngineStatus).includes(status)) {
            console.warn(`[Engine] Invalid engine status: ${status}`);
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
                    console.error('[Engine] Error in status event handler:', error);
                }
            }
        }

        // Also send to the WebView using RPC
        try {
            this._webView.rpcServer?.sendRequest('notifyStatusChange', {
                status: status
            }).catch(error => console.error('[Engine] Error notifying status change:', error));
        } catch (error) {
            console.error('[Engine] Failed to send status change:', error);
        }
    }

    /**
     * Set resource paths for the engine
     * @param resourcePaths Array of resource paths
     */
    public setResourcePaths(resourcePaths: string[]): void {
        this.resourcePaths = resourcePaths;
        this._webView.setResourcePaths(resourcePaths);
    }

    /**
     * Set the GResource path for the engine
     * @param gresourcePath GResource path
     */
    public setGResourcePath(gresourcePath: string): void {
        this.gresourcePath = gresourcePath;
        this._webView.setGResourcePath(gresourcePath);
    }

    /**
     * Add a resource path to the engine
     * @param path Resource path to add
     */
    public addResourcePath(path: string): void {
        if (!this.resourcePaths.includes(path)) {
            this.resourcePaths.push(path);
            this._webView.addResourcePath(path);
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
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
    public events = new EventDispatcher<EngineEvent>()

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
            // Send a message to the WebView to load the project
            this._webView.messageChannel?.postMessage(
                EngineMessageType.LOAD_PROJECT,
                { projectPath, options }
            );
        } catch (error) {
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
            // Send a message to the WebView to load the map
            this._webView.messageChannel?.postMessage(
                EngineMessageType.LOAD_MAP,
                { mapId }
            );
        } catch (error) {
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
            // Send a command to the WebView to start the engine
            this._webView.messageChannel?.postMessage(
                EngineMessageType.COMMAND,
                { command: EngineCommandType.START }
            );

            this.setStatus(EngineStatus.RUNNING);
        } catch (error) {
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
            // Send a command to the WebView to stop the engine
            this._webView.messageChannel?.postMessage(
                EngineMessageType.COMMAND,
                { command: EngineCommandType.STOP }
            );
        } catch (error) {
            throw createRuntimeError('Failed to stop engine', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Send a message to the other side of the engine (WebView)
     * @param messageType Type of message
     * @param payload Payload of the message
     */
    public postMessage<P = any>(messageType: EngineMessageType, payload: P): void {
        this._webView.messageChannel?.postMessage(messageType, payload);
    }

    /**
     * Set up event listeners for the WebView
     */
    private setupEventListeners(): void {

        if (!this._webView.messageChannel) {
            throw new Error('Messages service is not initialized');
        }

        // Listen for text messages from the WebView
        this._webView.messageChannel.onmessage = (event) => {
            if (!isEngineMessage(event.data)) {
                console.error('[Engine] Unhandled message type (not an engine message):', event.data);
                return;
            }

            console.log('[Engine] Engine message received:', event.data);

            const { messageType, payload } = event.data;

            // Emit a signal that can be caught by the application
            this.emit('message-received', JSON.stringify(event.data));

            switch (messageType) {
                case EngineMessageType.ENGINE_EVENT:
                    this.onEngineEventMessage(payload);
                    break;
                // Add other message type handlers as needed
            }
        };
    }

    /**
     * Handler for event messages
     * @param event The engine event
     */
    private onEngineEventMessage(event: EngineEvent): void {
        try {
            if (isEngineEventMessage(event)) {
                const engineEventType = getEventType(event);
                const engineEventData = getEventData(event);

                if (engineEventData && typeof engineEventData === 'object' && 'type' in engineEventData) {
                    const engineEvent: EngineEvent = {
                        type: engineEventType,
                        data: engineEventData
                    };

                    // Update the engine status if needed
                    if (isStatusChangedEvent(engineEvent)) {
                        this.status = engineEvent.data as EngineStatus;
                        console.info('[Engine] Engine status changed to:', this.status);
                    }

                    // Dispatch the event
                    if (Object.values(EngineEventType).includes(engineEvent.type)) {
                        this.events.dispatch(engineEvent.type, engineEvent);
                    } else {
                        console.warn(`[Engine] Unknown engine event type: ${engineEvent.type}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error handling message:', formatError(error instanceof Error ? error : new Error(String(error))));
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

        this.events.dispatch(EngineEventType.STATUS_CHANGED, statusEvent);
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
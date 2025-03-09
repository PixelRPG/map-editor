import { EventDispatcher } from '@pixelrpg/messages-core'
import {
    EngineInterface,
    EngineEvent,
    EngineEventType,
    EngineStatus,
    InputEvent,
    ProjectLoadOptions,
    InputEventType,
    createEngineMessages,
    parseEngineMessages,
    EngineCommandType,
    EngineTypeGuards
} from '@pixelrpg/engine-core'
import { MessagesService } from '@pixelrpg/messages-gjs'

import { WebView } from '../widgets/webview.ts'
import { ResourceManager } from './resource-manager.ts'

/**
 * GJS implementation of the game engine
 */
export class GjsEngine implements EngineInterface {
    /**
     * Current status of the engine
     */
    public status: EngineStatus = EngineStatus.INITIALIZING

    /**
     * Event dispatcher for engine events
     */
    public events = new EventDispatcher<EngineEvent>()

    /**
     * WebView for rendering the game
     */
    private webView: WebView | null = null

    /**
     * Resource manager for handling internal resources
     */
    private resourceManager: ResourceManager

    /**
     * Create a new GJS engine
     * @param resourcePaths Paths to search for resources
     * @param gresourcePath Optional path prefix for GResource lookups
     */
    constructor(
        resourcePaths: string[] = [],
        private gresourcePath: string = '/org/pixelrpg/maker/engine-excalibur'
    ) {
        this.resourceManager = new ResourceManager(resourcePaths, gresourcePath)
    }

    /**
     * Initialize the engine
     */
    async initialize(): Promise<void> {
        this.setStatus(EngineStatus.INITIALIZING)

        try {
            console.log("Initializing GjsEngine");

            // Create the WebView with explicit size and visibility properties
            this.webView = new WebView({}, this.resourceManager);

            console.log("WebView created in GjsEngine");

            // Set up message handlers
            this.setupMessageHandlers()

            this.setStatus(EngineStatus.READY)
            console.log("GjsEngine initialized successfully");
        } catch (error) {
            console.error('Failed to initialize engine:', error)
            this.setStatus(EngineStatus.ERROR)
            throw error
        }
    }

    /**
     * Load a game project
     * @param projectPath Path to the game project file
     * @param options Options for loading the project
     */
    async loadProject(projectPath: string, options?: ProjectLoadOptions): Promise<void> {
        if (!this.webView) {
            throw new Error('Engine not initialized')
        }

        this.setStatus(EngineStatus.LOADING)

        // Send a message to the WebView to load the project
        this.webView.messagesService.send(
            createEngineMessages.loadProject(projectPath, options)
        );

        // The status will be updated when we receive a response from the WebView
    }

    /**
     * Load a specific map
     * @param mapId ID of the map to load
     */
    async loadMap(mapId: string): Promise<void> {
        if (!this.webView) {
            throw new Error('Engine not initialized')
        }

        // Send a message to the WebView to load the map
        this.webView.messagesService.send(
            createEngineMessages.loadMap(mapId)
        );
    }

    /**
     * Start the engine
     */
    async start(): Promise<void> {
        if (!this.webView) {
            throw new Error('Engine not initialized')
        }

        // Send a command to the WebView to start the engine
        this.webView.messagesService.send(
            createEngineMessages.command(EngineCommandType.START)
        );

        this.setStatus(EngineStatus.RUNNING)
    }

    /**
     * Stop the engine
     */
    async stop(): Promise<void> {
        if (!this.webView) {
            throw new Error('Engine not initialized')
        }

        // Send a command to the WebView to stop the engine
        this.webView.messagesService.send(
            createEngineMessages.command(EngineCommandType.STOP)
        );
    }

    /**
     * Pause the engine
     */
    pause(): void {
        if (!this.webView) {
            throw new Error('Engine not initialized')
        }

        // Send a command to the WebView to pause the engine
        this.webView.messagesService.send(
            createEngineMessages.command(EngineCommandType.PAUSE)
        );
    }

    /**
     * Resume the engine
     */
    resume(): void {
        if (!this.webView) {
            throw new Error('Engine not initialized')
        }

        // Send a command to the WebView to resume the engine
        this.webView.messagesService.send(
            createEngineMessages.command(EngineCommandType.RESUME)
        );
    }

    /**
     * Handle input events
     * @param event Input event
     */
    handleInput(event: InputEvent): void {
        if (!this.webView) {
            return
        }

        // Send the input event to the WebView
        this.webView.messagesService.send(
            createEngineMessages.inputEvent(event)
        );
    }

    /**
     * Get the WebView widget
     * @returns The WebView widget
     */
    getWebView(): WebView | null {
        return this.webView
    }

    /**
     * Set up message handlers for communication with the WebView
     */
    private setupMessageHandlers(): void {
        if (!this.webView) {
            return
        }

        // Use onGenericMessage to handle engine events
        this.webView.messagesService.on('event', (message) => {
            if (parseEngineMessages.isEngineEventMessage(message)) {
                const engineEventData = parseEngineMessages.getEventData(message);

                if (engineEventData && 'type' in engineEventData) {
                    const engineEvent: EngineEvent = {
                        type: engineEventData.type,
                        data: engineEventData.data
                    };

                    // Update the engine status if needed
                    if (EngineTypeGuards.isStatusChangedEvent(engineEvent)) {
                        // We know data is defined and is EngineStatus because of the type guard
                        this.status = engineEvent.data!;
                    }

                    // Dispatch the event
                    this.events.dispatch(engineEvent.type, engineEvent);
                }
            }
        });
    }

    /**
     * Set the engine status and dispatch a status changed event
     * @param status New engine status
     */
    private setStatus(status: EngineStatus): void {
        this.status = status

        const event: EngineEvent<EngineEventType.STATUS_CHANGED> = {
            type: EngineEventType.STATUS_CHANGED,
            data: status
        }

        this.events.dispatch(event.type, event)
    }
} 
import { EventDispatcher, MessageGeneric } from '@pixelrpg/messages-core'
import {
    EngineInterface,
    EngineEvent,
    EngineEventType,
    EngineStatus,
    InputEvent,
    ProjectLoadOptions,
    InputEventType,
    EngineMessageEventEngine,
    EngineMessageEventInput,
    EngineMessageEvent,
    EngineMessageType,
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
        this.webView.messagesService.send({
            type: 'event',
            data: {
                name: EngineMessageType.LOAD_PROJECT,
                data: {
                    projectPath,
                    options
                }
            }
        })

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
        this.webView.messagesService.send({
            type: 'event',
            data: {
                name: EngineMessageType.LOAD_MAP,
                data: {
                    mapId
                }
            }
        })
    }

    /**
     * Start the engine
     */
    async start(): Promise<void> {
        if (!this.webView) {
            throw new Error('Engine not initialized')
        }

        // Send a command to the WebView to start the engine
        this.webView.messagesService.send({
            type: 'event',
            data: {
                name: EngineMessageType.COMMAND,
                data: {
                    command: 'start'
                }
            }
        })

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
        this.webView.messagesService.send({
            type: 'event',
            data: {
                name: EngineMessageType.COMMAND,
                data: {
                    command: 'stop'
                }
            }
        })
    }

    /**
     * Pause the engine
     */
    pause(): void {
        if (!this.webView) {
            throw new Error('Engine not initialized')
        }

        // Send a command to the WebView to pause the engine
        this.webView.messagesService.send({
            type: 'event',
            data: {
                name: EngineMessageType.COMMAND,
                data: {
                    command: 'pause'
                }
            }
        })
    }

    /**
     * Resume the engine
     */
    resume(): void {
        if (!this.webView) {
            throw new Error('Engine not initialized')
        }

        // Send a command to the WebView to resume the engine
        this.webView.messagesService.send({
            type: 'event',
            data: {
                name: EngineMessageType.COMMAND,
                data: {
                    command: 'resume'
                }
            }
        })
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
        this.webView.messagesService.send({
            type: 'event',
            data: {
                name: EngineMessageType.INPUT_EVENT,
                data: event
            }
        })
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
            // Check if this is an engine event
            if (message.data && typeof message.data === 'object' && 'name' in message.data) {
                const eventData = message.data as EngineMessageEvent['data'];

                if (eventData.name === 'engine-event' && eventData.data) {
                    const engineEventData = eventData.data as EngineEvent;

                    if (engineEventData.type) {
                        const engineEvent: EngineEvent = {
                            type: engineEventData.type,
                            data: engineEventData.data
                        };

                        // Update the engine status if needed
                        if (engineEvent.type === EngineEventType.STATUS_CHANGED && engineEvent.data) {
                            this.status = engineEvent.data as EngineStatus;
                        }

                        // Dispatch the event
                        this.events.dispatch(engineEvent.type, engineEvent);
                    }
                }
            }
        });
    }

    /**
     * Set the engine status and dispatch an event
     * @param status The new status
     */
    private setStatus(status: EngineStatus): void {
        this.status = status

        this.events.dispatch(EngineEventType.STATUS_CHANGED, {
            type: EngineEventType.STATUS_CHANGED,
            data: status
        })
    }

    /**
     * Convert a mouse event from the WebView to an input event
     * @param name The event name
     * @param data The event data
     * @returns An input event
     */
    private convertMouseEvent(name: string, data: Record<string, unknown>): InputEvent | null {
        let type: InputEventType | null = null

        switch (name) {
            case 'mouse-move':
                type = InputEventType.MOUSE_MOVE
                break
            case 'mouse-down':
                type = InputEventType.MOUSE_DOWN
                break
            case 'mouse-up':
                type = InputEventType.MOUSE_UP
                break
            case 'mouse-enter':
                type = InputEventType.MOUSE_ENTER
                break
            case 'mouse-leave':
                type = InputEventType.MOUSE_LEAVE
                break
            default:
                return null
        }

        return {
            type,
            data: {
                position: {
                    x: typeof data.x === 'number' ? data.x : 0,
                    y: typeof data.y === 'number' ? data.y : 0
                },
                button: typeof data.button === 'number' ? data.button : undefined
            }
        }
    }
} 
import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { EventDispatcher } from '@pixelrpg/messages-core'
import {
    EngineInterface,
    EngineEvent,
    EngineEventType,
    EngineStatus,
    InputEvent,
    ProjectLoadOptions,
    InputEventType,
    engineMessagesService,
    engineMessageParserService,
    EngineCommandType,
    EngineError,
    errorService,
    engineTypeGuardsService
} from '@pixelrpg/engine-core'
import { CLIENT_DIR_PATH, CLIENT_RESOURCE_PATH } from '../utils/constants.ts'

import { WebView } from './webview.ts'
import Template from './engine.ui?raw'

/**
 * GJS implementation of the game engine as a GObject widget
 */
export class GjsEngine extends Adw.Bin implements EngineInterface {
    static {
        GObject.registerClass({
            GTypeName: 'GjsEngine',
            Template,
            Signals: {
                'message-received': { param_types: [GObject.TYPE_STRING] },
            },
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
     * WebView for rendering the game
     */
    private webView: WebView = new WebView({});

    /**
     * Create a new GJS engine
     */
    constructor() {
        super();

        try {
            this.setStatus(EngineStatus.INITIALIZING);

            // Add the WebView to this container
            this.set_child(this.webView);

            // Set up message handlers
            this.setupMessageHandlers();

            // Ensure the WebView is shown
            this.show();
            this.webView.show();

            this.setStatus(EngineStatus.READY);
        } catch (error) {
            console.error('Failed to initialize engine:', error);
            this.setStatus(EngineStatus.ERROR);
            throw errorService.createInitializationError('Failed to initialize GJS engine', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Initialize the engine
     */
    public async initialize(): Promise<void> {
        this.webView.reload();
    }

    /**
     * Load a project
     */
    public async loadProject(projectPath: string, options?: ProjectLoadOptions): Promise<void> {
        if (this.status === EngineStatus.INITIALIZING) {
            throw errorService.createRuntimeError('Engine not initialized');
        }

        if (!projectPath || projectPath.trim() === '') {
            throw errorService.createValidationError('Invalid project path');
        }

        try {
            // Send a message to the WebView to load the project
            this.webView.messagesService.send(
                engineMessagesService.loadProject(projectPath, options)
            );
        } catch (error) {
            throw errorService.createResourceError(`Failed to load project: ${projectPath}`, error instanceof Error ? error : undefined);
        }
    }

    /**
     * Load a map
     */
    public async loadMap(mapId: string): Promise<void> {
        if (this.status === EngineStatus.INITIALIZING) {
            throw errorService.createRuntimeError('Engine not initialized');
        }

        if (!mapId || mapId.trim() === '') {
            throw errorService.createValidationError('Invalid map ID');
        }

        try {
            // Send a message to the WebView to load the map
            this.webView.messagesService.send(
                engineMessagesService.loadMap(mapId)
            );
        } catch (error) {
            throw errorService.createResourceError(`Failed to load map: ${mapId}`, error instanceof Error ? error : undefined);
        }
    }

    /**
     * Start the engine
     */
    public async start(): Promise<void> {
        if (this.status === EngineStatus.INITIALIZING) {
            throw errorService.createRuntimeError('Engine not initialized');
        }

        try {
            // Send a command to the WebView to start the engine
            this.webView.messagesService.send(
                engineMessagesService.command(EngineCommandType.START)
            );

            this.setStatus(EngineStatus.RUNNING);
        } catch (error) {
            throw errorService.createRuntimeError('Failed to start engine', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Stop the engine
     */
    public async stop(): Promise<void> {
        if (this.status === EngineStatus.INITIALIZING) {
            throw errorService.createRuntimeError('Engine not initialized');
        }

        try {
            // Send a command to the WebView to stop the engine
            this.webView.messagesService.send(
                engineMessagesService.command(EngineCommandType.STOP)
            );
        } catch (error) {
            throw errorService.createRuntimeError('Failed to stop engine', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Pause the engine
     */
    public async pause(): Promise<void> {
        if (this.status === EngineStatus.INITIALIZING) {
            throw errorService.createRuntimeError('Engine not initialized');
        }

        try {
            // Send a command to the WebView to pause the engine
            this.webView.messagesService.send(
                engineMessagesService.command(EngineCommandType.PAUSE)
            );
        } catch (error) {
            throw errorService.createRuntimeError('Failed to pause engine', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Resume the engine
     */
    public async resume(): Promise<void> {
        if (this.status === EngineStatus.INITIALIZING) {
            throw errorService.createRuntimeError('Engine not initialized');
        }

        try {
            // Send a command to the WebView to resume the engine
            this.webView.messagesService.send(
                engineMessagesService.command(EngineCommandType.RESUME)
            );
        } catch (error) {
            throw errorService.createRuntimeError('Failed to resume engine', error instanceof Error ? error : undefined);
        }
    }

    /**
     * Handle input events
     * @param event Input event
     */
    public handleInput(event: InputEvent): void {
        if (!event || !event.type || !Object.values(InputEventType).includes(event.type)) {
            console.warn('Invalid input event:', event);
            return;
        }

        try {
            // Send the input event to the WebView
            this.webView.messagesService.send(
                engineMessagesService.inputEvent(event)
            );
        } catch (error) {
            console.error('Failed to handle input event:', errorService.formatError(error instanceof Error ? error : new Error(String(error))));
        }
    }

    /**
     * Send a message to the engine
     * @param message The message to send
     */
    public sendMessage(message: any) {
        this.webView.messagesService.send(message);
    }

    /**
     * Set up message handlers for the WebView
     */
    private setupMessageHandlers(): void {
        // Handle text messages from the WebView
        this.webView.messagesService.on('text', (message) => {
            console.log('Message from WebView:', message);

            // Emit a signal that can be caught by the application
            this.emit('message-received', JSON.stringify(message));
        });

        // Use onGenericMessage to handle engine events
        this.webView.messagesService.on('event', (message) => {
            try {
                if (engineMessageParserService.isEngineEventMessage(message)) {
                    const engineEventData = engineMessageParserService.getEventData(message);

                    if (engineEventData && typeof engineEventData === 'object' && 'type' in engineEventData) {
                        const engineEvent: EngineEvent = {
                            type: engineEventData.type,
                            data: engineEventData.data
                        };

                        // Update the engine status if needed
                        if (engineTypeGuardsService.isStatusChangedEvent(engineEvent)) {
                            this.status = engineEvent.data as EngineStatus;
                        }

                        // Dispatch the event
                        if (Object.values(EngineEventType).includes(engineEvent.type)) {
                            this.events.dispatch(engineEvent.type, engineEvent);
                        } else {
                            console.warn(`Unknown engine event type: ${engineEvent.type}`);
                        }
                    }
                }
            } catch (error) {
                console.error('Error handling message:', errorService.formatError(error instanceof Error ? error : new Error(String(error))));
            }
        });
    }

    /**
     * Set the engine status and dispatch a status changed event
     * @param status New engine status
     */
    private setStatus(status: EngineStatus): void {
        if (!Object.values(EngineStatus).includes(status)) {
            console.warn(`Invalid engine status: ${status}`);
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
} 
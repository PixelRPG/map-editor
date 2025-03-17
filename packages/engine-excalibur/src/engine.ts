import { Engine as ExcaliburEngine, DisplayMode, Loader, Color, Logger, Scene, Clock } from 'excalibur'
import { EventDispatcher } from '@pixelrpg/message-channel-core'
import { RpcEndpoint } from '@pixelrpg/message-channel-web'
import {
    EngineInterface,
    EngineEvent,
    EngineEventType,
    EngineStatus,
    ProjectLoadOptions,
    EngineCommandType,
} from '@pixelrpg/engine-core'
import { GameProjectResource } from '@pixelrpg/data-excalibur'

import { EditorInputSystem } from './systems/editor-input.system.ts'

/**
 * Excalibur implementation of the game engine
 */
export class Engine implements EngineInterface {
    /**
     * Current status of the engine
     */
    public status: EngineStatus = EngineStatus.INITIALIZING

    /**
     * Event dispatcher for engine events
     */
    public events = new EventDispatcher<EngineEvent>()

    /**
     * Excalibur engine instance
     */
    private excalibur: ExcaliburEngine | null = null

    /**
     * Current game project resource
     */
    private gameProjectResource: GameProjectResource | null = null

    /**
     * Logger instance
     */
    private logger = Logger.getInstance()

    /**
     * Message handler name used in the messages service
     */
    private messageHandlerName = 'pixelrpg'
    private rpc = RpcEndpoint.getInstance(this.messageHandlerName)


    /**
     * Create a new Excalibur engine
     * @param canvasElementId ID of the canvas element
     */
    constructor(private canvasElementId: string = 'engine-view') {
        this.logger.info('Creating Engine')

        // Register RPC handlers for GJS to call
        this.registerRpcHandlers()
    }

    /**
     * Register RPC handlers for the GJS side to call
     */
    private registerRpcHandlers(): void {
        this.logger.info('Registering RPC handlers');

        // Register loadProject handler
        this.rpc.registerHandler('loadProject', async (params) => {
            this.logger.info('RPC call: loadProject', params);
            try {
                // Type guard for project load parameters
                if (!params || typeof params !== 'object') {
                    throw new Error('Invalid parameters');
                }

                const typedParams = params as { projectPath: string; options?: unknown };
                if (!typedParams.projectPath) {
                    throw new Error('Project path is required');
                }

                await this.loadProject(typedParams.projectPath, typedParams.options);
                return { success: true };
            } catch (error) {
                this.logger.error('Error loading project:', error);
                throw error;
            }
        });

        // Register loadMap handler
        this.rpc.registerHandler('loadMap', async (params) => {
            this.logger.info('RPC call: loadMap', params);
            try {
                // Type guard for map load parameters
                if (!params || typeof params !== 'object') {
                    throw new Error('Invalid parameters');
                }

                const typedParams = params as { mapId: string };
                if (!typedParams.mapId) {
                    throw new Error('Map ID is required');
                }

                await this.loadMap(typedParams.mapId);
                return { success: true };
            } catch (error) {
                this.logger.error('Error loading map:', error);
                throw error;
            }
        });

        // Register engineCommand handler
        this.rpc.registerHandler('engineCommand', async (params) => {
            this.logger.info('RPC call: engineCommand', params);
            try {
                // Type guard for command parameters
                if (!params || typeof params !== 'object') {
                    throw new Error('Invalid parameters');
                }

                const typedParams = params as { command: EngineCommandType };
                if (!typedParams.command) {
                    throw new Error('Command is required');
                }

                switch (typedParams.command) {
                    case EngineCommandType.START:
                        await this.start();
                        break;
                    case EngineCommandType.STOP:
                        await this.stop();
                        break;
                    default:
                        throw new Error(`Unknown command: ${typedParams.command}`);
                }

                return { success: true };
            } catch (error) {
                this.logger.error('Error executing command:', error);
                throw error;
            }
        });

        // Register notifyStatusChange handler
        this.rpc.registerHandler('notifyStatusChange', (params) => {
            this.logger.info('RPC call: notifyStatusChange', params);
            try {
                // Type guard for status parameters
                if (!params || typeof params !== 'object') {
                    throw new Error('Invalid parameters');
                }

                const typedParams = params as { status: EngineStatus };
                if (!typedParams.status) {
                    throw new Error('Status is required');
                }

                this.setStatus(typedParams.status);
                return { success: true };
            } catch (error) {
                this.logger.error('Error changing status:', error);
                throw error;
            }
        });

        this.logger.info('RPC handlers registered');
    }

    /**
     * Initialize the engine
     */
    async initialize(): Promise<void> {
        this.setStatus(EngineStatus.INITIALIZING)

        // Create the Excalibur engine
        this.excalibur = new ExcaliburEngine({
            canvasElementId: this.canvasElementId,
            displayMode: DisplayMode.FillScreen,
            pixelArt: true,
            suppressPlayButton: true,
            backgroundColor: Color.Black, // TODO: Change this based on the OS light/dark mode
            enableCanvasTransparency: true,
            enableCanvasContextMenu: true, // Enable the right click context menu for debugging
        })

        // Add the editor input system
        this.excalibur.currentScene.world.add(EditorInputSystem)

        this.setStatus(EngineStatus.READY)
    }

    /**
     * Load a game project
     * @param projectPath Path to the game project file
     * @param options Options for loading the project
     */
    async loadProject(projectPath: string, options?: ProjectLoadOptions): Promise<void> {
        if (!this.excalibur) {
            throw new Error('Engine not initialized')
        }

        this.setStatus(EngineStatus.LOADING)

        this.logger.info(`[Engine] Loading project: ${projectPath}`)

        // Create the game project resource
        this.gameProjectResource = new GameProjectResource(projectPath, {
            preloadAllSpriteSets: options?.preloadAllSpriteSets ?? true,
            preloadAllMaps: options?.preloadAllMaps ?? false,
        })

        // Create a loader with the game project resource
        const loader = new Loader([this.gameProjectResource])

        // Set up loader events
        loader.on('progress', (event: { progress?: number }) => {
            if (event && typeof event.progress === 'number') {
                this.logger.debug(`Loading progress: ${Math.round(event.progress * 100)}%`)
            }
        })

        loader.on('error', (error) => {
            this.logger.error('Loader error:', error)
            this.setStatus(EngineStatus.ERROR)

            // this.events.dispatch(EngineEventType.ERROR, {
            //     type: EngineEventType.ERROR,
            //     data: { message: 'Loader error', error: error instanceof Error ? error : new Error(String(error)) }
            // })
        })

        loader.on('complete', () => {
            this.logger.info('Loading complete')
        })

        loader.on('afterload', async () => {
            this.logger.info('GameProjectResource loaded successfully')

            // Debug the game project
            this.gameProjectResource?.debugInfo()

            // Add the active map to the scene
            if (this.gameProjectResource?.activeMap) {
                this.gameProjectResource.addToScene(this.excalibur!.currentScene)
                this.logger.info(`Map ${this.gameProjectResource.activeMap.mapData.name} added to scene`)

                // this.events.dispatch(EngineEventType.MAP_LOADED, {
                //     type: EngineEventType.MAP_LOADED,
                //     data: { mapId: this.gameProjectResource.activeMap.mapData.id }
                // })
            }

            // Access the project data
            // The property might be named 'project' or 'projectData' depending on the implementation
            const projectData = this.gameProjectResource.data

            // this.events.dispatch(EngineEventType.PROJECT_LOADED, {
            //     type: EngineEventType.PROJECT_LOADED,
            //     data: { projectId: projectData.id || 'unknown' }
            // })

            this.setStatus(EngineStatus.READY)
        })

        // Start the engine with the loader
        await this.excalibur.start(loader)
    }

    /**
     * Load a specific map
     * @param mapId ID of the map to load
     */
    async loadMap(mapId: string): Promise<void> {
        if (!this.excalibur || !this.gameProjectResource) {
            throw new Error('Engine not initialized or project not loaded')
        }

        this.logger.info(`Loading map: ${mapId}`)

        // Create a new scene
        const newScene = new Scene()
        newScene.world.add(EditorInputSystem)
        this.excalibur.addScene('map', newScene)
        this.excalibur.goToScene('map')

        // Try to load the map
        if (this.gameProjectResource) {
            try {
                // First try to use the changeMap method
                await this.gameProjectResource.changeMap(mapId);
            } catch (error) {
                this.logger.error('Error changing map:', error);
                // If there's a setActiveMap method, use it
                // Property 'setActiveMap' does not exist on type 'GameProjectResource'. Use 'changeMap' instead.
                await this.gameProjectResource.changeMap(mapId);
            }
        }

        // Add the map to the scene
        if (this.gameProjectResource.activeMap) {
            this.gameProjectResource.addToScene(this.excalibur.currentScene)
            this.logger.info(`Map ${this.gameProjectResource.activeMap.mapData.name} added to scene`)

            // this.events.dispatch(EngineEventType.MAP_LOADED, {
            //     type: EngineEventType.MAP_LOADED,
            //     data: { mapId: this.gameProjectResource.activeMap.mapData.id }
            // })
        }
    }

    /**
     * Start the engine
     */
    async start(): Promise<void> {
        if (!this.excalibur) {
            throw new Error('Engine not initialized')
        }
        this.excalibur.start()
        this.setStatus(EngineStatus.RUNNING)
    }

    /**
     * Stop the engine
     */
    async stop(): Promise<void> {
        if (!this.excalibur) {
            throw new Error('Engine not initialized')
        }

        this.excalibur.stop()
        this.setStatus(EngineStatus.READY)
    }

    /**
     * Set the engine status and dispatch a status changed event
     * @param status New engine status
     */
    private setStatus(status: EngineStatus): void {
        if (this.status !== status) {
            this.logger.info(`Engine status changed from ${this.status} to ${status}`)

            // Update the status
            this.status = status

            // Create an event
            const event: EngineEvent = {
                type: EngineEventType.STATUS_CHANGED,
                data: status
            }

            // Dispatch the event locally
            // this.events.dispatch(event.type, event)

            // Send the event to GJS using RPC
            this.rpc.sendRequest('notifyEngineEvent', event)
                .catch(error => {
                    this.logger.error('Error notifying status change:', error);
                });
        }
    }
} 
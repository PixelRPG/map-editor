import { Engine, DisplayMode, Loader, Color, Logger, Scene, Clock } from 'excalibur'
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
    EngineMessageType
} from '@pixelrpg/engine-core'
import { GameProjectResource } from '@pixelrpg/data-excalibur'

import { messagesService } from './messages.service.ts'
import { EditorInputSystem } from '../systems/editor-input.system.ts'

// Define a type for the Excalibur engine with the methods we need
type ExcaliburEngineType = Engine & {
    clock: Clock & {
        pause(): void;
        unpause(): void;
    }
};

/**
 * Excalibur implementation of the game engine
 */
export class ExcaliburEngine implements EngineInterface {
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
    private engine: Engine | null = null

    /**
     * Current game project resource
     */
    private gameProjectResource: GameProjectResource | null = null

    /**
     * Logger instance
     */
    private logger = Logger.getInstance()

    /**
     * Create a new Excalibur engine
     * @param canvasElementId ID of the canvas element
     */
    constructor(private canvasElementId: string = 'map-view') {
        // Enable debug logging in the browser console
        console.debug = console.log
        this.logger.info('Creating ExcaliburEngine')
    }

    /**
     * Initialize the engine
     */
    async initialize(): Promise<void> {
        this.setStatus(EngineStatus.INITIALIZING)

        // Create the Excalibur engine
        this.engine = new Engine({
            canvasElementId: this.canvasElementId,
            displayMode: DisplayMode.FillScreen,
            pixelArt: true,
            suppressPlayButton: true,
            backgroundColor: Color.Transparent,
            enableCanvasTransparency: true,
            enableCanvasContextMenu: true, // Enable the right click context menu for debugging
        })

        // Add the editor input system
        this.engine.currentScene.world.add(EditorInputSystem)

        this.setStatus(EngineStatus.READY)

        // Send a message to GJS
        messagesService.send({
            type: 'text',
            data: 'Excalibur engine initialized',
        })
    }

    /**
     * Load a game project
     * @param projectPath Path to the game project file
     * @param options Options for loading the project
     */
    async loadProject(projectPath: string, options?: ProjectLoadOptions): Promise<void> {
        if (!this.engine) {
            throw new Error('Engine not initialized')
        }

        this.setStatus(EngineStatus.LOADING)

        this.logger.info(`Loading project: ${projectPath}`)

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

            this.events.dispatch(EngineEventType.ERROR, {
                type: EngineEventType.ERROR,
                data: { message: 'Loader error', error: error instanceof Error ? error : new Error(String(error)) }
            })
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
                this.gameProjectResource.addToScene(this.engine!.currentScene)
                this.logger.info(`Map ${this.gameProjectResource.activeMap.mapData.name} added to scene`)

                this.events.dispatch(EngineEventType.MAP_LOADED, {
                    type: EngineEventType.MAP_LOADED,
                    data: { mapId: this.gameProjectResource.activeMap.mapData.id }
                })
            }

            // Access the project data
            // The property might be named 'project' or 'projectData' depending on the implementation
            const projectData = this.gameProjectResource.data

            this.events.dispatch(EngineEventType.PROJECT_LOADED, {
                type: EngineEventType.PROJECT_LOADED,
                data: { projectId: projectData.id || 'unknown' }
            })

            this.setStatus(EngineStatus.READY)
        })

        // Start the engine with the loader
        await this.engine.start(loader)
    }

    /**
     * Load a specific map
     * @param mapId ID of the map to load
     */
    async loadMap(mapId: string): Promise<void> {
        if (!this.engine || !this.gameProjectResource) {
            throw new Error('Engine not initialized or project not loaded')
        }

        this.logger.info(`Loading map: ${mapId}`)

        // Create a new scene
        const newScene = new Scene()
        newScene.world.add(EditorInputSystem)
        this.engine.addScene('map', newScene)
        this.engine.goToScene('map')

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
            this.gameProjectResource.addToScene(this.engine.currentScene)
            this.logger.info(`Map ${this.gameProjectResource.activeMap.mapData.name} added to scene`)

            this.events.dispatch(EngineEventType.MAP_LOADED, {
                type: EngineEventType.MAP_LOADED,
                data: { mapId: this.gameProjectResource.activeMap.mapData.id }
            })
        }
    }

    /**
     * Start the engine
     */
    async start(): Promise<void> {
        if (!this.engine) {
            throw new Error('Engine not initialized')
        }

        this.setStatus(EngineStatus.RUNNING)
    }

    /**
     * Stop the engine
     */
    async stop(): Promise<void> {
        if (!this.engine) {
            throw new Error('Engine not initialized')
        }

        await this.engine.stop()
        this.setStatus(EngineStatus.READY)
    }

    /**
     * Pause the engine
     */
    pause(): void {
        if (!this.engine) {
            throw new Error('Engine not initialized')
        }

        // Use the clock to pause the engine if available
        const engineWithClock = this.engine as ExcaliburEngineType
        if (engineWithClock.clock && typeof engineWithClock.clock.pause === 'function') {
            engineWithClock.clock.pause()
        }
    }

    /**
     * Resume the engine
     */
    resume(): void {
        if (!this.engine) {
            throw new Error('Engine not initialized')
        }

        // Use the clock to unpause the engine if available
        const engineWithClock = this.engine as ExcaliburEngineType
        if (engineWithClock.clock && typeof engineWithClock.clock.unpause === 'function') {
            engineWithClock.clock.unpause()
        }
    }

    /**
     * Handle input events
     */
    handleInput(event: InputEvent): void {
        // Not implemented for Excalibur engine
        // Input is handled by the EditorInputSystem
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

        // Send a message to GJS
        messagesService.send(
            engineMessagesService.engineEvent(event)
        )
    }
} 
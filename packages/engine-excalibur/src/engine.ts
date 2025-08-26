import {
  Engine as ExcaliburEngine,
  DisplayMode,
  Loader,
  Color,
  Logger,
  Scene,
  Clock,
} from 'excalibur'
import { EventDispatcher } from '@pixelrpg/message-channel-core'
import { rpcEndpointFactory } from './utils/rpc.ts'
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

  private rpc = rpcEndpointFactory()

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
    this.logger.info('Registering RPC handlers')

    // Register loadProject handler
    // TODO: Make this type safe
    this.rpc.registerHandler('loadProject', async (params) => {
      this.logger.info('RPC call: loadProject', params)
      try {
        // Type guard for project load parameters
        if (!params || typeof params !== 'object') {
          throw new Error('Invalid parameters')
        }

        const typedParams = params as { projectPath: string; options?: unknown }
        if (!typedParams.projectPath) {
          throw new Error('Project path is required')
        }

        await this.loadProject(typedParams.projectPath, typedParams.options)
        return { success: true }
      } catch (error) {
        this.logger.error('Error loading project:', error)
        throw error
      }
    })

    // Register loadMap handler
    // TODO: Make this type safe
    this.rpc.registerHandler('loadMap', async (params) => {
      this.logger.info('RPC call: loadMap', params)
      try {
        // Type guard for map load parameters
        if (!params || typeof params !== 'object') {
          throw new Error('Invalid parameters')
        }

        const typedParams = params as { mapId: string }
        if (!typedParams.mapId) {
          throw new Error('Map ID is required')
        }

        await this.loadMap(typedParams.mapId)
        return { success: true }
      } catch (error) {
        this.logger.error('Error loading map:', error)
        throw error
      }
    })

    // Register engineCommand handler
    // TODO: Make this type safe
    this.rpc.registerHandler('engineCommand', async (params) => {
      this.logger.info('RPC call: engineCommand', params)
      try {
        // Type guard for command parameters
        if (!params || typeof params !== 'object') {
          throw new Error('Invalid parameters')
        }

        const typedParams = params as { command: EngineCommandType }
        if (!typedParams.command) {
          throw new Error('Command is required')
        }

        switch (typedParams.command) {
          case EngineCommandType.START:
            await this.start()
            break
          case EngineCommandType.STOP:
            await this.stop()
            break
          default:
            throw new Error(`Unknown command: ${typedParams.command}`)
        }

        return { success: true }
      } catch (error) {
        this.logger.error('Error executing command:', error)
        throw error
      }
    })

    this.logger.info('RPC handlers registered')
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

    this.setStatus(EngineStatus.READY)
  }

  /**
   * Load a game project
   * @param projectPath Path to the game project file
   * @param options Options for loading the project
   */
  async loadProject(
    projectPath: string,
    options?: ProjectLoadOptions,
  ): Promise<void> {
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
        this.logger.debug(
          `Loading progress: ${Math.round(event.progress * 100)}%`,
        )
      }
    })

    loader.on('error', (error) => {
      this.logger.error('Loader error:', error)
      this.setStatus(EngineStatus.ERROR)
    })

    loader.on('complete', () => {
      this.logger.info('Loading complete')
    })

    loader.on('afterload', async () => {
      this.logger.info('GameProjectResource loaded successfully')

      // Debug the game project
      this.gameProjectResource?.debugInfo()

      const event: EngineEvent = {
        type: EngineEventType.PROJECT_LOADED,
        data: { projectId: this.gameProjectResource.data.id || 'unknown' },
      }

      // Send the event to GJS using RPC
      await this.rpc.sendRequest('notifyEngineEvent', event).catch((error) => {
        this.logger.error('Error notifying project loaded:', error)
      })

      // Add the active map to the scene
      if (this.gameProjectResource?.data.startup.initialMapId) {
        await this.loadMap(this.gameProjectResource.data.startup.initialMapId)
      }

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

    const mapResource = await this.gameProjectResource.loadMap(mapId)

    // Create a new scene
    const mapScene = new Scene() // TODO: Extend Scene to MapScene
    mapScene.world.add(EditorInputSystem)
    mapResource.addToScene(mapScene)
    this.excalibur.add(mapId, mapScene)
    this.excalibur.goToScene(mapId)

    this.logger.info(
      `Map ${this.gameProjectResource.getMap(mapId)?.mapData.name} added to scene`,
    )

    // Create an RPC event for the map loaded event
    const event: EngineEvent = {
      type: EngineEventType.MAP_LOADED,
      data: { mapId: mapId },
    }

    // Send the event to GJS using RPC
    this.rpc.sendRequest('notifyEngineEvent', event).catch((error) => {
      this.logger.error('Error notifying status change:', error)
    })
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
  private async setStatus(status: EngineStatus): Promise<void> {
    if (this.status === status) {
      return
    }

    this.logger.info(`Engine status changed from ${this.status} to ${status}`)

    // Update the status
    this.status = status

    // Create an event
    const event: EngineEvent = {
      type: EngineEventType.STATUS_CHANGED,
      data: status,
    }

    // Send the event to GJS using RPC
    await this.rpc.sendRequest('notifyEngineEvent', event).catch((error) => {
      this.logger.error('Error notifying status change:', error)
    })
  }
}

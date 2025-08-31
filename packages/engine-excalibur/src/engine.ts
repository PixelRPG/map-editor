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
  RpcEngineType,
  EngineStatus,
  ProjectLoadOptions,
  RpcEngineParamMap,
  EngineRpcRegistry,
  EngineErrors,
} from '@pixelrpg/engine-core'
import {
  isEngineEvent,
  isValidRpcEngineParams,
  isEngineStatus,
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
  public events = new EventDispatcher<
    RpcEngineParamMap[RpcEngineType.NOTIFY_ENGINE_EVENT]
  >()

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

  private rpc = rpcEndpointFactory<EngineRpcRegistry>()

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
    this.rpc.registerHandler(RpcEngineType.LOAD_PROJECT, async (params) => {
      this.logger.info('RPC call: loadProject', params)

      // Validate parameters using type guard
      if (!isValidRpcEngineParams(RpcEngineType.LOAD_PROJECT, params)) {
        throw new Error(
          'Invalid parameters for loadProject: projectPath is required and must be a string',
        )
      }

      await this.loadProject(params.projectPath, params.options)
      return { success: true }
    })

    // Register loadMap handler
    this.rpc.registerHandler(RpcEngineType.LOAD_MAP, async (params) => {
      this.logger.info('RPC call: loadMap', params)

      // Validate parameters using type guard
      if (!isValidRpcEngineParams(RpcEngineType.LOAD_MAP, params)) {
        throw new Error(
          'Invalid parameters for loadMap: mapId is required and must be a string',
        )
      }

      await this.loadMap(params.mapId)
      return { success: true }
    })

    // Register start handler
    this.rpc.registerHandler(RpcEngineType.START, async (params) => {
      this.logger.info('RPC call: start')

      // Validate parameters using type guard
      if (!isValidRpcEngineParams(RpcEngineType.START, params)) {
        throw new Error('Invalid parameters for start')
      }

      await this.start()
      return { success: true }
    })

    // Register stop handler
    this.rpc.registerHandler(RpcEngineType.STOP, async (params) => {
      this.logger.info('RPC call: stop')

      // Validate parameters using type guard
      if (!isValidRpcEngineParams(RpcEngineType.STOP, params)) {
        throw new Error('Invalid parameters for stop')
      }

      await this.stop()
      return { success: true }
    })

    this.logger.info('RPC handlers registered')
  }

  /**
   * Initialize the engine
   */
  async initialize(): Promise<void> {
    await this.setStatus(EngineStatus.INITIALIZING)

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

    await this.setStatus(EngineStatus.READY)
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
      const error = EngineErrors.engineNotInitialized()
      throw new Error(error.message)
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

      const eventData = { projectPath, options }

      // Validate event data before sending
      if (!isValidRpcEngineParams(RpcEngineType.PROJECT_LOADED, eventData)) {
        this.logger.error('Invalid event data for PROJECT_LOADED')
        return
      }

      const event = {
        type: RpcEngineType.PROJECT_LOADED,
        data: eventData,
      }

      // Send the event to GJS using RPC
      await this.rpc.sendNotification(RpcEngineType.NOTIFY_ENGINE_EVENT, event)

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
    if (!this.excalibur) {
      const error = EngineErrors.engineNotInitialized()
      throw new Error(error.message)
    }

    if (!this.gameProjectResource) {
      const error = EngineErrors.projectNotLoaded()
      throw new Error(error.message)
    }

    this.logger.info(`Loading map: ${mapId}`)

    const mapResource = await this.gameProjectResource.loadMap(mapId)

    // Create a new scene
    const mapScene = new Scene() // TODO: Extend Scene to MapScene
    mapScene.world.add(EditorInputSystem)
    mapResource.addToScene(mapScene)
    this.excalibur.add(mapId, mapScene)
    this.excalibur.goToScene(mapId)

    this.logger.info(`Map ${mapResource.mapData.name} added to scene`)

    const eventData = { mapId }

    // Validate event data before sending
    if (!isValidRpcEngineParams(RpcEngineType.MAP_LOADED, eventData)) {
      this.logger.error('Invalid event data for MAP_LOADED')
      return
    }

    // Create an RPC event for the map loaded event
    const event = {
      type: RpcEngineType.MAP_LOADED,
      data: eventData,
    }

    // Send the event to GJS using RPC
    await this.rpc.sendNotification(RpcEngineType.NOTIFY_ENGINE_EVENT, event)
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

    // Validate status before using it
    if (!isEngineStatus(status)) {
      this.logger.error(`Invalid engine status: ${status}`)
      return
    }

    // Update the status
    this.status = status

    // Validate event data before sending
    if (!isValidRpcEngineParams(RpcEngineType.STATUS_CHANGED, status)) {
      this.logger.error('Invalid event data for STATUS_CHANGED')
      return
    }

    // Create an event
    const event = {
      type: RpcEngineType.STATUS_CHANGED,
      data: status,
    }

    // Send the event to GJS using RPC
    await this.rpc.sendNotification(RpcEngineType.NOTIFY_ENGINE_EVENT, event)
  }
}

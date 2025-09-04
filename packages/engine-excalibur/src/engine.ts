import {
  Engine as ExcaliburEngine,
  DisplayMode,
  Loader,
  Color,
  Logger,
  Scene,
  Clock,
  TileMap,
  Entity,
} from 'excalibur'
import { EventDispatcher, RpcEndpoint } from '@pixelrpg/message-channel-core'
import { rpcEndpointFactory } from './lib/rpc.ts'
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
import { MapScene } from './scenes/map.scene.ts'

/**
 * Handles engine initialization and configuration
 */
export class EngineInitializer {
  /**
   * Create and configure an Excalibur engine instance
   */
  static createEngine(
    canvasElementId: string,
    logger: Logger,
  ): ExcaliburEngine {
    logger.info('Creating Excalibur engine instance')

    const engine = new ExcaliburEngine({
      canvasElementId: canvasElementId,
      displayMode: DisplayMode.FillScreen,
      pixelArt: true,
      suppressPlayButton: true,
      backgroundColor: Color.Black, // TODO: Change this based on the OS light/dark mode
      enableCanvasTransparency: true,
      enableCanvasContextMenu: true, // Enable the right click context menu for debugging
    })

    // Configure engine settings
    this.configureEngineSettings(engine, logger)

    return engine
  }

  /**
   * Configure engine settings
   */
  private static configureEngineSettings(
    engine: ExcaliburEngine,
    logger: Logger,
  ): void {
    logger.info('Configuring engine settings')

    // Set up loader with error handling
    const loader = new Loader()
    loader.suppressPlayButton = true

    // Configure debug settings based on environment
    const isDevelopment = process.env.NODE_ENV === 'development'
    if (isDevelopment) {
      engine.showDebug(true)
      logger.info('Debug mode enabled')
    }
  }

  /**
   * Initialize engine with scenes and systems
   */
  static initializeEngine(
    engine: ExcaliburEngine,
    mapScene: MapScene,
    logger: Logger,
  ): void {
    logger.info('Initializing engine with scenes and systems')

    // Add scenes
    engine.addScene('map', mapScene)

    // Set initial scene
    engine.goToScene('map')

    // Set up engine event handlers
    this.setupEngineEventHandlers(engine, logger)
  }

  /**
   * Set up engine event handlers
   */
  private static setupEngineEventHandlers(
    engine: ExcaliburEngine,
    logger: Logger,
  ): void {
    engine.on('initialize', () => {
      logger.info('Engine initialized')
    })

    engine.on('start', () => {
      logger.info('Engine started')
    })

    engine.on('stop', () => {
      logger.info('Engine stopped')
    })

    engine.on('preupdate', () => {
      // Pre-update logic if needed
    })

    engine.on('postupdate', () => {
      // Post-update logic if needed
    })

    engine.on('predraw', () => {
      // Pre-draw logic if needed
    })

    engine.on('postdraw', () => {
      // Post-draw logic if needed
    })
  }
}

/**
 * Manages RPC handlers for engine communication
 */
export class RpcHandlerManager {
  private rpc = rpcEndpointFactory<EngineRpcRegistry>()
  private logger = Logger.getInstance()

  /**
   * Get the RPC endpoint
   */
  get rpcEndpoint(): RpcEndpoint<EngineRpcRegistry> {
    return this.rpc
  }

  /**
   * Register all RPC handlers
   */
  registerHandlers(
    loadProjectCallback: (params: any) => Promise<void>,
    loadMapCallback: (params: any) => Promise<void>,
    startCallback: () => Promise<void>,
    stopCallback: () => Promise<void>,
  ): void {
    this.logger.info('Registering RPC handlers')

    // Register loadProject handler
    this.rpc.registerHandler(RpcEngineType.LOAD_PROJECT, async (params) => {
      this.logger.info('RPC call: loadProject', params)

      if (!isValidRpcEngineParams(RpcEngineType.LOAD_PROJECT, params)) {
        throw new Error('Invalid parameters for loadProject')
      }

      await loadProjectCallback(params)
      return { success: true }
    })

    // Register loadMap handler
    this.rpc.registerHandler(RpcEngineType.LOAD_MAP, async (params) => {
      this.logger.info('RPC call: loadMap', params)

      if (!isValidRpcEngineParams(RpcEngineType.LOAD_MAP, params)) {
        throw new Error('Invalid parameters for loadMap')
      }

      await loadMapCallback(params)
      return { success: true }
    })

    // Register start handler
    this.rpc.registerHandler(RpcEngineType.START, async () => {
      this.logger.info('RPC call: start')
      await startCallback()
      return { success: true }
    })

    // Register stop handler
    this.rpc.registerHandler(RpcEngineType.STOP, async () => {
      this.logger.info('RPC call: stop')
      await stopCallback()
      return { success: true }
    })
  }

  /**
   * Destroy the RPC endpoint
   */
  destroy(): void {
    this.rpc.destroy()
  }
}

/**
 * Excalibur implementation of the game engine
 * Now serves as a facade coordinating specialized components
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
   * Specialized components for engine functionality
   */
  private initializer = new EngineInitializer()
  private rpcManager = new RpcHandlerManager()

  /**
   * Core engine resources
   */
  private excalibur: ExcaliburEngine | null = null
  private gameProjectResource: GameProjectResource | null = null
  private logger = Logger.getInstance()
  private mapScene: MapScene | null = null

  /**
   * Create a new Excalibur engine
   * @param canvasElementId ID of the canvas element
   */
  constructor(private canvasElementId: string = 'engine-view') {
    this.logger.info('Creating Engine')

    // Register RPC handlers for GJS to call
    this.setupRpcHandlers()
  }

  /**
   * Set up RPC handlers using the manager
   */
  private setupRpcHandlers(): void {
    this.rpcManager.registerHandlers(
      (params) => this.loadProject(params.projectPath, params.options),
      (params) => this.loadMap(params.mapId),
      () => this.start(),
      () => this.stop(),
    )
  }

  /**
   * Initialize the engine
   */
  async initialize(): Promise<void> {
    await this.setStatus(EngineStatus.INITIALIZING)

    // Create the Excalibur engine using the initializer
    this.excalibur = EngineInitializer.createEngine(
      this.canvasElementId,
      this.logger,
    )

    // Note: Map scene will be created when loading the first map
    // Engine initialization is handled by the EngineInitializer

    await this.setStatus(EngineStatus.READY)
  }

  /**
   * Load a game project
   */
  async loadProject(
    projectPath: string,
    options?: ProjectLoadOptions,
  ): Promise<void> {
    if (!this.excalibur) {
      throw new Error(EngineErrors.engineNotInitialized().message)
    }

    await this.setStatus(EngineStatus.LOADING)
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
      this.gameProjectResource?.debugInfo()

      const eventData = { projectPath, options }

      if (!isValidRpcEngineParams(RpcEngineType.PROJECT_LOADED, eventData)) {
        this.logger.error('Invalid event data for PROJECT_LOADED')
        return
      }

      const event = {
        type: RpcEngineType.PROJECT_LOADED,
        data: eventData,
      }

      // Send the event to GJS using RPC
      await this.rpcManager.rpcEndpoint.sendNotification(
        RpcEngineType.NOTIFY_ENGINE_EVENT,
        event,
      )

      // Add the active map to the scene
      if (this.gameProjectResource?.data.startup.initialMapId) {
        await this.loadMap(this.gameProjectResource.data.startup.initialMapId)
      }

      await this.setStatus(EngineStatus.READY)
    })

    // Start the engine with the loader
    await this.excalibur.start(loader)
  }

  /**
   * Load a specific map
   */
  async loadMap(mapId: string): Promise<void> {
    if (!this.excalibur) {
      throw new Error(EngineErrors.engineNotInitialized().message)
    }

    if (!this.gameProjectResource) {
      throw new Error(EngineErrors.projectNotLoaded().message)
    }

    this.logger.info(`Loading map: ${mapId}`)

    const mapResource = await this.gameProjectResource.loadMap(mapId)

    // Create a new map scene with the loaded map resource
    const newMapScene = new MapScene(mapResource)
    this.mapScene = newMapScene

    // Add the scene to the engine
    this.excalibur.addScene(mapId, newMapScene)
    this.excalibur.goToScene(mapId)

    this.logger.info(`Map ${mapResource.mapData.name} loaded`)

    const eventData = { mapId }

    if (!isValidRpcEngineParams(RpcEngineType.MAP_LOADED, eventData)) {
      this.logger.error('Invalid event data for MAP_LOADED')
      return
    }

    const event = {
      type: RpcEngineType.MAP_LOADED,
      data: eventData,
    }

    await this.rpcManager.rpcEndpoint.sendNotification(
      RpcEngineType.NOTIFY_ENGINE_EVENT,
      event,
    )
  }

  /**
   * Start the engine
   */
  async start(): Promise<void> {
    if (!this.excalibur) {
      throw new Error('Engine not initialized')
    }
    this.excalibur.start()
    await this.setStatus(EngineStatus.RUNNING)
  }

  /**
   * Stop the engine
   */
  async stop(): Promise<void> {
    if (!this.excalibur) {
      throw new Error('Engine not initialized')
    }

    this.excalibur.stop()
    await this.setStatus(EngineStatus.READY)
  }

  /**
   * Set the engine status and dispatch a status changed event
   */
  private async setStatus(status: EngineStatus): Promise<void> {
    if (this.status === status) {
      return
    }

    this.logger.info(`Engine status changed from ${this.status} to ${status}`)

    if (!isEngineStatus(status)) {
      this.logger.error(`Invalid engine status: ${status}`)
      return
    }

    this.status = status

    if (!isValidRpcEngineParams(RpcEngineType.STATUS_CHANGED, status)) {
      this.logger.error('Invalid event data for STATUS_CHANGED')
      return
    }

    const event = {
      type: RpcEngineType.STATUS_CHANGED,
      data: status,
    }

    await this.rpcManager.rpcEndpoint.sendNotification(
      RpcEngineType.NOTIFY_ENGINE_EVENT,
      event,
    )
  }
}

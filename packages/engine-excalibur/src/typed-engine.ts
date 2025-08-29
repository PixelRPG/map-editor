import {
  Engine as ExcaliburEngine,
  DisplayMode,
  Loader,
  Color,
  Logger,
  Scene,
  Clock,
} from 'excalibur'
import { EventDispatcher, TypedRpcEndpointBase } from '@pixelrpg/message-channel-core'
import { rpcEndpointFactory } from './utils/rpc.ts'
import {
  EngineInterface,
  EngineMessage,
  EngineMessageType,
  EngineStatus,
  ProjectLoadOptions,
  EngineMessageDataMap,
} from '@pixelrpg/engine-core'
import { GameProjectResource } from '@pixelrpg/data-excalibur'
import { EditorInputSystem } from './systems/editor-input.system.ts'

/**
 * Excalibur implementation of the game engine with type-safe RPC communication
 */
export class TypedEngine extends TypedRpcEndpointBase implements EngineInterface {
  /**
   * Current engine status
   */
  public status: EngineStatus = EngineStatus.INITIALIZING

  /**
   * Event dispatcher for engine events
   */
  public events = new EventDispatcher<EngineMessage>()

  /**
   * Excalibur engine instance
   */
  private excalibur: ExcaliburEngine | null = null

  /**
   * Logger instance
   */
  private logger = Logger.getInstance()

  /**
   * Game project resource
   */
  private gameProjectResource: GameProjectResource | null = null

  constructor(channelName = 'pixelrpg') {
    super(channelName)
    this.setupRpcHandlers()
  }

  /**
   * Set up RPC message handling using the type-safe API
   */
  private setupRpcHandlers(): void {
    this.logger.info('Setting up typed RPC handlers')

    // Register command handlers (require responses)
    this.registerCommandHandler('load-project', async (params) => {
      this.logger.info('RPC command: load-project', params)
      try {
        if (!params.projectPath) {
          throw new Error('Project path is required')
        }
        await this.loadProject(params.projectPath, params.options)
        return { success: true }
      } catch (error) {
        this.logger.error('Error loading project:', error)
        throw error
      }
    })

    this.registerCommandHandler('load-map', async (params) => {
      this.logger.info('RPC command: load-map', params)
      try {
        if (!params.mapId) {
          throw new Error('Map ID is required')
        }
        await this.loadMap(params.mapId)
        return { success: true }
      } catch (error) {
        this.logger.error('Error loading map:', error)
        throw error
      }
    })

    this.registerCommandHandler('start', async (params) => {
      this.logger.info('RPC command: start', params)
      try {
        await this.start()
        return { success: true }
      } catch (error) {
        this.logger.error('Error starting engine:', error)
        throw error
      }
    })

    this.registerCommandHandler('stop', async (params) => {
      this.logger.info('RPC command: stop', params)
      try {
        await this.stop()
        return { success: true }
      } catch (error) {
        this.logger.error('Error stopping engine:', error)
        throw error
      }
    })

    // Register input handler (no response needed)
    this.registerInputHandler('handle-input-event', async (inputEvent) => {
      this.logger.debug('RPC input: handle-input-event', inputEvent)
      // Handle input event processing here
      // This is called from the editor input system
    })

    this.logger.info('Typed RPC handlers registered')
  }

  /**
   * Delegate to the factory for message posting
   */
  protected async postMessage(message: any): Promise<void> {
    const rpc = rpcEndpointFactory()
    return (rpc as any).postMessage(message)
  }

  /**
   * Initialize the engine
   */
  public async initialize(): Promise<void> {
    this.logger.info('Initializing Excalibur engine')

    try {
      // Create Excalibur engine instance
      this.excalibur = new ExcaliburEngine({
        displayMode: DisplayMode.FillScreen,
        backgroundColor: Color.fromHex('#2d3748'),
        enableCanvasTransparency: true,
        antialiasing: false,
        snapToPixel: true,
      })

      // Add editor input system
      this.excalibur.add(new EditorInputSystem(this))

      // Set up the canvas and start the engine
      await this.excalibur.start()

      this.status = EngineStatus.READY
      await this.notifyStatusChanged(EngineStatus.READY)

      this.logger.info('Excalibur engine initialized successfully')
    } catch (error) {
      this.logger.error('Failed to initialize Excalibur engine:', error)
      this.status = EngineStatus.ERROR
      await this.notifyStatusChanged(EngineStatus.ERROR)
      throw error
    }
  }

  /**
   * Start the engine
   */
  public async start(): Promise<void> {
    if (!this.excalibur) {
      throw new Error('Engine not initialized')
    }

    this.logger.info('Starting engine')
    this.status = EngineStatus.RUNNING
    await this.notifyStatusChanged(EngineStatus.RUNNING)
  }

  /**
   * Stop the engine
   */
  public async stop(): Promise<void> {
    if (!this.excalibur) {
      throw new Error('Engine not initialized')
    }

    this.logger.info('Stopping engine')
    this.status = EngineStatus.READY
    await this.notifyStatusChanged(EngineStatus.READY)
  }

  /**
   * Load a project
   */
  public async loadProject(projectPath: string, options?: ProjectLoadOptions): Promise<void> {
    this.logger.info(`Loading project: ${projectPath}`)

    try {
      // Create and load the game project resource
      this.gameProjectResource = new GameProjectResource(projectPath, options)
      await this.gameProjectResource.load()

      this.logger.info('GameProjectResource loaded successfully')

      // Notify that project was loaded using event (no response expected)
      await this.sendEvent('notify-engine-event', {
        type: EngineMessageType.PROJECT_LOADED,
        data: { projectPath, options },
      })
    } catch (error) {
      this.logger.error('Error loading project:', error)
      throw error
    }
  }

  /**
   * Load a map
   */
  public async loadMap(mapId: string): Promise<void> {
    if (!this.gameProjectResource) {
      throw new Error('No project loaded')
    }

    this.logger.info(`Loading map: ${mapId}`)

    try {
      const mapResource = this.gameProjectResource.getMap(mapId)
      if (!mapResource) {
        throw new Error(`Map not found: ${mapId}`)
      }

      await mapResource.load()

      // Create a new scene for the map
      const mapScene = new Scene()
      
      // Add the map scene to Excalibur
      this.excalibur?.add(mapId, mapScene)
      this.excalibur?.goToScene(mapId)

      this.logger.info(`Map ${mapResource.mapData.name} loaded successfully`)

      // Notify that map was loaded using event (no response expected)
      await this.sendEvent('notify-engine-event', {
        type: EngineMessageType.MAP_LOADED,
        data: { mapId },
      })
    } catch (error) {
      this.logger.error('Error loading map:', error)
      throw error
    }
  }

  /**
   * Notify status change using event (fire-and-forget)
   */
  private async notifyStatusChanged(status: EngineStatus): Promise<void> {
    this.logger.info(`Engine status changed to: ${status}`)

    try {
      await this.sendEvent('notify-engine-event', {
        type: EngineMessageType.STATUS_CHANGED,
        data: status,
      })
    } catch (error) {
      this.logger.error('Error notifying status change:', error)
      // Don't throw here - status change notification failures shouldn't break the engine
    }
  }
}

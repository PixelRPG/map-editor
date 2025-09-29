import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import { RpcEndpoint } from '@pixelrpg/message-channel-gjs'
import { EventDispatcher } from '@pixelrpg/message-channel-core'
import {
  EngineInterface,
  RpcEngineType,
  EngineRpcRegistry,
  RpcEngineParamMap,
  isEngineEvent,
  EngineStatus,
  ProjectLoadOptions,
  createInitializationError,
  createRuntimeError,
  createValidationError,
  createResourceError,
} from '@pixelrpg/engine-core'
import { CLIENT_DIR_PATH, CLIENT_RESOURCE_PATH } from '../utils/constants.ts'
import { WebView } from './webview.ts'
import Template from './engine.blp'

GObject.type_ensure(WebView.$gtype)

export namespace Engine {
  export type ConstructorProps = Partial<Adw.Bin.ConstructorProps>

  export interface SignalProps {
    ready: []
    [RpcEngineType.STATUS_CHANGED]: [EngineStatus]
    [RpcEngineType.PROJECT_LOADED]: [string] // projectId
    [RpcEngineType.MAP_LOADED]: [string] // mapId
    [RpcEngineType.ERROR]: [string, Error | null] // message, error
  }
}

/**
 * GJS implementation of the game engine as a GObject widget
 */
export class Engine extends Adw.Bin implements EngineInterface {
  /**
   * WebView for rendering the game
   */
  declare private _webView: WebView

  /**
   * Event dispatcher for engine events
   * TODO: Currently unused
   */
  public readonly events = new EventDispatcher<
    RpcEngineParamMap[RpcEngineType.NOTIFY_ENGINE_EVENT]
  >()

  get rpc(): RpcEndpoint<EngineRpcRegistry> {
    if (!this._webView.rpc) {
      throw new Error('RPC server is not initialized')
    }
    return this._webView.rpc
  }

  get webView(): WebView {
    return this._webView
  }

  static {
    GObject.registerClass(
      {
        GTypeName: 'Engine',
        Template,
        Signals: {
          ready: {},
          [RpcEngineType.STATUS_CHANGED]: {
            param_types: [GObject.TYPE_STRING],
          },
          [RpcEngineType.PROJECT_LOADED]: {
            param_types: [GObject.TYPE_STRING],
          },
          [RpcEngineType.MAP_LOADED]: {
            param_types: [GObject.TYPE_STRING],
          },
          [RpcEngineType.ERROR]: {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_OBJECT],
          },
        },
        InternalChildren: ['webView'],
      },
      this,
    )
  }

  /**
   * Current status of the engine
   */
  public status: EngineStatus = EngineStatus.INITIALIZING

  /**
   * Resource paths for the engine
   */
  private resourcePaths: string[] = [CLIENT_DIR_PATH.get_path()!]

  /**
   * GResource path for the engine
   */
  private gresourcePath: string = CLIENT_RESOURCE_PATH

  /**
   * Signal management for GC safety
   */
  private _signalHandlers: number[] = []

  /**
   * Create a new GJS engine
   */
  constructor(params: Engine.ConstructorProps = {}) {
    super(params)

    try {
      this.status = EngineStatus.INITIALIZING

      // Initialize resource paths
      this._webView?.setResourcePaths(this.resourcePaths)
      this._webView?.setGResourcePath(this.gresourcePath)

      // Note: WebView signal connection will be done in vfunc_map for GC safety
    } catch (error) {
      console.error('[GJS Engine] Failed to initialize engine:', error)
      this.status = EngineStatus.ERROR
      throw createInitializationError(
        'Failed to initialize GJS engine',
        error instanceof Error ? error : undefined,
      )
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
  public async loadProject(
    projectPath: string,
    options?: ProjectLoadOptions,
  ): Promise<void> {
    if (this.status === EngineStatus.INITIALIZING) {
      throw createRuntimeError('Engine not initialized')
    }

    if (!projectPath || projectPath.trim() === '') {
      throw createValidationError('Invalid project path')
    }

    projectPath = Gio.File.new_for_path(projectPath).get_path()!

    try {
      // Send an RPC request to load the project
      const response = await this.rpc.sendRequest(RpcEngineType.LOAD_PROJECT, {
        projectPath,
        options,
      })

      console.log(
        '[GJS Engine] Project load request sent:',
        projectPath,
        response,
      )
    } catch (error) {
      console.error('[GJS Engine] Failed to load project:', error)

      throw createResourceError(
        `Failed to load project: ${projectPath}`,
        error instanceof Error ? error : undefined,
      )
    }
  }

  /**
   * Load a map
   */
  public async loadMap(mapId: string): Promise<void> {
    if (this.status === EngineStatus.INITIALIZING) {
      throw createRuntimeError('Engine not initialized')
    }

    if (!mapId || mapId.trim() === '') {
      throw createValidationError('Invalid map ID')
    }

    try {
      // Send an RPC request to load the map
      await this.rpc.sendRequest(RpcEngineType.LOAD_MAP, {
        mapId,
      })

      console.log('[GJS Engine] Map load request sent:', mapId)
    } catch (error) {
      console.error('[GJS Engine] Failed to load map:', error)

      throw createResourceError(
        `Failed to load map: ${mapId}`,
        error instanceof Error ? error : undefined,
      )
    }
  }

  /**
   * Start the engine
   */
  public async start(): Promise<void> {
    if (this.status === EngineStatus.INITIALIZING) {
      throw createRuntimeError('Engine not initialized')
    }

    try {
      // Send an RPC request to start the engine
      await this.rpc.sendRequest(RpcEngineType.START, undefined)

      console.log('[GJS Engine] Start command sent')
      this.status = EngineStatus.RUNNING
    } catch (error) {
      console.error('[GJS Engine] Failed to start engine:', error)

      throw createRuntimeError(
        'Failed to start engine',
        error instanceof Error ? error : undefined,
      )
    }
  }

  /**
   * Stop the engine
   */
  public async stop(): Promise<void> {
    if (this.status === EngineStatus.INITIALIZING) {
      throw createRuntimeError('Engine not initialized')
    }

    try {
      // Send an RPC request to stop the engine
      await this.rpc.sendRequest(RpcEngineType.STOP, undefined)

      console.log('[GJS Engine] Stop command sent')
    } catch (error) {
      console.error('[GJS Engine] Failed to stop engine:', error)

      throw createRuntimeError(
        'Failed to stop engine',
        error instanceof Error ? error : undefined,
      )
    }
  }

  /**
   * Set up event listeners for the WebView
   */
  private registerRpcHandlers(): void {
    // Register handler for engine events from the WebView using RPC
    this.rpc.registerHandler(
      RpcEngineType.NOTIFY_ENGINE_EVENT,
      async (event: RpcEngineParamMap[RpcEngineType.NOTIFY_ENGINE_EVENT]) => {
        console.log('[GJS Engine] Engine event received from WebView:', event)
        // Handle the event with proper typing
        if (!event) {
          return { success: false, error: 'Event is undefined' }
        }

        // Handle the event
        if (isEngineEvent(event)) {
          try {
            this.onEngineEvent(event)
            return { success: true }
          } catch (error) {
            console.error('[GJS Engine] Failed to handle engine event:', error)
            return { success: false, error: 'Failed to handle engine event' }
          }
        }

        return { success: false, error: 'Invalid event format' }
      },
    )

    console.log('[GJS Engine] Event listeners set up')
  }

  /**
   * Handler for engine events from the WebView
   * @param event The engine event
   */
  private onEngineEvent(
    event: RpcEngineParamMap[RpcEngineType.NOTIFY_ENGINE_EVENT],
  ): void {
    console.info('[GJS Engine] Engine event received:', event)

    // Dispatch the event to any registered listeners
    // this.events.dispatch(event)

    switch (event.type) {
      case RpcEngineType.STATUS_CHANGED:
        this.onEngineEventStatusChanged(event.data as EngineStatus)
        break
      case RpcEngineType.MAP_LOADED:
        this.onEngineEventMapLoaded(
          event.data as RpcEngineParamMap[RpcEngineType.MAP_LOADED],
        )
        break
      case RpcEngineType.PROJECT_LOADED:
        this.onEngineEventProjectLoaded(
          event.data as RpcEngineParamMap[RpcEngineType.PROJECT_LOADED],
        )
        break
      case RpcEngineType.ERROR:
        this.onEngineEventError(
          event.data as RpcEngineParamMap[RpcEngineType.ERROR],
        )
        break
      default:
        console.warn('[GJS Engine] Unknown engine event:', event)
        break
    }
  }

  /**
   * Handler for engine status changed event from the WebView
   * @param event The engine event
   */
  private onEngineEventStatusChanged(status: EngineStatus): void {
    this.status = status
    console.info('[GJS Engine] Engine status changed to:', this.status)
    this.emit(RpcEngineType.STATUS_CHANGED, this.status)
  }

  /**
   * Handler for map loaded event from the WebView
   * @param data The map loaded data
   */
  private onEngineEventMapLoaded(
    data: RpcEngineParamMap[RpcEngineType.MAP_LOADED],
  ): void {
    console.info('[GJS Engine] Map loaded:', data.mapId)
    this.emit(RpcEngineType.MAP_LOADED, data.mapId)
  }

  /**
   * Handler for project loaded event from the WebView
   * @param data The project loaded data
   */
  private onEngineEventProjectLoaded(
    data: RpcEngineParamMap[RpcEngineType.PROJECT_LOADED],
  ): void {
    console.info('[GJS Engine] Project loaded:', data.projectPath)
    this.emit(RpcEngineType.PROJECT_LOADED, data.projectPath)
  }

  /**
   * Handler for engine error event from the WebView
   * @param data The error data
   */
  private onEngineEventError(
    data: RpcEngineParamMap[RpcEngineType.ERROR],
  ): void {
    console.error('[GJS Engine] Engine error:', data)
    this.emit(RpcEngineType.ERROR, data.message, data.error || null)
  }

  /**
   * Set resource paths for the engine
   * @param resourcePaths Array of resource paths
   */
  public setResourcePaths(resourcePaths: string[]): void {
    this.resourcePaths = resourcePaths
    this._webView?.setResourcePaths(resourcePaths)
  }

  /**
   * Set the GResource path for the engine
   * @param gresourcePath GResource path
   */
  public setGResourcePath(gresourcePath: string): void {
    this.gresourcePath = gresourcePath
    this._webView?.setGResourcePath(gresourcePath)
  }

  /**
   * Add a resource path to the engine
   * @param path Resource path to add
   */
  public addResourcePath(path: string): void {
    if (!this.resourcePaths.includes(path)) {
      this.resourcePaths.push(path)
      this._webView?.addResourcePath(path)
    }
  }

  /**
   * Connect signals when widget becomes visible (GTK 4 lifecycle pattern)
   */
  vfunc_map(): void {
    super.vfunc_map()

    if (this._signalHandlers.length === 0 && this._webView) {
      // Connect WebView ready signal
      const readyHandlerId = this._webView.connect('ready', () => {
        console.log('[GJS Engine] WebView ready')

        // Set up event listeners
        this.registerRpcHandlers()

        this.status = EngineStatus.READY
        this.emit('ready')
      })
      this._signalHandlers.push(readyHandlerId)
    }
  }

  /**
   * Disconnect signals when widget becomes invisible (GC-safe cleanup)
   */
  vfunc_unmap(): void {
    if (this._signalHandlers.length > 0 && this._webView) {
      // Disconnect all signal handlers
      for (const handlerId of this._signalHandlers) {
        if (handlerId > 0) {
          this._webView.disconnect(handlerId)
        }
      }
      this._signalHandlers = []
    }

    super.vfunc_unmap()
  }
}

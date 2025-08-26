import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import { EventDispatcher } from '@pixelrpg/message-channel-core'
import {
  EngineInterface,
  EngineEvent,
  EngineEventType,
  EngineStatus,
  ProjectLoadOptions,
  EngineCommandType,
  EngineEventHandler,
  createInitializationError,
  createRuntimeError,
  createValidationError,
  createResourceError,
  formatError,
} from '@pixelrpg/engine-core'
import { CLIENT_DIR_PATH, CLIENT_RESOURCE_PATH } from '../utils/constants.ts'

import { WebView } from './webview.ts'
import Template from './engine.blp'

GObject.type_ensure(WebView.$gtype)

export namespace Engine {
  export type ConstructorProps = Partial<Adw.Bin.ConstructorProps>

  export interface SignalProps {
    'message-received': [string]
    ready: []
  }
}

/**
 * GJS implementation of the game engine as a GObject widget
 */
export class Engine extends Adw.Bin implements EngineInterface {
  /**
   * WebView for rendering the game
   */
  declare _webView: WebView | null

  static {
    GObject.registerClass(
      {
        GTypeName: 'Engine',
        Template,
        Signals: {
          'message-received': { param_types: [GObject.TYPE_STRING] },
          ready: {},
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
    if (!this._webView?.rpc) {
      throw createRuntimeError('RPC server is not initialized')
    }

    if (this.status === EngineStatus.INITIALIZING) {
      throw createRuntimeError('Engine not initialized')
    }

    if (!projectPath || projectPath.trim() === '') {
      throw createValidationError('Invalid project path')
    }

    projectPath = Gio.File.new_for_path(projectPath).get_path()!

    try {
      // Send an RPC request to load the project
      const response = await this._webView.rpc.sendRequest('loadProject', {
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
      await this._webView?.rpc?.sendRequest('loadMap', {
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
      await this._webView?.rpc?.sendRequest('engineCommand', {
        command: EngineCommandType.START,
      })

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
      await this._webView?.rpc?.sendRequest('engineCommand', {
        command: EngineCommandType.STOP,
      })

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
  private setupEventListeners(): void {
    if (!this._webView?.rpc) {
      throw new Error('RPC server is not initialized')
    }

    // Register handler for engine events from the WebView using RPC
    // TODO: Make this type safe
    this._webView.rpc.registerHandler('notifyEngineEvent', async (event) => {
      console.log('[GJS Engine] Engine event received from WebView:', event)
      // Handle the event with proper typing
      if (
        event &&
        typeof event === 'object' &&
        'type' in event &&
        Object.values(EngineEventType).includes(event.type as EngineEventType)
      ) {
        this.onEngineEvent(event as EngineEvent)
        return { success: true }
      }
      return { success: false, error: 'Invalid engine event format' }
    })

    console.log('[GJS Engine] Event listeners set up')
  }

  /**
   * Handler for engine events from the WebView
   * @param event The engine event
   */
  private onEngineEvent(event: EngineEvent): void {
    if (typeof event === 'object' && 'type' in event) {
      const engineEventType = event.type

      console.info('[GJS Engine] Engine event received:', event)

      switch (engineEventType) {
        case EngineEventType.STATUS_CHANGED:
          this.onEngineEventStatusChanged(
            event as EngineEvent<EngineEventType.STATUS_CHANGED>,
          )
          break
        case EngineEventType.MAP_LOADED:
          this.onEngineEventMapLoaded(
            event as EngineEvent<EngineEventType.MAP_LOADED>,
          )
          break
        case EngineEventType.PROJECT_LOADED:
          this.onEngineEventProjectLoaded(
            event as EngineEvent<EngineEventType.PROJECT_LOADED>,
          )
          break
        case EngineEventType.ERROR:
          console.error('[GJS Engine] Engine error:', event.data)
          break
        default:
          console.warn('[GJS Engine] Unknown engine event:', event)
          break
      }
    }
  }

  /**
   * Handler for engine status changed event from the WebView
   * @param event The engine event
   */
  private onEngineEventStatusChanged(
    event: EngineEvent<EngineEventType.STATUS_CHANGED>,
  ): void {
    this.status = event.data
    console.info('[GJS Engine] Engine status changed to:', this.status)
  }

  /**
   * Handler for map loaded event from the WebView
   * @param event The engine event
   */
  private onEngineEventMapLoaded(
    event: EngineEvent<EngineEventType.MAP_LOADED>,
  ): void {
    console.info('[GJS Engine] Map loaded:', event.data.mapId)
  }

  /**
   * Handler for project loaded event from the WebView
   * @param event The engine event
   */
  private onEngineEventProjectLoaded(
    event: EngineEvent<EngineEventType.PROJECT_LOADED>,
  ): void {
    console.info('[GJS Engine] Project loaded:', event.data.projectId)
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
        this.setupEventListeners()

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

GObject.type_ensure(Engine.$gtype)

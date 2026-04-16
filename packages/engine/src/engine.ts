import {
  Engine as ExcaliburEngine,
  DisplayMode,
  EventEmitter,
  Loader,
  Color,
  Logger,
} from 'excalibur'
import {
  EngineStatus,
  EngineEvent,
  EngineEventMap,
  EditorState,
  ProjectLoadOptions,
} from './types/index.ts'
import { GameProjectResource } from './resource/GameProjectResource.ts'
import { MapScene } from './scenes/map.scene.ts'

export class Engine {
  public status: EngineStatus = EngineStatus.INITIALIZING
  public readonly events = new EventEmitter<EngineEventMap>()

  public readonly excalibur: ExcaliburEngine
  private _gameProjectResource: GameProjectResource | null = null
  private mapScene: MapScene | null = null
  private logger = Logger.getInstance()

  /** Currently loaded project resource (null until loadProject completes). */
  public get gameProjectResource(): GameProjectResource | null {
    return this._gameProjectResource
  }

  private editorState: EditorState = {
    tool: null,
    tileId: null,
    layerId: null,
  }

  constructor(canvas: HTMLCanvasElement) {
    this.logger.info('Creating Engine')

    this.excalibur = new ExcaliburEngine({
      canvasElement: canvas,
      // Match the jelly-jumper showcase: skip Excalibur's browser feature
      // detector (it creates its own throwaway canvas whose getContext('webgl')
      // returns null in GJS and would force Canvas2D fallback).
      suppressMinimumBrowserFeatureDetection: true,
      suppressConsoleBootMessage: true,
      suppressPlayButton: true,
      // `FitContainerAndFill` is what gjsify widgets expect (no "screen" in
      // GJS). FillScreen tries to resize against window.innerWidth/Height,
      // which are not available here.
      displayMode: DisplayMode.FitContainerAndFill,
      pixelArt: true,
      backgroundColor: this.resolveBackgroundColor(),
      enableCanvasTransparency: true,
      enableCanvasContextMenu: true,
    })
  }

  async initialize(): Promise<void> {
    this.setStatus(EngineStatus.INITIALIZING)
    this.setStatus(EngineStatus.READY)
  }

  async loadProject(
    projectPath: string,
    options?: ProjectLoadOptions,
  ): Promise<void> {
    this.setStatus(EngineStatus.LOADING)
    this.logger.info(`[Engine] Loading project: ${projectPath}`)

    this._gameProjectResource = new GameProjectResource(projectPath, {
      preloadAllSpriteSets: options?.preloadAllSpriteSets ?? true,
      preloadAllMaps: options?.preloadAllMaps ?? false,
    })

    const loader = new Loader([this._gameProjectResource])
    const loaderEvents = loader as unknown as {
      on(name: string, handler: (payload: any) => void): void
    }

    loaderEvents.on('progress', (event) => {
      if (event && typeof event.progress === 'number') {
        this.logger.debug(
          `Loading progress: ${Math.round(event.progress * 100)}%`,
        )
      }
    })

    loaderEvents.on('error', (error) => {
      this.logger.error('Loader error:', error)
      this.setStatus(EngineStatus.ERROR)
      this.events.emit(EngineEvent.ERROR, {
        message: 'Loader error',
        cause: error instanceof Error ? error : new Error(String(error)),
      })
    })

    loaderEvents.on('complete', () => {
      this.logger.info('Loading complete')
    })

    loaderEvents.on('afterload', async () => {
      this.logger.info('GameProjectResource loaded successfully')
      this._gameProjectResource?.debugInfo()

      this.events.emit(EngineEvent.PROJECT_LOADED, { projectPath, options })

      if (this._gameProjectResource?.data.startup.initialMapId) {
        await this.loadMap(this._gameProjectResource.data.startup.initialMapId)
      }

      this.setStatus(EngineStatus.READY)
    })

    await this.excalibur.start(loader)
    // Re-apply resolution + viewport after the canvas size is settled (gjsify
    // widget emits the final size asynchronously). Mirrors jelly-jumper.
    try {
      this.excalibur.screen.applyResolutionAndViewport()
    } catch {
      // screen not ready yet — ignore
    }
  }

  async loadMap(mapId: string): Promise<void> {
    if (!this._gameProjectResource) {
      throw new Error('Project not loaded')
    }

    this.logger.info(`Loading map: ${mapId}`)
    const mapResource = await this._gameProjectResource.loadMap(mapId)

    const newMapScene = new MapScene(
      mapResource,
      this.events,
      () => this.getEditorState(),
    )
    this.mapScene = newMapScene

    this.excalibur.addScene(mapId, newMapScene)
    this.excalibur.goToScene(mapId)

    this.logger.info(`Map ${mapResource.mapData.name} loaded`)
    this.events.emit(EngineEvent.MAP_LOADED, { mapId })
  }

  async start(): Promise<void> {
    this.excalibur.start()
    this.setStatus(EngineStatus.RUNNING)
  }

  async stop(): Promise<void> {
    this.excalibur.stop()
    this.setStatus(EngineStatus.READY)
  }

  setEditorState(state: Partial<EditorState>): void {
    this.editorState = { ...this.editorState, ...state }
  }

  getEditorState(): EditorState {
    return { ...this.editorState }
  }

  private setStatus(status: EngineStatus): void {
    if (this.status === status) return
    this.logger.info(`Engine status changed from ${this.status} to ${status}`)
    this.status = status
    this.events.emit(EngineEvent.STATUS_CHANGED, { status })
  }

  private resolveBackgroundColor(): Color {
    try {
      if (
        typeof globalThis !== 'undefined' &&
        typeof globalThis.matchMedia === 'function' &&
        globalThis.matchMedia('(prefers-color-scheme: dark)').matches
      ) {
        return Color.Black
      }
    } catch {
      // matchMedia unavailable — fall through to default
    }
    return Color.White
  }
}

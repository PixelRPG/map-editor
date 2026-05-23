import { Actor, Color, DisplayMode, EventEmitter, Engine as ExcaliburEngine, Loader, Logger, TileMap } from 'excalibur'
import type { Command } from './commands/index.ts'
import {
  ActiveLayerComponent,
  ActiveTileComponent,
  ActiveToolComponent,
  type EditorTool,
  SelectedPlacementsComponent,
  TileTransformComponent,
  UndoStackComponent,
} from './components/index.ts'
import { GameProjectResource } from './resource/GameProjectResource.ts'
import { MapScene } from './scenes/map.scene.ts'
import { refreshAllTileGraphics } from './services/tile-graphics.manager.ts'
import { EngineEvent, type EngineEventMap, EngineStatus, type ProjectLoadOptions } from './types/index.ts'
import { SessionState } from './utils/session-state.ts'

interface LoaderEventMap {
  progress: { progress: number }
  error: unknown
  complete: undefined
  afterload: undefined
}

export class Engine {
  public status: EngineStatus = EngineStatus.INITIALIZING
  public readonly events = new EventEmitter<EngineEventMap>()

  public readonly excalibur: ExcaliburEngine
  private _gameProjectResource: GameProjectResource | null = null
  private logger = Logger.getInstance()

  /** Currently loaded project resource (null until loadProject completes). */
  public get gameProjectResource(): GameProjectResource | null {
    return this._gameProjectResource
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
      // `FillContainer` — the game resolution tracks the host widget's
      // pixel size, so resizing the GTK widget reveals more (or less)
      // of the world at the same tile pixel size, without distorting
      // the rendered tiles. `FillScreen` would be wrong here — it
      // reads `window.innerWidth/Height`, which don't exist in GJS.
      displayMode: DisplayMode.FillContainer,
      pixelArt: true,
      // Fully transparent background so the editor's diagonal-stripe
      // scratchpad backdrop (and any future themed fill) shows through
      // wherever the map doesn't cover the canvas.
      backgroundColor: Color.Transparent,
      enableCanvasTransparency: true,
      enableCanvasContextMenu: true,
    })
  }

  async initialize(): Promise<void> {
    this.setStatus(EngineStatus.INITIALIZING)
    this.setStatus(EngineStatus.READY)
  }

  async loadProject(projectPath: string, options?: ProjectLoadOptions): Promise<void> {
    this.setStatus(EngineStatus.LOADING)
    this.logger.info(`[Engine] Loading project: ${projectPath}`)

    this._gameProjectResource = new GameProjectResource(projectPath, {
      preloadAllSpriteSets: options?.preloadAllSpriteSets ?? true,
      preloadAllMaps: options?.preloadAllMaps ?? false,
    })

    const loader = new Loader([this._gameProjectResource])
    // Excalibur's `Loader` exposes events via an untyped `on` method; we wrap
    // it in a narrow interface so each handler receives a typed payload.
    const loaderEvents = loader as unknown as {
      on<E extends keyof LoaderEventMap>(name: E, handler: (payload: LoaderEventMap[E]) => void): void
    }

    loaderEvents.on('progress', (event) => {
      if (typeof event?.progress === 'number') {
        this.logger.debug(`Loading progress: ${Math.round(event.progress * 100)}%`)
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

    const objectLibrary = this._gameProjectResource.data?.objectLibrary ?? []
    const newMapScene = new MapScene(mapResource, this.events, objectLibrary)

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

  /**
   * Set the active editor tool. Writes to the session-singleton on
   * the currently-active `MapScene` so the `TileEditorSystem` reads
   * it directly via `SessionState.get`. No-op when no `MapScene` is
   * active yet.
   */
  setActiveTool(tool: EditorTool): void {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return
    SessionState.set(scene, new ActiveToolComponent(tool))
  }

  /** Read the currently-active editor tool from the session-singleton. */
  getActiveTool(): EditorTool | null {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return null
    return SessionState.get(scene, ActiveToolComponent)?.tool ?? null
  }

  /**
   * Set the active tile sprite id (global = local sprite index +
   * sprite-set's `firstGid`). Lives on the session-singleton.
   */
  setActiveTile(spriteId: number): void {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return
    SessionState.set(scene, new ActiveTileComponent(spriteId))
  }

  getActiveTile(): number | null {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return null
    return SessionState.get(scene, ActiveTileComponent)?.spriteId ?? null
  }

  /** Set the active layer for tile painting. Matches a `LayerData.id`. */
  setActiveLayer(layerId: string): void {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return
    SessionState.set(scene, new ActiveLayerComponent(layerId))
  }

  getActiveLayer(): string | null {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return null
    return SessionState.get(scene, ActiveLayerComponent)?.layerId ?? null
  }

  /**
   * Replace the current placement selection. Passing an empty array
   * (or never calling this) means "nothing selected". Callers don't
   * need to distinguish between absent component and empty array —
   * `getSelectedPlacements()` collapses both to `[]`.
   */
  setSelectedPlacements(placementIds: readonly string[]): void {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return
    if (placementIds.length === 0) {
      SessionState.unset(scene, SelectedPlacementsComponent)
      return
    }
    SessionState.set(scene, new SelectedPlacementsComponent([...placementIds]))
  }

  /** Current placement-selection. Empty array when no selection. */
  getSelectedPlacements(): string[] {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return []
    return SessionState.get(scene, SelectedPlacementsComponent)?.placementIds ?? []
  }

  /**
   * Execute a {@link Command} against the current scene and push it
   * onto the undo stack. If the user previously undid and the cursor
   * is mid-stack, the redo tail is truncated (the abandoned branch
   * cannot be re-redone).
   *
   * No-op when no `MapScene` is active.
   */
  executeCommand(command: Command): void {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return
    command.apply(scene)

    const existing = SessionState.get(scene, UndoStackComponent)
    if (existing) {
      existing.commands = existing.commands.slice(0, existing.cursor)
      existing.commands.push(command)
      existing.cursor = existing.commands.length
      SessionState.notifyMutation(scene, existing)
    } else {
      SessionState.set(scene, new UndoStackComponent([command], 1))
    }
  }

  /**
   * Undo the most recent applied command. Reverts the command, drops
   * the cursor by one, fires the `notifyMutation` so subscribers
   * refresh button enabled-states. No-op when `!canUndo()`.
   */
  undo(): boolean {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return false
    const stack = SessionState.get(scene, UndoStackComponent)
    if (!stack || !stack.canUndo) return false
    const command = stack.commands[stack.cursor - 1]
    if (!command) return false
    command.revert(scene)
    stack.cursor -= 1
    SessionState.notifyMutation(scene, stack)
    return true
  }

  /**
   * Redo the next command in the stack (if any). Re-applies the
   * command and advances the cursor. No-op when `!canRedo()`.
   */
  redo(): boolean {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return false
    const stack = SessionState.get(scene, UndoStackComponent)
    if (!stack || !stack.canRedo) return false
    const command = stack.commands[stack.cursor]
    if (!command) return false
    command.apply(scene)
    stack.cursor += 1
    SessionState.notifyMutation(scene, stack)
    return true
  }

  canUndo(): boolean {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return false
    return SessionState.get(scene, UndoStackComponent)?.canUndo ?? false
  }

  canRedo(): boolean {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return false
    return SessionState.get(scene, UndoStackComponent)?.canRedo ?? false
  }

  /**
   * Toggle a layer's `visible` flag on the active map. Persists the
   * change in-memory only (the host is responsible for serialising
   * `MapResource.mapData` back to disk via `MapFormat.serialize`),
   * then refreshes everything that renders from the layer:
   *
   * - **Tile graphics** on every `TileMap` in the scene — sprites
   *   painted on the tilemap rebuild via `refreshAllTileGraphics`
   *   which already filters hidden layers.
   * - **Object placements** — actors spawned by `ObjectSpawnSystem`
   *   for `MapData.objectPlacements` get their `graphics.visible`
   *   flipped. A single layer can carry both, so both surfaces
   *   have to flip together.
   *
   * Returns `true` on success, `false` if there is no active
   * `MapScene` / no layer matches the id.
   *
   * O(columns × rows × sprites-per-tile + placements) — only
   * called on explicit user toggles, not per frame.
   */
  setLayerVisible(layerId: string, visible: boolean): boolean {
    const layer = this._findLayer(layerId)
    if (!layer || layer.visible === visible) return layer != null
    layer.visible = visible
    const scene = this.excalibur.currentScene as MapScene
    const mapResource = scene.mapResource
    for (const entity of scene.world.entityManager.entities) {
      if (entity instanceof TileMap) {
        refreshAllTileGraphics(entity, mapResource)
        continue
      }
      const transform = entity.get(TileTransformComponent)
      if (transform?.layerId === layerId && entity instanceof Actor) {
        entity.graphics.visible = visible
      }
    }
    return true
  }

  /**
   * Toggle a layer's `locked` flag on the active map. Pure editor
   * state — no graphics rebuild needed because rendering doesn't
   * care about lock. Consumers (host + `TileEditorSystem`) check the
   * flag at the start of their edit paths and short-circuit when
   * the active layer is locked.
   *
   * Returns `true` on success, `false` if there is no active
   * `MapScene` / no layer matches the id.
   */
  setLayerLocked(layerId: string, locked: boolean): boolean {
    const layer = this._findLayer(layerId)
    if (!layer || (layer.locked ?? false) === locked) return layer != null
    layer.locked = locked
    return true
  }

  /**
   * Read the `locked` flag on a specific layer. Used by the host to
   * decide whether to enable the editing tool actions in response to
   * an `ActiveLayerComponent` change. Returns `false` on missing
   * layer / scene — "treat as editable" is the safer default for an
   * unknown id (the paint path will then no-op via
   * `TileEditorSystem`'s own checks).
   */
  isLayerLocked(layerId: string): boolean {
    return this._findLayer(layerId)?.locked ?? false
  }

  /**
   * Resolve a `LayerData` on the active `MapScene` by id. Returns
   * `null` when there is no active `MapScene`, no loaded map data,
   * or the layer id doesn't match anything in the current map.
   * Centralised so the three `setLayer…` / `isLayer…` methods agree
   * on what "active map" means.
   */
  private _findLayer(layerId: string) {
    const scene = this.excalibur.currentScene
    if (!(scene instanceof MapScene)) return null
    return scene.mapResource?.mapData?.layers.find((l) => l.id === layerId) ?? null
  }

  /**
   * Subscribe to undo-stack changes on the **currently-active** scene.
   * Fires once synchronously with the present `canUndo` / `canRedo`
   * snapshot (or `false, false` when no `MapScene` is active yet), and
   * again on every stack mutation. Also rebinds across map switches —
   * subscribers do not need to re-register after a `loadMap` call.
   *
   * Returns a disposer that drops both the inner `SessionState`
   * subscription and the `MAP_LOADED` listener.
   *
   * Use case: keeping `win.undo` / `win.redo` `GAction.enabled` in
   * sync with the stack so the OSD buttons + accelerator keys grey
   * out at the boundaries.
   */
  onUndoStackChanged(cb: (state: { canUndo: boolean; canRedo: boolean }) => void): () => void {
    let inner: (() => void) | null = null
    const rebind = () => {
      inner?.()
      inner = null
      const scene = this.excalibur.currentScene
      if (!(scene instanceof MapScene)) {
        cb({ canUndo: false, canRedo: false })
        return
      }
      inner = SessionState.subscribe(scene, UndoStackComponent, (stack) => {
        cb({ canUndo: stack?.canUndo ?? false, canRedo: stack?.canRedo ?? false })
      })
    }
    rebind()
    const mapSub = this.events.on(EngineEvent.MAP_LOADED, () => rebind())
    return () => {
      inner?.()
      mapSub.close()
    }
  }

  private setStatus(status: EngineStatus): void {
    if (this.status === status) return
    this.logger.info(`Engine status changed from ${this.status} to ${status}`)
    this.status = status
    this.events.emit(EngineEvent.STATUS_CHANGED, { status })
  }

}

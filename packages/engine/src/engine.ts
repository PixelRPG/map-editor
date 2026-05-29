import { Actor, Color, DisplayMode, EventEmitter, Engine as ExcaliburEngine, Loader, Logger, TileMap, Vector } from 'excalibur'
import type { Command } from './commands/index.ts'
import {
  ActiveLayerComponent,
  ActiveTileComponent,
  ActiveToolComponent,
  type EditorTool,
  EditorModeComponent,
  type EditorViewMode,
  EditorViewModeComponent,
  RuntimeModeComponent,
  SelectedPlacementsComponent,
  TileMapTierComponent,
  TileTransformComponent,
  UndoStackComponent,
} from './components/index.ts'
import { GameProjectResource } from './resource/GameProjectResource.ts'
import { MapScene } from './scenes/map.scene.ts'
import { applyEditorViewMode } from './services/editor-view.ts'
import { refreshAllTileGraphics } from './services/tile-graphics.manager.ts'
import { DEFAULT_LAYER_TIER } from './types/data/LayerData.ts'
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
    // `GameProjectResource._registerBuiltIns` auto-seeds the scientist
    // when the project has no `characters[]` configured, so this is
    // populated for every loaded project. Cast view edits flow through
    // the same data → next `loadMap` picks up the new player.
    const playerCharacter = this._gameProjectResource.data?.characters?.find((c) => c.isPlayer)
    // Resolve the player's sprite-set directly from the project. We
    // cannot rely on `MapResource.getSpriteSetResource` because that
    // map only copies in the sprite-sets the map JSON references —
    // the scientist (and any other character-only sprite-set) is on
    // the project but not on the map. Look it up at the project
    // level and pass it through.
    const playerSpriteSet = playerCharacter
      ? this._gameProjectResource.spriteSets.get(playerCharacter.spriteSetId)
      : undefined
    const newMapScene = new MapScene(
      mapResource,
      this.events,
      objectLibrary,
      playerCharacter,
      playerSpriteSet,
    )

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
    const scene = this._activeMapScene()
    if (!scene) return
    SessionState.set(scene, new ActiveToolComponent(tool))
  }

  /** Read the currently-active editor tool from the session-singleton. */
  getActiveTool(): EditorTool | null {
    const scene = this._activeMapScene()
    if (!scene) return null
    return SessionState.get(scene, ActiveToolComponent)?.tool ?? null
  }

  /**
   * Set the active tile sprite id (global = local sprite index +
   * sprite-set's `firstGid`). Lives on the session-singleton.
   */
  setActiveTile(spriteId: number): void {
    const scene = this._activeMapScene()
    if (!scene) return
    SessionState.set(scene, new ActiveTileComponent(spriteId))
  }

  getActiveTile(): number | null {
    const scene = this._activeMapScene()
    if (!scene) return null
    return SessionState.get(scene, ActiveTileComponent)?.spriteId ?? null
  }

  /** Set the active layer for tile painting. Matches a `LayerData.id`. */
  setActiveLayer(layerId: string): void {
    const scene = this._activeMapScene()
    if (!scene) return
    SessionState.set(scene, new ActiveLayerComponent(layerId))
    // Grid mode dims non-active layers — switching the active layer
    // changes which layer's content stays at full opacity. No-op when
    // grid mode is off (the helper short-circuits on `mode === 'normal'`
    // by returning 1.0 from its opacity provider).
    if (SessionState.get(scene, EditorViewModeComponent)?.mode === 'grid') {
      applyEditorViewMode(scene)
    }
  }

  getActiveLayer(): string | null {
    const scene = this._activeMapScene()
    if (!scene) return null
    return SessionState.get(scene, ActiveLayerComponent)?.layerId ?? null
  }

  /**
   * Replace the current placement selection. Passing an empty array
   * (or never calling this) means "nothing selected". Callers don't
   * need to distinguish between absent component and empty array —
   * `getSelectedPlacements()` collapses both to `[]`.
   */
  setSelectedPlacements(placementIds: readonly string[]): void {
    const scene = this._activeMapScene()
    if (!scene) return
    if (placementIds.length === 0) {
      SessionState.unset(scene, SelectedPlacementsComponent)
      return
    }
    SessionState.set(scene, new SelectedPlacementsComponent([...placementIds]))
  }

  /** Current placement-selection. Empty array when no selection. */
  getSelectedPlacements(): string[] {
    const scene = this._activeMapScene()
    if (!scene) return []
    return SessionState.get(scene, SelectedPlacementsComponent)?.placementIds ?? []
  }

  /**
   * Smoothly pan the camera so the tile centre of the placement
   * with id `placementId` becomes the viewport centre. Uses
   * Excalibur's `Camera.move` with `EaseInOutCubic` easing — the
   * default duration of 400ms reads as a clear "the editor moved
   * me" cue without dragging on long enough to be annoying when
   * stepping through a list of objects.
   *
   * No-op (returns `false`) when there's no active `MapScene`, no
   * loaded map data, or the placement id doesn't match anything in
   * the current map. Returned promise resolves `true` when the
   * pan completes (or `false` if Excalibur's `move()` rejects, e.g.
   * because the camera is currently following an actor).
   */
  async focusOnPlacement(placementId: string, durationMs = 400): Promise<boolean> {
    const scene = this._activeMapScene()
    if (!scene) return false
    const mapData = scene.mapResource?.mapData
    if (!mapData) return false
    const placement = mapData.objectPlacements?.find((p) => p.id === placementId)
    if (!placement) return false
    const tileWidth = mapData.tileWidth ?? 16
    const tileHeight = mapData.tileHeight ?? 16
    const target = new Vector(
      placement.tileX * tileWidth + tileWidth / 2,
      placement.tileY * tileHeight + tileHeight / 2,
    )
    try {
      await scene.camera.move(target, durationMs)
      return true
    } catch {
      return false
    }
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
    const scene = this._activeMapScene()
    if (!scene) return
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

    // Tell collab consumers (SessionController) so they can relay this
    // local command as an `Operation` to peers. Note: remote commands
    // applied via `applyRemoteCommand` deliberately skip this emit to
    // avoid a feedback loop.
    this.events.emit(EngineEvent.COMMAND_EXECUTED, { command })
  }

  /**
   * Apply a command that arrived from a remote peer over a
   * `PeerSession`. Mirrors {@link executeCommand}'s apply step
   * but deliberately
   *
   *  - does NOT push to the undo stack (each peer owns its own
   *    undo history; remote commands are not undoable locally), and
   *  - does NOT emit `COMMAND_EXECUTED` (would relay the command
   *    back through `SessionController` and bounce indefinitely).
   *
   * No-op when no `MapScene` is active.
   */
  applyRemoteCommand(command: Command): void {
    const scene = this._activeMapScene()
    if (!scene) return
    command.apply(scene)
  }

  /**
   * Resolve `(scene, stack)` for the active map, or `null` when there
   * is no active map scene or no undo stack on it. Callers gate on a
   * single tuple lookup instead of duplicating the scene + component
   * fetch across every undo/redo entry point.
   */
  private _undoContext(): { scene: MapScene; stack: UndoStackComponent } | null {
    const scene = this._activeMapScene()
    if (!scene) return null
    const stack = SessionState.get(scene, UndoStackComponent)
    if (!stack) return null
    return { scene, stack }
  }

  /**
   * Undo the most recent applied command. Reverts the command, drops
   * the cursor by one, fires the `notifyMutation` so subscribers
   * refresh button enabled-states. No-op when `!canUndo()`.
   */
  undo(): boolean {
    const ctx = this._undoContext()
    if (!ctx || !ctx.stack.canUndo) return false
    const command = ctx.stack.commands[ctx.stack.cursor - 1]
    if (!command) return false
    command.revert(ctx.scene)
    ctx.stack.cursor -= 1
    SessionState.notifyMutation(ctx.scene, ctx.stack)
    return true
  }

  /**
   * Redo the next command in the stack (if any). Re-applies the
   * command and advances the cursor. No-op when `!canRedo()`.
   */
  redo(): boolean {
    const ctx = this._undoContext()
    if (!ctx || !ctx.stack.canRedo) return false
    const command = ctx.stack.commands[ctx.stack.cursor]
    if (!command) return false
    command.apply(ctx.scene)
    ctx.stack.cursor += 1
    SessionState.notifyMutation(ctx.scene, ctx.stack)
    return true
  }

  canUndo(): boolean {
    return this._undoContext()?.stack.canUndo ?? false
  }

  canRedo(): boolean {
    return this._undoContext()?.stack.canRedo ?? false
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
    // `_findLayer` succeeded above, which only returns non-null when a
    // MapScene is active — so this lookup is guaranteed to hit.
    const scene = this._activeMapScene()
    if (!scene) return false
    const mapResource = scene.mapResource
    // Refresh only the tilemap that hosts the toggled layer — its
    // tier alone needs the visibility filter re-applied. The other
    // tier tilemaps don't carry the layer's sprites, so iterating
    // them would be a no-op-with-cost.
    const targetTier = layer.tier ?? DEFAULT_LAYER_TIER
    for (const entity of scene.world.entityManager.entities) {
      if (entity instanceof TileMap) {
        if (entity.get(TileMapTierComponent)?.tier === targetTier) {
          refreshAllTileGraphics(entity, mapResource)
        }
        continue
      }
      // Placement actors (decoration objects spawned by
      // `ObjectSpawnSystem`). The visibility flip is independent of
      // tier — placements carry the canonical `layerId` on
      // `TileTransformComponent`, so just match by layer.
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
    const scene = this._activeMapScene()
    if (!scene) return null
    return scene.mapResource?.mapData?.layers.find((l) => l.id === layerId) ?? null
  }

  /**
   * Active `MapScene` or `null` if Excalibur's current scene isn't
   * a map (boot screen, loader, etc.). Centralises the
   * `instanceof MapScene` narrowing so consumers can early-out on
   * a single line and TypeScript sees a fully-narrowed scene.
   */
  private _activeMapScene(): MapScene | null {
    const scene = this.excalibur.currentScene
    return scene instanceof MapScene ? scene : null
  }

  /**
   * Switch the editor view mode on the active `MapScene`.
   *
   * `'normal'` — render like the game would (no grid lines, full
   * opacity).
   * `'grid'`   — debug grid lines on every tilemap + non-active
   * layers dimmed to {@link GRID_MODE_DIM_OPACITY}. The dimming
   * follows {@link setActiveLayer} automatically.
   *
   * Excalibur's debug renderer carries the grid; we configure
   * `engine.debug.tilemap.showGrid` true + every other debug
   * visualisation off so the editor doesn't accidentally show
   * physics colliders.
   *
   * No-op if the active scene isn't a `MapScene`.
   */
  setEditorViewMode(mode: EditorViewMode): void {
    const scene = this._activeMapScene()
    if (!scene) return
    const current = SessionState.get(scene, EditorViewModeComponent)?.mode ?? 'normal'
    if (current === mode) return
    SessionState.set(scene, new EditorViewModeComponent(mode))
    this._configureExcaliburDebugForViewMode(mode)
    applyEditorViewMode(scene)
  }

  getEditorViewMode(): EditorViewMode {
    const scene = this._activeMapScene()
    if (!scene) return 'normal'
    return SessionState.get(scene, EditorViewModeComponent)?.mode ?? 'normal'
  }

  /**
   * Toggle between editor and runtime mode on the active `MapScene`.
   *
   * - `active === true`  — remove `EditorModeComponent`, set
   *   `RuntimeModeComponent`. `PlayerSystem` reveals the player Actor,
   *   reads input each frame, and locks the camera to follow.
   * - `active === false` — opposite. Player hidden, camera unlocked,
   *   editor tool systems run again.
   *
   * Position state is continuous across toggles — the player actor
   * stays at its last position, so re-entering runtime feels seamless.
   *
   * No-op when no `MapScene` is active.
   */
  setRuntimeMode(active: boolean): void {
    const scene = this._activeMapScene()
    if (!scene) return
    if (active) {
      SessionState.unset(scene, EditorModeComponent)
      SessionState.set(scene, new RuntimeModeComponent())
    } else {
      SessionState.unset(scene, RuntimeModeComponent)
      SessionState.set(scene, new EditorModeComponent())
    }
  }

  /** Current runtime-mode state on the active scene (`false` if no scene). */
  isRuntimeMode(): boolean {
    const scene = this._activeMapScene()
    if (!scene) return false
    return SessionState.get(scene, RuntimeModeComponent) !== null
  }

  /**
   * Re-apply `tile.solid` for every placement of a sprite definition
   * on the active map. Called by the host (Tiles tab Solid toggle) so
   * that flipping a sprite's `solid` flag in the sprite-set takes
   * effect immediately — no engine reload, no scene rebuild. Without
   * this the change only matters on the next map load.
   *
   * No-op when no `MapScene` is active.
   */
  refreshTileSolidsForSprite(spriteSetId: string, spriteId: number): void {
    const scene = this._activeMapScene()
    if (!scene) return
    scene.mapResource.refreshTileSolidsForSprite(spriteSetId, spriteId)
  }

  /**
   * Subscribe to view-mode changes. Fires once synchronously with
   * the current value (or `'normal'` when no scene is active), then
   * again on every `setEditorViewMode` call. Rebinds across map
   * switches like {@link onUndoStackChanged}.
   */
  onEditorViewModeChanged(cb: (mode: EditorViewMode) => void): () => void {
    let inner: (() => void) | null = null
    const rebind = () => {
      inner?.()
      inner = null
      const scene = this._activeMapScene()
      if (!scene) {
        cb('normal')
        return
      }
      inner = SessionState.subscribe(scene, EditorViewModeComponent, (component) => {
        cb(component?.mode ?? 'normal')
      })
    }
    rebind()
    const mapSub = this.events.on(EngineEvent.MAP_LOADED, () => rebind())
    return () => {
      inner?.()
      mapSub.close()
    }
  }

  /**
   * Tweak Excalibur's debug-render config + flip the global debug
   * flag depending on whether the editor wants the grid drawn.
   *
   * Disables every debug visualisation that isn't the tilemap grid
   * so the editor surface stays clean — no collider boxes, no
   * camera viewport rectangles. Done as a single block (rather
   * than scattered field touches) so toggling between modes is a
   * predictable reset, not a sticky-accumulating set of debug
   * flags from prior toggles.
   */
  private _configureExcaliburDebugForViewMode(mode: EditorViewMode): void {
    if (mode === 'grid') {
      const debug = this.excalibur.debug
      debug.tilemap.showAll = false
      debug.tilemap.showGrid = true
      debug.tilemap.gridColor = Color.fromHex('#ffffff66')
      debug.tilemap.gridWidth = 1
      debug.tilemap.showSolidBounds = false
      debug.tilemap.showColliderGeometry = false
      // Other categories: hard off — we only want the tilemap grid.
      debug.entity.showAll = false
      debug.collider.showAll = false
      debug.body.showAll = false
      debug.camera.showAll = false
      this.excalibur.showDebug(true)
    } else {
      this.excalibur.showDebug(false)
    }
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
      const scene = this._activeMapScene()
      if (!scene) {
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

  /**
   * Subscribe to the primary pointer's world-space position.
   *
   * Used by the awareness layer to broadcast the local user's cursor
   * to remote peers. Fires on every Excalibur `pointermove` — the
   * caller is expected to throttle (the {@link AwarenessManager}
   * does, via `cursorThrottleMs`).
   *
   * Payload carries the **scene-local world coordinates** (already
   * camera/zoom-resolved by Excalibur's `screenToWorldCoordinates`)
   * plus the `sceneId` (== map id) so the receiver can drop frames
   * for scenes it is not currently viewing.
   *
   * Returns the disposer; calling it disconnects the `pointer.on`
   * subscription. No-op when no scene is active yet (the
   * subscription rebinds via `MAP_LOADED` so a caller that
   * subscribes before the first map loads still gets events once
   * one does).
   */
  onPointerMoved(
    cb: (event: { sceneId: string; worldX: number; worldY: number }) => void,
  ): () => void {
    let disposeMove: (() => void) | null = null
    const rebind = () => {
      disposeMove?.()
      disposeMove = null
      const pointer = this.excalibur?.input?.pointers?.primary
      if (!pointer) return
      const handler = (event: { screenPos: { x: number; y: number } }) => {
        const scene = this._activeMapScene()
        if (!scene) return
        const sceneId = scene.mapResource.mapData.id
        if (!sceneId) return
        const world = this.excalibur.screen.screenToWorldCoordinates(
          new Vector(event.screenPos.x, event.screenPos.y),
        )
        cb({ sceneId, worldX: world.x, worldY: world.y })
      }
      pointer.on('move', handler)
      disposeMove = () => pointer.off('move', handler)
    }
    rebind()
    const mapSub = this.events.on(EngineEvent.MAP_LOADED, () => rebind())
    return () => {
      disposeMove?.()
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

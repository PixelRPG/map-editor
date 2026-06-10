import {
  Actor,
  Color,
  DisplayMode,
  EventEmitter,
  Engine as ExcaliburEngine,
  Loader,
  Logger,
  Rectangle,
  TileMap,
  Vector,
} from 'excalibur'
import { type Command, PlaceObjectCommand } from './commands/index.ts'
import {
  ActiveLayerComponent,
  ActiveObjectComponent,
  ActiveTileComponent,
  ActiveToolComponent,
  EditorModeComponent,
  type EditorTool,
  type EditorViewFlags,
  EditorViewModeComponent,
  RuntimeModeComponent,
  SelectedPlacementsComponent,
  TileMapTierComponent,
  TileTransformComponent,
  UndoStackComponent,
} from './components/index.ts'
import { entityToCharacter } from './entity/convert.ts'
import { GameProjectResource } from './resource/GameProjectResource.ts'
import { MapScene } from './scenes/map.scene.ts'
import { executeCommandOnScene } from './services/command-dispatch.ts'
import { applyEditorViewMode } from './services/editor-view.ts'
import { refreshAllTileGraphics } from './services/tile-graphics.manager.ts'
import { buildTilePaintCommand, findTileMapForLayer } from './services/tile-paint.service.ts'
import {
  AwarenessManager,
  type AwarenessMessage,
  type AwarenessPeerInfo,
  parseAwarenessColour,
  RemoteCursorRenderer,
} from './sync/index.ts'
import { DEFAULT_LAYER_TIER } from './types/data/LayerData.ts'
import { EngineEvent, type EngineEventMap, EngineStatus, type ProjectLoadOptions } from './types/index.ts'
import { SessionState } from './utils/session-state.ts'
import { canRedo, canUndo } from './utils/undo-stack.utils.ts'

interface LoaderEventMap {
  progress: { progress: number }
  error: unknown
  complete: undefined
  afterload: undefined
}

/** Stable peer id for the in-process AI assistant collaborator. */
export const ASSISTANT_PEER_ID = 'ai-assistant'

export class Engine {
  public status: EngineStatus = EngineStatus.INITIALIZING
  public readonly events = new EventEmitter<EngineEventMap>()

  public readonly excalibur: ExcaliburEngine
  private _gameProjectResource: GameProjectResource | null = null
  private logger = Logger.getInstance()

  // Local virtual-collaborator presence (the AI assistant). A
  // session-less AwarenessManager + RemoteCursorRenderer let an
  // in-process peer (driven over D-Bus/MCP) render a cursor without any
  // CollabSession / WebRTC. See docs/concepts/ai-collaborator.md.
  private _assistantAwareness: AwarenessManager | null = null
  private _assistantRenderer: RemoteCursorRenderer | null = null
  private _assistantInfo: AwarenessPeerInfo = { displayName: 'AI Assistant', color: '#9141ac' }
  // True while the assistant is present (info/cursor set, not hidden) —
  // gates the edit-attribution flash so plain paintTileAt callers (tests)
  // don't grow stray highlight actors.
  private _assistantActive = false
  // User-controlled pause: while paused, the assistant's cursor + paints
  // are rejected (the human stays in control). Presence (the pill) stays
  // so the user can resume.
  private _assistantPaused = false
  // Opt-in: pan the camera to follow the assistant's cursor so the user
  // can watch it work without manually scrolling. Off by default — we
  // don't yank the view around unless asked.
  private _followAssistant = false
  // Smooth camera-follow target (world space) or null when not following.
  // Updated cheaply on every followed-peer cursor move; the camera eases
  // toward it each frame (see `_tickCameraFollow`) so following a fast
  // cursor reads as a smooth glide, not a hectic per-update jump.
  private _followTarget: Vector | null = null
  // When a networked CollabSession is active, the app sets this so the
  // assistant's presence/cursor are relayed to remote peers too (the AI
  // shows up as a peer to networked humans). The AI's *edits* already
  // propagate via the shared op-log; this carries its cursor/presence.
  private _assistantFrameRelay: ((message: AwarenessMessage) => void) | null = null

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

    // Smooth camera-follow: ease the camera toward `_followTarget` every
    // frame rather than issuing a fresh `camera.move` tween per cursor
    // update (which fought itself and looked hectic).
    this.excalibur.on('postupdate', (evt: { elapsed?: number; delta?: number }) =>
      this._tickCameraFollow(evt.elapsed ?? evt.delta ?? 16),
    )
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

    const projectData = this._gameProjectResource.data
    const entityLibrary = projectData?.entityLibrary ?? []
    // The player is the entity named by `playerActorId`, mapped to the
    // flat character view model `PlayerSystem` consumes. Projects ship a
    // starter character (the scientist); if none is set the scene falls
    // back to a procedural placeholder. Cast view edits flow through the
    // same data → next `loadMap` picks up the new player.
    const playerEntity = projectData?.playerActorId
      ? entityLibrary.find((e) => e.id === projectData.playerActorId)
      : undefined
    const playerCharacter = playerEntity
      ? (entityToCharacter(playerEntity, projectData?.playerActorId) ?? undefined)
      : undefined
    // Resolve the player's sprite-set directly from the project. We
    // cannot rely on `MapResource.getSpriteSetResource` because that
    // map only copies in the sprite-sets the map JSON references —
    // the scientist (and any other character-only sprite-set) is on
    // the project but not on the map. Look it up at the project
    // level and pass it through.
    const playerSpriteSet = playerCharacter
      ? this._gameProjectResource.spriteSets.get(playerCharacter.spriteSetId)
      : undefined
    const newMapScene = new MapScene(mapResource, this.events, entityLibrary, playerCharacter, playerSpriteSet)

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
    this._assistantRenderer?.close()
    this._assistantRenderer = null
    this._assistantAwareness = null
    this._assistantFrameRelay = null
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

  /**
   * Set the "object brush" — the entity-library definition id the
   * `'object'` tool stamps on click. `null` clears it. Lives on the
   * session-singleton (see {@link ActiveObjectComponent}).
   */
  setObjectBrush(defId: string | null): void {
    const scene = this._activeMapScene()
    if (!scene) return
    SessionState.set(scene, new ActiveObjectComponent(defId))
  }

  getObjectBrush(): string | null {
    const scene = this._activeMapScene()
    if (!scene) return null
    return SessionState.get(scene, ActiveObjectComponent)?.defId ?? null
  }

  /** Set the active layer for tile painting. Matches a `LayerData.id`. */
  setActiveLayer(layerId: string): void {
    const scene = this._activeMapScene()
    if (!scene) return
    SessionState.set(scene, new ActiveLayerComponent(layerId))
    // The `dimInactiveLayers` flag dims non-active layers — switching
    // the active layer changes which layer's content stays at full
    // opacity. No-op when the flag is off (the helper short-circuits
    // on `dim === false` by returning 1.0 from its opacity provider).
    if (SessionState.get(scene, EditorViewModeComponent)?.dimInactiveLayers) {
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
    executeCommandOnScene(scene, this.events, command)
  }

  /**
   * Paint (or erase) a tile at `(tileX, tileY)` programmatically — the
   * headless equivalent of a pointer click, for external tooling
   * (D-Bus/MCP) and scripted edits. Routes through {@link executeCommand}
   * (the shared {@link buildTilePaintCommand}), so undo/redo + collab
   * op-sync behave exactly like a user paint.
   *
   * - `layerId` null/omitted → the active layer.
   * - `spriteId` omitted → the active tile; `0`/`null` → erase; else paint
   *   that global tile id.
   *
   * Returns `false` if there's no active map, no resolvable layer, the
   * layer is locked, or the coords are out of bounds.
   */
  paintTileAt(layerId: string | null, tileX: number, tileY: number, spriteId?: number | null): boolean {
    // The user paused the assistant — reject its paints (the human is in control).
    if (this._assistantPaused) return false
    const scene = this._activeMapScene()
    if (!scene) return false
    const resolvedLayer = layerId ?? this.getActiveLayer()
    if (!resolvedLayer) return false
    if (this.isLayerLocked(resolvedLayer)) return false
    const found = findTileMapForLayer(scene, resolvedLayer)
    if (!found) return false
    if (tileX < 0 || tileY < 0 || tileX >= found.tileMap.columns || tileY >= found.tileMap.rows) return false
    const resolvedSprite = spriteId === undefined ? this.getActiveTile() : spriteId
    this.executeCommand(buildTilePaintCommand(found.editor, resolvedLayer, tileX, tileY, resolvedSprite ?? null))
    // Attribution: flash the painted tile in the assistant's colour so the
    // user sees the AI act. Only while the assistant is present.
    if (this._assistantActive) this._flashAssistantTile(found.tileMap, tileX, tileY)
    return true
  }

  /**
   * Place a library object on the active map programmatically (Control →
   * MCP, or the AI collaborator) — the driveable equivalent of the object
   * tool's canvas click. Goes through {@link PlaceObjectCommand} so it
   * undoes + syncs to peers. `layerId` null → the active layer. Returns
   * `false` if there's no active map, no resolvable / unlocked layer, or
   * `defId` isn't in the project's entity library.
   */
  placeObjectAt(defId: string, layerId: string | null, tileX: number, tileY: number): boolean {
    if (this._assistantPaused) return false
    const scene = this._activeMapScene()
    if (!scene) return false
    const resolvedLayer = layerId ?? this.getActiveLayer()
    if (!resolvedLayer) return false
    if (this.isLayerLocked(resolvedLayer)) return false
    if (!scene.entityLibrary.some((e) => e.id === defId)) return false
    const placement = {
      id: `obj_${tileX}_${tileY}_${Math.random().toString(36).slice(2, 8)}`,
      layerId: resolvedLayer,
      tileX,
      tileY,
      defId,
    }
    this.executeCommand(new PlaceObjectCommand({ placement }))
    return true
  }

  // ──────────────────────────────────────────────────────────────
  // AI assistant — in-process virtual collaborator presence/cursor
  // (see docs/concepts/ai-collaborator.md)
  // ──────────────────────────────────────────────────────────────

  /**
   * Show (or move) the AI assistant's cursor at tile `(tileX, tileY)` on
   * the active map — rendered by the same `RemoteCursorRenderer` a human
   * peer's cursor uses, but fed from a local session-less awareness
   * channel (no CollabSession / WebRTC). Returns `false` if no map/scene
   * is active. Coordinates are tile cells; converted to the world centre
   * of the tile for rendering.
   */
  setAssistantCursor(tileX: number, tileY: number): boolean {
    if (this._assistantPaused) return false
    const scene = this._activeMapScene()
    const mapId = scene?.mapResource?.mapData?.id
    if (!scene || !mapId) return false
    const tm = this._anyTileMap(scene)
    if (!tm) return false
    const worldX = tm.pos.x + (tileX + 0.5) * tm.tileWidth
    const worldY = tm.pos.y + (tileY + 0.5) * tm.tileHeight
    const aware = this._ensureAssistant()
    this._assistantActive = true
    const presence: AwarenessMessage = { type: 'presence', peerId: ASSISTANT_PEER_ID, info: this._assistantInfo }
    const cursor: AwarenessMessage = {
      type: 'cursor',
      peerId: ASSISTANT_PEER_ID,
      cursor: { sceneId: mapId, x: worldX, y: worldY },
    }
    aware.handleInbound(presence)
    aware.handleInbound(cursor)
    // Relay to networked peers too (no-op when no session is wired).
    this._assistantFrameRelay?.(presence)
    this._assistantFrameRelay?.(cursor)
    // Opt-in follow: ease the camera toward the assistant (smooth glide).
    if (this._followAssistant) this.panCameraTo(worldX, worldY)
    return true
  }

  /** Update the AI assistant's display name + colour (re-announced immediately). */
  setAssistantInfo(displayName: string, color: string): void {
    this._assistantInfo = { displayName, color }
    this._assistantActive = true
    const presence: AwarenessMessage = { type: 'presence', peerId: ASSISTANT_PEER_ID, info: this._assistantInfo }
    this._ensureAssistant().handleInbound(presence)
    this._assistantFrameRelay?.(presence)
  }

  /** Remove the AI assistant's cursor/presence from the canvas. */
  hideAssistant(): void {
    this._assistantActive = false
    const leave: AwarenessMessage = { type: 'leave', peerId: ASSISTANT_PEER_ID }
    this._assistantAwareness?.handleInbound(leave)
    this._assistantFrameRelay?.(leave)
  }

  /**
   * Wire (or clear with `null`) a relay that forwards the assistant's
   * awareness frames to remote peers — set by the app to the active
   * `CollabSession`'s awareness so networked humans see the AI's cursor.
   */
  setAssistantFrameRelay(relay: ((message: AwarenessMessage) => void) | null): void {
    this._assistantFrameRelay = relay
  }

  /** Whether the assistant is currently present (cursor/info set, not hidden). */
  isAssistantActive(): boolean {
    return this._assistantActive
  }

  /** Whether the user has paused the assistant. */
  isAssistantPaused(): boolean {
    return this._assistantPaused
  }

  /** Pause/resume the assistant. While paused, its cursor + paints are rejected. */
  setAssistantPaused(paused: boolean): void {
    this._assistantPaused = paused
  }

  /** Toggle camera-follow of the assistant cursor (off by default). */
  setFollowAssistant(follow: boolean): void {
    this._followAssistant = follow
  }

  /**
   * Set the smooth camera-follow target to world point `(x, y)`. Used to
   * follow ANY collaborator (human peer or the AI) the user selected in
   * the participants toolbar — the app feeds the followed peer's awareness
   * cursor (already world-space) here on each move. The camera eases
   * toward it in `_tickCameraFollow`, so rapid updates glide instead of
   * snapping.
   */
  panCameraTo(worldX: number, worldY: number): void {
    this._followTarget = new Vector(worldX, worldY)
  }

  /** Stop following — the camera stays where it is and responds to the user again. */
  stopCameraFollow(): void {
    this._followTarget = null
  }

  /**
   * Per-frame easing toward `_followTarget`. Frame-rate independent: the
   * lerp factor scales with elapsed time so the glide feels the same at
   * 30 or 60 fps. Snaps + stops once within a sub-pixel of the target.
   */
  private _tickCameraFollow(elapsedMs: number): void {
    if (!this._followTarget) return
    const camera = this.excalibur.currentScene?.camera
    if (!camera) return
    const dx = this._followTarget.x - camera.pos.x
    const dy = this._followTarget.y - camera.pos.y
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      camera.pos = this._followTarget.clone()
      return
    }
    // Exponential smoothing; ~120ms time constant reads as a gentle glide.
    const factor = Math.min(1, elapsedMs / 120)
    camera.pos = new Vector(camera.pos.x + dx * factor, camera.pos.y + dy * factor)
  }

  /**
   * Brief fading highlight in the assistant's colour on a tile it just
   * painted — visible attribution ("the AI did this"). Self-disposing via
   * `onPostUpdate`, so no external timer. No-op without an active scene.
   */
  private _flashAssistantTile(tm: TileMap, tileX: number, tileY: number): void {
    const scene = this.excalibur?.currentScene
    if (!scene) return
    const actor = new Actor({
      pos: new Vector(tm.pos.x + (tileX + 0.5) * tm.tileWidth, tm.pos.y + (tileY + 0.5) * tm.tileHeight),
      z: 9_000, // below the cursor (10_000), above the tilemap
    })
    const colour = parseAwarenessColour(this._assistantInfo.color)
    // Outline (not a fill) so the painted tile content stays visible —
    // a colour-coded border that says "the AI touched this".
    actor.graphics.use(
      new Rectangle({
        width: tm.tileWidth,
        height: tm.tileHeight,
        color: Color.Transparent,
        strokeColor: colour,
        lineWidth: 2,
      }),
    )
    const peakOpacity = 0.95
    const fadeMs = 700
    let elapsed = 0
    actor.graphics.opacity = peakOpacity
    actor.onPostUpdate = (_engine, elapsedMs: number) => {
      elapsed += elapsedMs
      if (elapsed >= fadeMs) {
        actor.kill()
        return
      }
      actor.graphics.opacity = peakOpacity * (1 - elapsed / fadeMs)
    }
    scene.add(actor)
  }

  private _ensureAssistant(): AwarenessManager {
    if (!this._assistantAwareness) {
      // localPeerId is a sentinel that never matches the assistant peer,
      // so handleInbound treats the assistant as a "remote" peer and the
      // renderer draws it. `send` is a no-op — purely local, no wire.
      this._assistantAwareness = new AwarenessManager({
        localPeerId: '__local_viewer__',
        localInfo: { displayName: 'viewer', color: '#000000' },
        send: () => {},
      })
      this._assistantRenderer = new RemoteCursorRenderer(this, this._assistantAwareness)
    }
    return this._assistantAwareness
  }

  private _anyTileMap(scene: MapScene): TileMap | null {
    for (const entity of scene.world.entityManager.entities) {
      if (entity instanceof TileMap) return entity
    }
    return null
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
   * Revert a command that arrived from a remote peer (with
   * `Operation.direction === 'revert'`). Mirrors
   * {@link applyRemoteCommand}'s shape — same no-stack-push +
   * no-emit guarantees — but routes to the command's `revert`
   * method instead of `apply`. The originating peer already
   * popped its local undo cursor and emitted `COMMAND_REVERTED`,
   * which the collab `SessionController` relayed here.
   *
   * No-op when no `MapScene` is active.
   */
  applyRemoteRevert(command: Command): void {
    const scene = this._activeMapScene()
    if (!scene) return
    command.revert(scene)
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
   *
   * Emits `COMMAND_REVERTED` so the collab `SessionController` can
   * relay the revert to peers (with `Operation.direction = 'revert'`),
   * mirroring the local undo on every connected peer. Without this
   * emit, a peer's undo of their own paint would leave the host
   * showing the paint forever.
   */
  undo(): boolean {
    const ctx = this._undoContext()
    if (!ctx || !canUndo(ctx.stack)) return false
    const command = ctx.stack.commands[ctx.stack.cursor - 1]
    if (!command) return false
    command.revert(ctx.scene)
    ctx.stack.cursor -= 1
    SessionState.notifyMutation(ctx.scene, ctx.stack)
    this.events.emit(EngineEvent.COMMAND_REVERTED, { command })
    return true
  }

  /**
   * Redo the next command in the stack (if any). Re-applies the
   * command and advances the cursor. No-op when `!canRedo()`.
   *
   * Emits `COMMAND_EXECUTED` so peers re-apply the command too.
   * Bypasses `executeCommandOnScene` because the command is already
   * in the local undo stack — we only need the apply + relay halves,
   * not the stack push.
   */
  redo(): boolean {
    const ctx = this._undoContext()
    if (!ctx || !canRedo(ctx.stack)) return false
    const command = ctx.stack.commands[ctx.stack.cursor]
    if (!command) return false
    command.apply(ctx.scene)
    ctx.stack.cursor += 1
    SessionState.notifyMutation(ctx.scene, ctx.stack)
    this.events.emit(EngineEvent.COMMAND_EXECUTED, { command })
    return true
  }

  canUndo(): boolean {
    const stack = this._undoContext()?.stack
    return stack ? canUndo(stack) : false
  }

  canRedo(): boolean {
    const stack = this._undoContext()?.stack
    return stack ? canRedo(stack) : false
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
   * Toggle Excalibur's debug grid lines on every tilemap of the
   * active `MapScene`. Independent of {@link setDimInactiveLayers}
   * — the user can have grid + full opacity, grid + dimming, no
   * grid + dimming, or neither.
   *
   * Excalibur's debug renderer carries the grid; we configure
   * `engine.debug.tilemap.showGrid` true + every other debug
   * visualisation off so the editor doesn't accidentally show
   * physics colliders.
   *
   * No-op if the active scene isn't a `MapScene`.
   */
  setShowGrid(showGrid: boolean): void {
    this._updateViewFlags({ showGrid })
  }

  /**
   * Dim non-active-layer sprites + placements to
   * {@link GRID_MODE_DIM_OPACITY} so the active layer's content is
   * the dominant signal. Independent of {@link setShowGrid}.
   *
   * The dimming follows {@link setActiveLayer} automatically — flip
   * the active layer and the previously-dimmed layer reads at full
   * opacity, the new non-active layers fade.
   *
   * No-op if the active scene isn't a `MapScene`.
   */
  setDimInactiveLayers(dimInactiveLayers: boolean): void {
    this._updateViewFlags({ dimInactiveLayers })
  }

  /** Read both flags from the active scene (defaults to `{ false, false }`). */
  getEditorViewFlags(): EditorViewFlags {
    const scene = this._activeMapScene()
    if (!scene) return { showGrid: false, dimInactiveLayers: false }
    const current = SessionState.get(scene, EditorViewModeComponent)
    return {
      showGrid: current?.showGrid ?? false,
      dimInactiveLayers: current?.dimInactiveLayers ?? false,
    }
  }

  /**
   * Merge `partial` over the current flags + re-apply the scene's
   * render passes. Centralised so the two public setters share the
   * same component-write + debug-config + render-refresh sequence.
   */
  private _updateViewFlags(partial: Partial<EditorViewFlags>): void {
    const scene = this._activeMapScene()
    if (!scene) return
    const current = SessionState.get(scene, EditorViewModeComponent)
    const next: EditorViewFlags = {
      showGrid: partial.showGrid ?? current?.showGrid ?? false,
      dimInactiveLayers: partial.dimInactiveLayers ?? current?.dimInactiveLayers ?? false,
    }
    if (current && current.showGrid === next.showGrid && current.dimInactiveLayers === next.dimInactiveLayers) return
    SessionState.set(scene, new EditorViewModeComponent(next.showGrid, next.dimInactiveLayers))
    this._configureExcaliburDebugForShowGrid(next.showGrid)
    applyEditorViewMode(scene)
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
   * Subscribe to view-flag changes. Fires once synchronously with
   * the current snapshot (or `{ false, false }` when no scene is
   * active), then again on every flag mutation. Rebinds across map
   * switches like {@link onUndoStackChanged}.
   */
  onEditorViewModeChanged(cb: (flags: EditorViewFlags) => void): () => void {
    let inner: (() => void) | null = null
    const rebind = () => {
      inner?.()
      inner = null
      const scene = this._activeMapScene()
      if (!scene) {
        cb({ showGrid: false, dimInactiveLayers: false })
        return
      }
      inner = SessionState.subscribe(scene, EditorViewModeComponent, (component) => {
        cb({
          showGrid: component?.showGrid ?? false,
          dimInactiveLayers: component?.dimInactiveLayers ?? false,
        })
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
   * than scattered field touches) so toggling is a predictable
   * reset, not a sticky-accumulating set of debug flags from prior
   * toggles.
   */
  private _configureExcaliburDebugForShowGrid(showGrid: boolean): void {
    if (showGrid) {
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
        cb({ canUndo: stack ? canUndo(stack) : false, canRedo: stack ? canRedo(stack) : false })
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
  onPointerMoved(cb: (event: { sceneId: string; worldX: number; worldY: number }) => void): () => void {
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
        const world = this.excalibur.screen.screenToWorldCoordinates(new Vector(event.screenPos.x, event.screenPos.y))
        // Opt-in coord trace — set
        // `globalThis.__PIXELRPG_CURSOR_DEBUG = true` in DevTools /
        // a debugger session to dump screen→world conversions. Used
        // to investigate the 2026-06-01 "remote cursor is ~3 tiles
        // off" report — both paint (POINTER_TAP) and cursor (this
        // handler) read `event.screenPos` from the same source AND
        // call `screenToWorldCoordinates` identically, so if the
        // logged worldX/worldY here match the painted tile the
        // offset is on the receiver / actor render side; if they
        // mismatch, the offset is in `pointer.on('move')` vs
        // `pointer.on('down/up')` screenPos divergence.
        if ((globalThis as { __PIXELRPG_CURSOR_DEBUG?: boolean }).__PIXELRPG_CURSOR_DEBUG === true) {
          const cam = this.excalibur.currentScene?.camera
          console.log(
            `[cursor-debug] screen=(${event.screenPos.x.toFixed(1)},${event.screenPos.y.toFixed(1)})` +
              ` → world=(${world.x.toFixed(1)},${world.y.toFixed(1)})` +
              ` camera=(${cam?.x.toFixed(1) ?? '?'},${cam?.y.toFixed(1) ?? '?'},zoom=${cam?.zoom.toFixed(2) ?? '?'})`,
          )
        }
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

  /**
   * Subscribe to the local placement-selection set. Fires with the
   * current selection immediately and on every change (select tool,
   * inspector, programmatic `setSelectedPlacements`). Re-binds across
   * `MAP_LOADED`. Used by `CollabSession` to broadcast our selection over
   * awareness so peers can see what we've selected. Returns a disposer.
   */
  onSelectionChanged(cb: (placementIds: string[]) => void): () => void {
    let unsub: (() => void) | null = null
    const rebind = () => {
      unsub?.()
      unsub = null
      const scene = this._activeMapScene()
      if (!scene) return
      unsub = SessionState.subscribe(scene, SelectedPlacementsComponent, () => cb(this.getSelectedPlacements()))
    }
    rebind()
    const mapSub = this.events.on(EngineEvent.MAP_LOADED, () => rebind())
    return () => {
      unsub?.()
      mapSub.close()
    }
  }

  /**
   * Subscribe to the primary pointer's tile-space position over the
   * active map.
   *
   * Like {@link onPointerMoved} but deduped at tile granularity: the
   * callback fires only when the pointer crosses a tile boundary
   * (`floor(world/tileSize)` change), which is the right cadence for
   * the OSD coord readout — once per actual tile transition rather
   * than once per pixel of motion.
   *
   * Payload carries `{ sceneId, tileX, tileY }`. `tileX/tileY` can be
   * negative or beyond `mapData.columns/rows`: we do **not** clamp,
   * because the editor sometimes wants to know the pointer is just
   * past the map's edge (cursor-clearing on out-of-canvas is handled
   * by the caller).
   *
   * Rebinds across `MAP_LOADED` (same lifecycle as
   * {@link onPointerMoved}). Disposer detaches the pointer + map
   * listeners.
   */
  onPointerTileChanged(cb: (event: { sceneId: string; tileX: number; tileY: number }) => void): () => void {
    let disposeMove: (() => void) | null = null
    let lastTileX: number | null = null
    let lastTileY: number | null = null
    const rebind = () => {
      disposeMove?.()
      disposeMove = null
      lastTileX = null
      lastTileY = null
      const pointer = this.excalibur?.input?.pointers?.primary
      if (!pointer) return
      const handler = (event: { screenPos: { x: number; y: number } }) => {
        const scene = this._activeMapScene()
        if (!scene) return
        const mapData = scene.mapResource?.mapData
        if (!mapData) return
        const sceneId = mapData.id
        if (!sceneId) return
        const tileWidth = mapData.tileWidth || 16
        const tileHeight = mapData.tileHeight || 16
        const world = this.excalibur.screen.screenToWorldCoordinates(new Vector(event.screenPos.x, event.screenPos.y))
        const tileX = Math.floor(world.x / tileWidth)
        const tileY = Math.floor(world.y / tileHeight)
        if (tileX === lastTileX && tileY === lastTileY) return
        lastTileX = tileX
        lastTileY = tileY
        cb({ sceneId, tileX, tileY })
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

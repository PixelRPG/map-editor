import { Color, DisplayMode, EventEmitter, Engine as ExcaliburEngine, Logger, Vector } from 'excalibur'
import type { Command } from './commands/index.ts'
import { type EditorTool, type EditorViewFlags, GameSaveStateComponent } from './components/index.ts'
import { CommandHistory } from './engine/command-history.ts'
import { EditOperations } from './engine/edit-operations.ts'
import { EditorSession } from './engine/editor-session.ts'
import { LayerOperations } from './engine/layer-operations.ts'
import {
  observePointerTile,
  observePointerWorld,
  type PointerTileEvent,
  type PointerWorldEvent,
} from './engine/pointer-observers.ts'
import { type MapLoadOptions, ProjectLoader } from './engine/project-loader.ts'
import { synthesizePointerMoveAtTile } from './engine/pointer-synthesis.ts'
import { ViewModeController } from './engine/view-mode.controller.ts'
import type { GameProjectResource } from './resource/GameProjectResource.ts'
import { MapScene } from './scenes/map.scene.ts'
import { AssistantPresenceController } from './services/assistant-presence.ts'
import { placementTileCentre } from './services/placement-geometry.ts'
import { applyRuntimeMode, isRuntimeModeActive } from './services/runtime-mode.ts'
import { SessionState } from './utils/session-state.ts'
import { type AwarenessMessage, RemoteCursorRenderer } from './sync/index.ts'
import type { LayerData, LayerPlane } from './types/data/index.ts'
import { EngineEvent, type EngineEventMap, EngineStatus, type ProjectLoadOptions } from './types/index.ts'

// The AI-assistant presence subsystem (cursor/awareness/follow/flash) lives
// in AssistantPresenceController; these constants are defined there and
// re-exported so existing `@pixelrpg/engine` import sites keep working.
export { ASSISTANT_PEER_ID, DEFAULT_ASSISTANT_INFO } from './services/assistant-presence.ts'
export type { MapLoadOptions } from './engine/project-loader.ts'
export type { PointerTileEvent, PointerWorldEvent } from './engine/pointer-observers.ts'

/**
 * The editor's façade over Excalibur.
 *
 * Every public method here delegates to one collaborator, each of which
 * owns a single slice of engine behaviour:
 *
 * - {@link ProjectLoader} — project + map loading and scene switching
 * - {@link EditorSession} — the per-scene tool / tile / brush / layer /
 *   selection state on the session-singleton
 * - {@link ViewModeController} — render-only editor view flags
 * - {@link CommandHistory} — the op-log: execute, undo, redo, remote apply
 * - {@link LayerOperations} — layer list + its persisted flags
 * - {@link EditOperations} — programmatic (D-Bus/MCP) map edits
 * - {@link AssistantPresenceController} — the in-process AI collaborator's
 *   cursor, presence and camera follow
 *
 * The façade itself owns only what is genuinely engine-wide: the
 * Excalibur instance, the status field, and the narrowing of Excalibur's
 * current scene to a `MapScene`.
 */
export class Engine {
  public status: EngineStatus = EngineStatus.INITIALIZING
  public readonly events = new EventEmitter<EngineEventMap>()

  public readonly excalibur: ExcaliburEngine
  private readonly logger = Logger.getInstance()

  private readonly assistant: AssistantPresenceController
  private readonly loader: ProjectLoader
  private readonly session: EditorSession
  private readonly viewMode: ViewModeController
  private readonly history: CommandHistory
  private readonly layers: LayerOperations
  private readonly edits: EditOperations

  /** Currently loaded project resource (null until loadProject completes). */
  public get gameProjectResource(): GameProjectResource | null {
    return this.loader.gameProjectResource
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

    const activeScene = () => this.activeMapScene()

    // The assistant-presence subsystem reads the active scene + camera from
    // the engine and builds its cursor renderer bound to this engine.
    this.assistant = new AssistantPresenceController({
      host: {
        getActiveScene: activeScene,
        getCamera: () => this.excalibur.currentScene?.camera ?? null,
      },
      createRenderer: (awareness) => new RemoteCursorRenderer(this, awareness),
    })

    this.loader = new ProjectLoader({
      excalibur: this.excalibur,
      events: this.events,
      setStatus: (status) => this.setStatus(status),
      isRuntimeMode: () => this.isRuntimeMode(),
    })
    this.session = new EditorSession(activeScene, this.events)
    this.viewMode = new ViewModeController(this.excalibur, activeScene, this.events)
    this.history = new CommandHistory(activeScene, this.events)
    this.layers = new LayerOperations(activeScene, (command, origin) => this.executeCommand(command, origin))
    this.edits = new EditOperations({
      activeScene,
      session: this.session,
      layers: this.layers,
      assistant: this.assistant,
      execute: (command, origin) => this.executeCommand(command, origin),
    })

    // Smooth camera-follow: ease the camera toward the follow target every
    // frame rather than issuing a fresh `camera.move` tween per cursor
    // update (which fought itself and looked hectic).
    this.excalibur.on('postupdate', (evt: { elapsed?: number; delta?: number }) =>
      this.assistant.tickCameraFollow(evt.elapsed ?? evt.delta ?? 16),
    )

    // Teleport host wiring: `TeleportSystem` emits the intent (it has no
    // engine reference); the engine — the only owner of scene switching —
    // performs it.
    this.events.on(EngineEvent.TELEPORT_REQUESTED, ({ targetMapId, targetTileX, targetTileY, facing }) =>
      this.loader.teleport(targetMapId, targetTileX, targetTileY, facing),
    )
  }

  async initialize(): Promise<void> {
    this.setStatus(EngineStatus.INITIALIZING)
    this.setStatus(EngineStatus.READY)
  }

  async loadProject(projectPath: string, options?: ProjectLoadOptions): Promise<void> {
    return this.loader.loadProject(projectPath, options)
  }

  /** Load a map and switch the active scene to it. See {@link ProjectLoader.loadMap}. */
  async loadMap(mapId: string, options?: MapLoadOptions): Promise<void> {
    return this.loader.loadMap(mapId, options)
  }

  /**
   * Id of the map that is live, or `null` before the first
   * {@link loadMap}. `loadProject` already activates the project's
   * startup map, so a host must ask rather than assume it has to load
   * one itself. See {@link ProjectLoader.currentMapId}.
   */
  get currentMapId(): string | null {
    return this.loader.currentMapId
  }

  async start(): Promise<void> {
    this.excalibur.start()
    this.setStatus(EngineStatus.RUNNING)
  }

  async stop(): Promise<void> {
    this.assistant.dispose()
    this.excalibur.stop()
    this.setStatus(EngineStatus.READY)
  }

  // ──────────────────────────────────────────────────────────────
  // Editor session state — tool, brushes, layer, selection
  // ──────────────────────────────────────────────────────────────

  /** Set the active editor tool. No-op when no `MapScene` is active yet. */
  setActiveTool(tool: EditorTool): void {
    this.session.activeTool = tool
  }

  getActiveTool(): EditorTool | null {
    return this.session.activeTool
  }

  /** Set the active tile sprite id (global = local index + `firstGid`). */
  setActiveTile(spriteId: number): void {
    this.session.activeTile = spriteId
  }

  getActiveTile(): number | null {
    return this.session.activeTile
  }

  /** Set the "object brush" — the entity id the `'object'` tool stamps. `null` clears it. */
  setObjectBrush(defId: string | null): void {
    this.session.objectBrush = defId
  }

  getObjectBrush(): string | null {
    return this.session.objectBrush
  }

  /** Set the active layer for tile painting. Matches a `LayerData.id`. */
  setActiveLayer(layerId: string): void {
    this.session.activeLayer = layerId
  }

  getActiveLayer(): string | null {
    return this.session.activeLayer
  }

  /** Replace the placement selection; an empty array means "nothing selected". */
  setSelectedPlacements(placementIds: readonly string[]): void {
    this.session.selectedPlacements = placementIds
  }

  /** Current placement-selection. Empty array when no selection. */
  getSelectedPlacements(): string[] {
    return this.session.selectedPlacements
  }

  /**
   * Smoothly pan the camera so a placement becomes the viewport centre.
   * The 400ms default reads as a clear "the editor moved me" cue without
   * dragging when stepping through a list of objects.
   *
   * `false` when there is no active map, the id matches nothing, or
   * Excalibur's `move()` rejects (e.g. the camera is following an actor).
   */
  async focusOnPlacement(placementId: string, durationMs = 400): Promise<boolean> {
    const scene = this.activeMapScene()
    if (!scene) return false
    const centre = placementTileCentre(scene.mapResource?.mapData, placementId)
    if (!centre) return false
    try {
      await scene.camera.move(new Vector(centre.x, centre.y), durationMs)
      return true
    } catch {
      return false
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Commands — the op-log every mutation flows through
  // ──────────────────────────────────────────────────────────────

  /**
   * Execute a {@link Command} and push it onto the undo stack — see
   * {@link CommandHistory.execute}. No-op without an active `MapScene`.
   *
   * `origin` attributes the mutation to an actor other than the local
   * user; pass {@link ASSISTANT_PEER_ID} for AI-collaborator edits
   * driven via Control/MCP. Deliberately a per-call parameter rather
   * than a stored "current actor" flag, so it cannot leak across async
   * boundaries.
   */
  executeCommand(command: Command, origin?: string): void {
    this.history.execute(command, origin)
  }

  /** Apply a command received from a peer — see {@link CommandHistory.applyRemote}. */
  applyRemoteCommand(command: Command, origin?: string): void {
    this.history.applyRemote(command, origin)
  }

  /** Revert a command a remote peer undid. Same guarantees as {@link applyRemoteCommand}. */
  applyRemoteRevert(command: Command, origin?: string): void {
    this.history.revertRemote(command, origin)
  }

  /** Revert the most recent command; peers mirror it. `origin` as in {@link executeCommand}. */
  undo(origin?: string): boolean {
    return this.history.undo(origin)
  }

  /** Re-apply the next command in the stack; peers follow. */
  redo(origin?: string): boolean {
    return this.history.redo(origin)
  }

  canUndo(): boolean {
    return this.history.canUndo()
  }

  canRedo(): boolean {
    return this.history.canRedo()
  }

  // ──────────────────────────────────────────────────────────────
  // Programmatic edits — the headless equivalent of a pointer click
  // ──────────────────────────────────────────────────────────────

  /**
   * Paint (or erase) a tile — see {@link EditOperations.paintTile} for
   * the refusal reasons. `layerId` null → the active layer; `spriteId`
   * omitted → the active tile, `0`/`null` → erase.
   */
  paintTileAt(
    layerId: string | null,
    tileX: number,
    tileY: number,
    spriteId?: number | null,
    origin?: string,
  ): boolean {
    return this.edits.paintTile({ layerId, tileX, tileY, spriteId, origin })
  }

  /** Bucket-fill from `(tileX, tileY)` as one atomic command — see {@link EditOperations.fillTile}. */
  fillTileAt(layerId: string | null, tileX: number, tileY: number, spriteId?: number | null, origin?: string): boolean {
    return this.edits.fillTile({ layerId, tileX, tileY, spriteId, origin })
  }

  /** Stamp a library object on the active map — see {@link EditOperations.placeObject}. */
  placeObjectAt(defId: string, layerId: string | null, tileX: number, tileY: number, origin?: string): boolean {
    return this.edits.placeObject({ defId, layerId, tileX, tileY, origin })
  }

  /** Remove an object placement by id — see {@link EditOperations.removeObject}. */
  removeObject(placementId: string, origin?: string): boolean {
    return this.edits.removeObject(placementId, origin)
  }

  // ──────────────────────────────────────────────────────────────
  // AI assistant — in-process virtual collaborator presence/cursor
  // (see docs/concepts/ai-collaborator.md)
  // ──────────────────────────────────────────────────────────────

  /**
   * Show (or move) the AI assistant's cursor at tile `(tileX, tileY)` on the
   * active map. Returns `false` if paused or no map/scene is active.
   */
  setAssistantCursor(tileX: number, tileY: number): boolean {
    return this.assistant.setCursor(tileX, tileY)
  }

  /** Update the AI assistant's display name + colour (re-announced immediately). */
  setAssistantInfo(displayName: string, color: string): void {
    this.assistant.setInfo(displayName, color)
  }

  /** Remove the AI assistant's cursor/presence from the canvas. */
  hideAssistant(): void {
    this.assistant.hide()
  }

  /**
   * Wire (or clear with `null`) a relay that forwards the assistant's
   * awareness frames to remote peers — set by the app to the active
   * `CollabSession`'s awareness so networked humans see the AI's cursor.
   */
  setAssistantFrameRelay(relay: ((message: AwarenessMessage) => void) | null): void {
    this.assistant.setFrameRelay(relay)
  }

  /** Whether the assistant is currently present (cursor/info set, not hidden). */
  isAssistantActive(): boolean {
    return this.assistant.isActive()
  }

  /** Whether the user has paused the assistant. */
  isAssistantPaused(): boolean {
    return this.assistant.isPaused()
  }

  /** Pause/resume the assistant. While paused, its cursor + paints are rejected. */
  setAssistantPaused(paused: boolean): void {
    this.assistant.setPaused(paused)
  }

  /** Toggle camera-follow of the assistant cursor (off by default). */
  setFollowAssistant(follow: boolean): void {
    this.assistant.setFollow(follow)
  }

  /**
   * Set the smooth camera-follow target to world point `(x, y)`. Follows ANY
   * collaborator (human peer or the AI) the user selected in the participants
   * toolbar — the camera eases toward it on each post-update.
   */
  panCameraTo(worldX: number, worldY: number): void {
    this.assistant.panCameraTo(worldX, worldY)
  }

  /** Stop following — the camera stays where it is and responds to the user again. */
  stopCameraFollow(): void {
    this.assistant.stopCameraFollow()
  }

  // ──────────────────────────────────────────────────────────────
  // Layers
  // ──────────────────────────────────────────────────────────────

  /** Toggle a layer's `visible` flag through the op-log — see {@link LayerOperations.setVisible}. */
  setLayerVisible(layerId: string, visible: boolean): boolean {
    return this.layers.setVisible(layerId, visible)
  }

  /** Toggle a layer's `locked` flag — same routing as {@link setLayerVisible}; padlocks sync. */
  setLayerLocked(layerId: string, locked: boolean): boolean {
    return this.layers.setLocked(layerId, locked)
  }

  /** Append a fully built layer to the active map through the op-log. */
  addLayer(layer: LayerData, origin?: string): boolean {
    return this.layers.add(layer, origin)
  }

  /** Move a layer inside `MapData.layers` — see {@link LayerOperations.reorder}. */
  reorderLayer(layerId: string, index: number, origin?: string): boolean {
    return this.layers.reorder(layerId, index, origin)
  }

  /** Move a layer to another plane (and optionally a list position) — see {@link LayerOperations.setPlane}. */
  setLayerPlane(layerId: string, plane: LayerPlane, index?: number, origin?: string): boolean {
    return this.layers.setPlane(layerId, plane, index, origin)
  }

  /** Read the `locked` flag on a layer. `false` for an unknown id / no scene. */
  isLayerLocked(layerId: string): boolean {
    return this.layers.isLocked(layerId)
  }

  // ──────────────────────────────────────────────────────────────
  // View flags + runtime mode
  // ──────────────────────────────────────────────────────────────

  /** Toggle the debug grid lines. Independent of {@link setDimInactiveLayers}. */
  setShowGrid(showGrid: boolean): void {
    this.viewMode.update({ showGrid })
  }

  /**
   * Dim non-active-layer sprites + placements so the active layer is the
   * dominant signal. Follows {@link setActiveLayer} automatically.
   */
  setDimInactiveLayers(dimInactiveLayers: boolean): void {
    this.viewMode.update({ dimInactiveLayers })
  }

  /**
   * Globally show / hide object placements — the Layers tab's "Objects"
   * toggle. A placement renders only when its layer is visible AND
   * objects are globally visible. Pure view state, never persisted.
   */
  setObjectsVisible(objectsVisible: boolean): void {
    this.viewMode.update({ objectsVisible })
  }

  /** Read the view flags from the active scene (defaults without one). */
  getEditorViewFlags(): EditorViewFlags {
    return this.viewMode.getFlags()
  }

  /**
   * Toggle between editor and runtime mode on the active `MapScene`.
   * Position state is continuous across toggles, so re-entering runtime
   * feels seamless. No-op without an active scene.
   */
  setRuntimeMode(active: boolean): void {
    const scene = this.activeMapScene()
    if (!scene) return
    applyRuntimeMode(scene, active)
    // Swap placement chrome (cell frames + logic markers) out of / back
    // into the render so a playtest shows only the real sprites.
    scene.refreshPlacementGraphicsForMode(active)
  }

  /**
   * Drop the playthrough's accumulated state — today the flag store,
   * tomorrow live hit points and the bag — so the next run starts from
   * the same place as the first one.
   *
   * Decision 14 of the design: a playtest that starts identically every
   * time is what makes it a test, and the key-and-door loop stays
   * re-runnable. The cost is stated rather than hidden: a door the child
   * just unlocked is locked again.
   *
   * No-op without an active scene.
   */
  clearSaveState(): void {
    const scene = this.activeMapScene()
    if (!scene) return
    SessionState.set(scene, new GameSaveStateComponent())
  }

  /** Current runtime-mode state on the active scene (`false` if no scene). */
  isRuntimeMode(): boolean {
    const scene = this.activeMapScene()
    return scene ? isRuntimeModeActive(scene) : false
  }

  // ──────────────────────────────────────────────────────────────
  // Tile collision refresh
  // ──────────────────────────────────────────────────────────────

  /**
   * Re-apply `tile.solid` for every placement of a sprite definition, so
   * flipping its `solid` flag takes effect without a scene rebuild.
   */
  refreshTileSolidsForSprite(spriteSetId: string, spriteId: number): void {
    this.activeMapScene()?.mapResource.refreshTileSolidsForSprite(spriteSetId, spriteId)
  }

  /**
   * Whole-set variant of {@link refreshTileSolidsForSprite} — a peer's
   * descriptor update carries the whole set, not which sprite changed.
   */
  refreshTileSolidsForSpriteSet(spriteSetId: string): void {
    this.activeMapScene()?.mapResource.refreshTileSolidsForSpriteSet(spriteSetId)
  }

  // ──────────────────────────────────────────────────────────────
  // Observers — all rebind across map switches
  // ──────────────────────────────────────────────────────────────

  /**
   * Subscribe to view-flag changes. Fires once synchronously with the
   * current snapshot, then on every flag mutation.
   */
  onEditorViewModeChanged(cb: (flags: EditorViewFlags) => void): () => void {
    return this.viewMode.onChanged(cb)
  }

  /**
   * Subscribe to undo-stack changes — see {@link CommandHistory.onChanged}.
   * Keeps `win.undo` / `win.redo` `GAction.enabled` in sync.
   */
  onUndoStackChanged(cb: (state: { canUndo: boolean; canRedo: boolean }) => void): () => void {
    return this.history.onChanged(cb)
  }

  /** Subscribe to the pointer's world position — see {@link observePointerWorld}. */
  onPointerMoved(cb: (event: PointerWorldEvent) => void): () => void {
    return observePointerWorld(this.pointerHost(), cb)
  }

  /** Subscribe to the pointer's tile position, deduped per tile — see {@link observePointerTile}. */
  onPointerTileChanged(cb: (event: PointerTileEvent) => void): () => void {
    return observePointerTile(this.pointerHost(), cb)
  }

  /**
   * Move the pointer to tile `(tileX, tileY)` as if the mouse had — the
   * hover overlays then show what a click there would do. See
   * {@link synthesizePointerMoveAtTile}. Returns `false` without an
   * active map.
   */
  hoverTileAt(tileX: number, tileY: number): boolean {
    return synthesizePointerMoveAtTile(this.pointerHost(), tileX, tileY)
  }

  /**
   * Subscribe to the local placement-selection set. Used by
   * `CollabSession` to broadcast our selection over awareness.
   */
  onSelectionChanged(cb: (placementIds: string[]) => void): () => void {
    return this.session.onSelectionChanged(cb)
  }

  private pointerHost() {
    return {
      excalibur: this.excalibur,
      events: this.events,
      activeScene: () => this.activeMapScene(),
    }
  }

  /**
   * Active `MapScene` or `null` if Excalibur's current scene isn't a map
   * (boot screen, loader, etc.). Centralises the `instanceof` narrowing
   * so every collaborator agrees on what "the active map" means.
   */
  private activeMapScene(): MapScene | null {
    const scene = this.excalibur.currentScene
    return scene instanceof MapScene ? scene : null
  }

  private setStatus(status: EngineStatus): void {
    if (this.status === status) return
    this.logger.info(`Engine status changed from ${this.status} to ${status}`)
    this.status = status
    this.events.emit(EngineEvent.STATUS_CHANGED, { status })
  }
}

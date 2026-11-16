import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { WebGLBridge } from '@gjsify/webgl'
import {
  type EditorTool,
  type EditorViewFlags,
  EMPTY_VIEWPORT_INSET,
  EngineEvent,
  type EngineEventMap,
  EngineStatus,
  Engine as ExcaliburEngine,
  formatError,
  type LayerData,
  type LayerPlane,
  normalizeViewportInset,
  type ProjectLoadOptions,
  type TouchIntent,
  type ViewportInset,
} from '@pixelrpg/engine'
import { Color, EventEmitter, type Subscription, Vector } from 'excalibur'
import { SignalScope } from '../../utils/signal-scope.ts'
import { type CanvasBridge, createCanvasBridge, readFramebufferPng } from './canvas-bridge.ts'
import { forwardEngineEvents } from './engine-events.ts'
import { attachLongPress } from './long-press.ts'
import { attachMultiFingerTap } from './multi-finger-tap.ts'
import { attachPinchZoom } from './pinch-zoom.ts'
import { attachVirtualStick } from './stick-drag.ts'
import { watchTouchSeen } from './touch-seen.ts'
import {
  STICK_BASE_PX,
  STICK_HIDE_DELAY_MS,
  STICK_KNOB_PX,
  type StickButtons,
  type StickDrag,
  touchIntent,
} from './virtual-stick.ts'
import { EngineUnavailableError } from './engine-unavailable.error.ts'
import Template from './engine.blp'

/**
 * Scratchpad backdrop colors from the design's `adwaita/theme.css`
 * `--scratchpad-b` token (the lighter of the two stripe colours, used
 * as a solid fallback while GLArea alpha compositing is unreliable on
 * this stack). Re-paint inside the Excalibur clear so the area around
 * the map matches the editor scratchpad instead of opaque white.
 */
const SCRATCHPAD_BG_LIGHT = Color.fromHex('#ededed')
const SCRATCHPAD_BG_DARK = Color.fromHex('#232328')

/**
 * How long `loadProject` / `loadMap` wait for the canvas to come up
 * before reporting failure. Generous — GL init on a cold, software-
 * rendered stack is slow — but finite, because the alternative is a call
 * that never returns and a scene editor that never recovers.
 */
const READY_TIMEOUT_MS = 20_000

/**
 * How long a keyboard / screen-reader activation of the action button
 * is held.
 *
 * `Gtk.Button::clicked` carries no press-and-hold — it is one event —
 * but gameplay reads a BUTTON STATE. Without a pulse the intent would be
 * set and cleared inside the same frame and the engine would never see
 * it. 100 ms is long enough to cross several ticks at 60 fps and short
 * enough that the activation still reads as a tap.
 */
const ACTION_PULSE_MS = 100

export namespace Engine {
  export type ConstructorProps = Partial<Adw.Bin.ConstructorProps>

  export interface SignalProps {
    ready: []
    [EngineEvent.STATUS_CHANGED]: [EngineStatus]
    [EngineEvent.PROJECT_LOADED]: [string]
    [EngineEvent.MAP_LOADED]: [string]
    [EngineEvent.ERROR]: [string]
  }
}

/**
 * The {@link Engine.SignalProps} tuple map as a signal-signature map, so
 * `SignalMethods` can type `connect`/`emit` from the one declaration the
 * `registerClass` block already has to keep in sync with.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface EngineSignals extends Adw.Bin.SignalSignatures {
  ready: () => void
  [EngineEvent.STATUS_CHANGED]: (status: EngineStatus) => void
  [EngineEvent.PROJECT_LOADED]: (payload: string) => void
  [EngineEvent.MAP_LOADED]: (payload: string) => void
  [EngineEvent.ERROR]: (detail: string) => void
}

/**
 * GJS engine widget.
 *
 * Hosts a gjsify WebGLBridge (WebGL 2, via Gtk.GLArea) and instantiates
 * the in-process Excalibur engine directly on its canvas. Falls back to
 * Canvas2DBridge (Cairo) if WebGL initialization fails.
 */
export class Engine extends Adw.Bin {
  private declare _canvasContainer: Gtk.Box
  private declare _stickBase: Gtk.Box
  private declare _stickKnob: Gtk.Box
  private declare _actionButton: Gtk.Button

  private _widget: CanvasBridge | null = null
  private _excalibur: ExcaliburEngine | null = null
  private _ready = false
  private _excaliburSubscriptions: Subscription[] = []
  private _viewportInset: ViewportInset = EMPTY_VIEWPORT_INSET
  private _closeRequestHandlerId = 0
  /**
   * The window the `close-request` handler is attached to. Tracked
   * alongside the id because a re-root gives the widget a DIFFERENT
   * toplevel — releasing against `get_root()` at teardown time would
   * aim the disconnect at the wrong window and leave the old one
   * holding a handler that outlives this widget.
   */
  private _closeRequestRoot: Gtk.Window | null = null
  /** `notify::dark` on the global `Adw.StyleManager`; released in `_teardown`. */
  private _styleManagerHandlerId = 0
  /**
   * Handlers waiting for `ready`. Scoped rather than self-disconnecting
   * so a widget torn down before the engine starts still releases them
   * (see {@link SignalScope.connectUntil}).
   */
  private _readyWaiters = new SignalScope()
  /**
   * `reject` side of every pending {@link _waitForReady}. Teardown and a
   * failed start settle these: a promise left pending forever strands
   * its caller with nothing to report and no reason to rebuild.
   */
  private _readyRejectors: Array<(reason: Error) => void> = []
  /**
   * `reject` side of every engine operation already PAST `ready` —
   * `loadProject`, `loadMap`, `start`, `stop`.
   *
   * {@link _waitForReady} only covers callers still waiting for the
   * canvas. Teardown stops Excalibur mid-flight, and a loader that was
   * stopped never calls back, so an operation that had already started
   * stayed pending for the rest of the process. Through
   * `EngineController`'s serial queue that wedged every later map open
   * behind it: leaving the map editor while its project was still
   * loading meant the editor never opened a map again, with nothing
   * logged. Same doctrine as {@link _failStart} — never strand a caller.
   */
  private _inflightRejectors: Array<(reason: Error) => void> = []
  private _teardownComplete = false
  /** Why the engine can never become ready, once that is known. */
  private _startFailure: string | null = null

  /** Whether a Live Run is in progress — the only state with touch controls. */
  private _playing = false
  /** Whether the host window is at its phone breakpoint. */
  private _compactLayout = false
  /**
   * Whether this canvas has ever been touched. Latched: see
   * {@link watchTouchSeen} for why it is never unset.
   */
  private _touchSeen = false
  /** The live stick, or `null` when no thumb is on it. */
  private _stickDrag: StickDrag | null = null
  private _stickButtons: StickButtons = { action: false, attack: false }
  /** Pending fade-out of the released stick; see `STICK_HIDE_DELAY_MS`. */
  private _stickHideTimeoutId = 0
  /** Pending release of an {@link ACTION_PULSE_MS} action pulse. */
  private _actionPulseTimeoutId = 0

  public status: EngineStatus = EngineStatus.INITIALIZING
  public readonly events = new EventEmitter<EngineEventMap>()

  static {
    GObject.registerClass(
      {
        GTypeName: 'Engine',
        Template,
        InternalChildren: ['canvasContainer', 'stickBase', 'stickKnob', 'actionButton'],
        Signals: {
          ready: {},
          [EngineEvent.STATUS_CHANGED]: {
            param_types: [GObject.TYPE_STRING],
          },
          [EngineEvent.PROJECT_LOADED]: {
            param_types: [GObject.TYPE_STRING],
          },
          [EngineEvent.MAP_LOADED]: {
            param_types: [GObject.TYPE_STRING],
          },
          [EngineEvent.ERROR]: {
            param_types: [GObject.TYPE_STRING],
          },
        },
      },
      Engine,
    )
  }

  declare connect: GObject.SignalMethods<this, EngineSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, EngineSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, EngineSignals>['emit']

  constructor(params: Engine.ConstructorProps = {}) {
    super(params)
    // Here rather than in `_startWithWidget`: the button is a template
    // child of THIS widget, so it outlives every canvas bridge — and
    // `_startWithWidget` runs a second time when WebGL init fails, which
    // would leave the button with two controllers and a doubled press.
    this._wireActionButton()
  }

  /**
   * Create the canvas bridge and start the engine on it. Idempotent.
   * Throws on a widget that has already been torn down — reviving one is
   * not possible (its GL context is gone), and returning quietly would
   * park the caller's next `loadProject` on a `ready` that can never fire.
   */
  public async initialize(): Promise<void> {
    if (this._teardownComplete) throw new EngineUnavailableError('engine widget was disposed')
    if (this._widget) return
    this._startWithWidget(false)
  }

  public async loadProject(projectPath: string, options?: ProjectLoadOptions): Promise<void> {
    await this._waitForReady()
    await this._untilTeardown(this._excalibur!.loadProject(projectPath, options))
  }

  public async loadMap(mapId: string): Promise<void> {
    await this._waitForReady()
    await this._untilTeardown(this._excalibur!.loadMap(mapId))
  }

  /** Forward to `Engine.currentMapId` — which map the engine has live, if any. */
  public get currentMapId(): string | null {
    return this._excalibur?.currentMapId ?? null
  }

  public async start(): Promise<void> {
    await this._waitForReady()
    await this._untilTeardown(this._excalibur!.start())
  }

  public async stop(): Promise<void> {
    await this._waitForReady()
    await this._untilTeardown(this._excalibur!.stop())
  }

  /** Forward to `Engine.setActiveTool` — writes to the session-singleton. */
  public setActiveTool(tool: EditorTool): void {
    this._excalibur?.setActiveTool(tool)
  }

  /** Forward to `Engine.setActiveTile` — writes the global sprite id (with `firstGid`) to the singleton. */
  public setActiveTile(spriteId: number): void {
    this._excalibur?.setActiveTile(spriteId)
  }

  /** Forward to `Engine.setObjectBrush` — the library entity id the object tool stamps. */
  public setObjectBrush(defId: string | null): void {
    this._excalibur?.setObjectBrush(defId)
  }

  /** Forward to `Engine.setActiveLayer` — sets the layer used for tile painting. */
  public setActiveLayer(layerId: string): void {
    this._excalibur?.setActiveLayer(layerId)
  }

  /** Forward to `Engine.setSelectedPlacements`. */
  public setSelectedPlacements(placementIds: readonly string[]): void {
    this._excalibur?.setSelectedPlacements(placementIds)
  }

  /** Forward to `Engine.getSelectedPlacements`. */
  public getSelectedPlacements(): string[] {
    return this._excalibur?.getSelectedPlacements() ?? []
  }

  /** Forward to `Engine.focusOnPlacement` — smoothly pans the camera. */
  public focusOnPlacement(placementId: string, durationMs?: number): Promise<boolean> {
    return this._excalibur?.focusOnPlacement(placementId, durationMs) ?? Promise.resolve(false)
  }

  /**
   * Forward to `Engine.setViewportInset` — which canvas edges the host's
   * chrome covers (the phone sheet at Half).
   *
   * Remembered on the widget as well, because the detent can settle
   * while the Excalibur engine is still initialising and an inset
   * dropped then would only resurface at the next drag.
   */
  public setViewportInset(inset: Partial<ViewportInset> | null | undefined): void {
    this._viewportInset = normalizeViewportInset(inset)
    this._excalibur?.setViewportInset(this._viewportInset)
  }

  /** Undo the most recent editor command. Returns `false` if nothing to undo. */
  public undo(): boolean {
    return this._excalibur?.undo() ?? false
  }

  /** Redo the next command in the stack. Returns `false` if nothing to redo. */
  public redo(): boolean {
    return this._excalibur?.redo() ?? false
  }

  public canUndo(): boolean {
    return this._excalibur?.canUndo() ?? false
  }

  public canRedo(): boolean {
    return this._excalibur?.canRedo() ?? false
  }

  /**
   * Subscribe to undo-stack changes on the underlying engine. The
   * disposer is added to {@link _excaliburSubscriptions} so it is
   * automatically released on `vfunc_unmap` alongside the other
   * engine-scoped subscriptions; callers do not need to track it.
   *
   * Returns `true` when the subscription was attached, `false` when
   * the engine is not running yet (caller should retry once the
   * engine is ready).
   */
  public onUndoStackChanged(cb: (state: { canUndo: boolean; canRedo: boolean }) => void): boolean {
    if (!this._excalibur) return false
    const dispose = this._excalibur.onUndoStackChanged(cb)
    this._excaliburSubscriptions.push({ close: dispose })
    return true
  }

  /**
   * Forward to `Engine.setLayerVisible` — dispatches an undoable
   * `SetLayerVisibilityCommand` (graphics rebuild + collab sync ride
   * the command). The widget relays the resulting
   * `LAYER_FLAG_CHANGED` on {@link events} for UI mirroring.
   */
  public setLayerVisible(layerId: string, visible: boolean): boolean {
    return this._excalibur?.setLayerVisible(layerId, visible) ?? false
  }

  /** Forward to `Engine.setObjectsVisible` — global show/hide for object placements. */
  public setObjectsVisible(visible: boolean): void {
    this._excalibur?.setObjectsVisible(visible)
  }

  /** Forward to `Engine.setShowGrid` — toggles Excalibur's debug grid lines. */
  public setShowGrid(showGrid: boolean): void {
    this._excalibur?.setShowGrid(showGrid)
  }

  /** Forward to `Engine.setDimInactiveLayers` — toggles non-active-layer dimming. */
  public setDimInactiveLayers(dimInactiveLayers: boolean): void {
    this._excalibur?.setDimInactiveLayers(dimInactiveLayers)
  }

  /** Forward to `Engine.setShowWalls` — toggles the wall hatching overlay. */
  public setShowWalls(showWalls: boolean): void {
    this._excalibur?.setShowWalls(showWalls)
  }

  /** Forward to `Engine.getEditorViewFlags`. */
  public getEditorViewFlags(): EditorViewFlags {
    return (
      this._excalibur?.getEditorViewFlags() ?? {
        showGrid: false,
        dimInactiveLayers: false,
        objectsVisible: true,
        showWalls: false,
      }
    )
  }

  /** Forward to `Engine.clearSaveState` — what ↺ Restart resets. */
  public clearSaveState(): void {
    this._excalibur?.clearSaveState()
  }

  /**
   * Forward to `Engine.setRuntimeMode` — toggles editor ↔ playtest.
   *
   * Also the switch for the on-screen touch controls: they exist only
   * during a run, and leaving a run must drop any intent still held
   * (a thumb lifted *after* Stop would otherwise never be reported).
   */
  public setRuntimeMode(active: boolean): void {
    this._excalibur?.setRuntimeMode(active)
    this._playing = active
    this._applyTouchControls()
  }

  /**
   * Forward to `Engine.applyPlayZoom` — frame the map for a fresh run.
   *
   * No zoom is reported back: the OSD learns the new figure from
   * {@link onCameraZoomChanged}, which watches the camera itself, so a
   * zoom the engine chose and one someone pinched arrive the same way.
   */
  public applyPlayZoom(): boolean {
    return this._excalibur?.applyPlayZoom() ?? false
  }

  /**
   * Tell the widget whether the host window is at its phone breakpoint.
   *
   * One of the two halves of "should the touch controls be on screen" —
   * see {@link _touchControlsVisible}.
   */
  public setCompactLayout(compact: boolean): void {
    if (this._compactLayout === compact) return
    this._compactLayout = compact
    this._applyTouchControls()
  }

  /** Forward to `Engine.isRuntimeMode`. */
  public isRuntimeMode(): boolean {
    return this._excalibur?.isRuntimeMode() ?? false
  }

  /** Forward — refreshes `tile.solid` on every placement of a sprite definition. */
  public refreshTileSolidsForSprite(spriteSetId: string, spriteId: number): void {
    this._excalibur?.refreshTileSolidsForSprite(spriteSetId, spriteId)
  }

  /** Forward — refreshes `tile.solid` on every placement of ANY sprite of a set. */
  public refreshTileSolidsForSpriteSet(spriteSetId: string): void {
    this._excalibur?.refreshTileSolidsForSpriteSet(spriteSetId)
  }

  /**
   * Subscribe to view-flag changes. Disposer is captured into
   * {@link _excaliburSubscriptions} so unmap releases it.
   */
  public onEditorViewModeChanged(cb: (flags: EditorViewFlags) => void): boolean {
    if (!this._excalibur) return false
    const dispose = this._excalibur.onEditorViewModeChanged(cb)
    this._excaliburSubscriptions.push({ close: dispose })
    return true
  }

  /**
   * Forward to `Engine.setLayerLocked` — dispatches an undoable
   * `SetLayerLockedCommand` (collab sync rides the command); no
   * render change.
   */
  public setLayerLocked(layerId: string, locked: boolean): boolean {
    return this._excalibur?.setLayerLocked(layerId, locked) ?? false
  }

  /**
   * Forward to `Engine.addLayer` — dispatches an undoable
   * `AddLayerCommand` (collab sync rides the command). The host
   * re-populates its Layers tab + persists after this returns.
   */
  public addLayer(layer: LayerData): boolean {
    return this._excalibur?.addLayer(layer) ?? false
  }

  /**
   * Forward to `Engine.renameLayer` — dispatches an undoable
   * `RenameLayerCommand` (collab sync rides the command). The widget
   * relays the resulting `LAYER_LIST_CHANGED` on {@link events}, since
   * the Layers page shows the name.
   */
  public renameLayer(layerId: string, name: string): boolean {
    return this._excalibur?.renameLayer(layerId, name) ?? false
  }

  /**
   * Forward to `Engine.duplicateLayer` — one undoable
   * `DuplicateLayerCommand` carrying the original's tiles + placements.
   * The caller owns the copy's id + name (the maker's id vocabulary).
   */
  public duplicateLayer(layerId: string, copy: Pick<LayerData, 'id' | 'name'>): boolean {
    return this._excalibur?.duplicateLayer(layerId, copy) ?? false
  }

  /**
   * Forward to `Engine.removeLayer` — one undoable `RemoveLayerCommand`
   * carrying everything on the layer, which is what lets the host offer
   * "Undo" in a toast instead of a confirmation dialog. `false` for the
   * last remaining layer.
   */
  public removeLayer(layerId: string): boolean {
    return this._excalibur?.removeLayer(layerId) ?? false
  }

  /**
   * Forward to `Engine.reorderLayer` — dispatches an undoable
   * `ReorderLayerCommand` (collab sync rides the command). The widget
   * relays the resulting `LAYER_LIST_CHANGED` on {@link events}.
   */
  public reorderLayer(layerId: string, index: number): boolean {
    return this._excalibur?.reorderLayer(layerId, index) ?? false
  }

  /** Forward to `Engine.setLayerPlane` — an undoable `SetLayerPlaneCommand`, optionally with a list position. */
  public setLayerPlane(layerId: string, plane: LayerPlane, index?: number): boolean {
    return this._excalibur?.setLayerPlane(layerId, plane, index) ?? false
  }

  /** Read whether a specific layer is locked on the active map. */
  public isLayerLocked(layerId: string): boolean {
    return this._excalibur?.isLayerLocked(layerId) ?? false
  }

  public get excalibur(): ExcaliburEngine | null {
    return this._excalibur
  }

  /**
   * Capture the engine canvas as PNG bytes by reading the WebGL
   * framebuffer DURING the next frame (`postdraw` — the only moment
   * GTK's GLArea framebuffer is bound and holds the finished frame;
   * an out-of-frame `gl.readPixels` returns blanks). No
   * `Gtk.WidgetPaintable`, so it works while the window is occluded —
   * GTK keeps ticking mapped-but-covered windows. Resolves `null`
   * when no engine is running or no frame arrives within `timeoutMs`
   * (e.g. minimised/unmapped: no frame clock — callers fall back to
   * the widget-snapshot path).
   */
  public captureCanvasPng(timeoutMs = 1000): Promise<Uint8Array | null> {
    const area = this._widget
    if (!area || !(area instanceof WebGLBridge)) return Promise.resolve(null)
    return new Promise((resolve) => {
      let done = false
      let handlerId = 0
      const finish = (result: Uint8Array | null) => {
        if (done) return
        done = true
        clearTimeout(timer)
        if (handlerId) area.disconnect(handlerId)
        resolve(result)
      }
      const timer = setTimeout(() => finish(null), timeoutMs)
      // connect_after('render'): runs after the frame was drawn into
      // the GLArea framebuffer, which is only bound inside ::render —
      // an out-of-frame readPixels reads blanks.
      handlerId = area.connect_after('render', () => {
        const gl = this._glContext()
        finish(gl ? readFramebufferPng(gl) : null)
        return false
      })
      // Force a frame even when the clock is idle (nothing animating).
      area.queue_render()
    })
  }

  /** The live WebGL context, or `null` when no GL engine is running. */
  private _glContext(): WebGL2RenderingContext | null {
    return (this._excalibur?.excalibur?.graphicsContext as unknown as { __gl?: WebGL2RenderingContext })?.__gl ?? null
  }

  /** Current camera zoom, or `null` if the engine isn't running yet. */
  public getCameraZoom(): number | null {
    const camera = this._excalibur?.excalibur?.currentScene?.camera
    return camera ? camera.zoom : null
  }

  /** Set the camera zoom (no-op if the engine isn't running yet). */
  public setCameraZoom(zoom: number): void {
    const camera = this._excalibur?.excalibur?.currentScene?.camera
    if (camera) camera.zoom = zoom
  }

  /**
   * Move the camera by a screen-pixel offset: the map follows the
   * fingers, so the camera travels the other way, and a screen pixel is
   * `1 / zoom` world units.
   *
   * Mirrors what `CameraControlSystem` does for a one-finger drag, but
   * the two-finger gesture cannot go through that path — it claims the
   * sequence away from the pointer stream precisely so the drag stops
   * feeding deltas (see `pinch-zoom.ts`).
   */
  public panCameraBy(screenDeltaX: number, screenDeltaY: number): void {
    const camera = this._excalibur?.excalibur?.currentScene?.camera
    if (!camera) return
    const zoom = camera.zoom || 1
    camera.pos = new Vector(camera.pos.x - screenDeltaX / zoom, camera.pos.y - screenDeltaY / zoom)
  }

  /**
   * Set the camera zoom while holding the world point under
   * (`screenX`, `screenY`) — widget-local pixels — in place.
   *
   * A camera whose `pos` is the viewport centre maps screen to world as
   * `pos + (screen − half) / zoom`. Keeping one world point fixed across
   * a zoom change therefore shifts `pos` by that offset times the
   * difference of the two reciprocals — no dependency on Excalibur's
   * per-frame camera transform, which has not been recomputed yet at the
   * moment this runs.
   */
  public zoomAboutPoint(zoom: number, screenX: number, screenY: number): void {
    const camera = this._excalibur?.excalibur?.currentScene?.camera
    const widget = this._widget
    if (!camera || !widget) return
    const previous = camera.zoom
    if (!(previous > 0) || !(zoom > 0) || previous === zoom) {
      if (camera) camera.zoom = zoom
      return
    }
    camera.zoom = zoom
    const offsetX = screenX - widget.get_allocated_width() / 2
    const offsetY = screenY - widget.get_allocated_height() / 2
    const reciprocalDelta = 1 / previous - 1 / zoom
    camera.pos = new Vector(camera.pos.x + offsetX * reciprocalDelta, camera.pos.y + offsetY * reciprocalDelta)
  }

  // --- VirtualStickHost ---------------------------------------------

  /**
   * {@link VirtualStickHost.isStickEnabled} — a press in the lower-left
   * corner only summons the stick while the controls are on screen.
   *
   * Asked BEFORE the gesture claims its sequence, because a claim is
   * unconditional: a stick that was merely invisible would still be
   * eating every brush stroke in that corner of the map.
   */
  public isStickEnabled(): boolean {
    return this._touchControlsVisible()
  }

  /** {@link VirtualStickHost.stickCanvasSize} — this widget's allocation. */
  public stickCanvasSize(): { width: number; height: number } {
    return { width: this.get_width(), height: this.get_height() }
  }

  /**
   * {@link VirtualStickHost.onStickChanged} — the thumb moved, or (with
   * `null`) left.
   */
  public onStickChanged(drag: StickDrag | null): void {
    this._stickDrag = drag
    if (this._stickHideTimeoutId) {
      GLib.source_remove(this._stickHideTimeoutId)
      this._stickHideTimeoutId = 0
    }

    if (drag) {
      this._placeStick(drag)
      this._stickBase.visible = true
      this._stickKnob.visible = true
    } else {
      // Fade out on a delay rather than at once: a player correcting
      // their grip lifts and re-lands within a few frames, and a stick
      // that blinked on every such lift reads as a glitch.
      this._stickHideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, STICK_HIDE_DELAY_MS, () => {
        this._stickHideTimeoutId = 0
        if (!this._stickDrag) {
          this._stickBase.visible = false
          this._stickKnob.visible = false
        }
        return GLib.SOURCE_REMOVE
      })
    }

    this._pushTouchIntent()
  }

  /**
   * Whether the Live Run's on-screen controls belong on screen.
   *
   * REDESIGN § 5.6 words the condition as "the last pointer event came
   * from a touchscreen, at any width". Taken literally that leaves the
   * documented bug — a phone Live Run with no way to steer — unfixed for
   * any session that used a mouse or stylus first, and nothing on screen
   * at all in the headless captures, where no finger exists. So the
   * phone breakpoint counts as its own reason: a window that narrow is
   * being held, and a wide window gets the controls as soon as a finger
   * proves there is a touchscreen.
   */
  private _touchControlsVisible(): boolean {
    return this._playing && (this._touchSeen || this._compactLayout)
  }

  /**
   * Show or hide the controls for the current state, and make sure no
   * intent survives their removal.
   */
  private _applyTouchControls(): void {
    const visible = this._touchControlsVisible()
    this._actionButton.visible = visible
    if (visible) return

    // Leaving a run with a thumb down would otherwise leave the hero
    // walking into the editor: the release lands on a gesture that is no
    // longer listened to, so the last non-neutral vector would be the
    // engine's final word.
    this._stickDrag = null
    this._stickButtons = { action: false, attack: false }
    this._stickBase.visible = false
    this._stickKnob.visible = false
    this._pushTouchIntent()
  }

  /**
   * Position the base and the knob by margins from the bottom-left
   * corner — the alignment both overlay children are given in
   * `engine.blp`.
   *
   * Margins cannot be negative, so the knob is clamped at the edge. That
   * only bites for a base already pushed against the canvas border,
   * where the knob is a few pixels short of where the thumb is; the
   * VECTOR is computed from the unclamped offset, so what the hero does
   * is unaffected either way.
   */
  private _placeStick(drag: StickDrag): void {
    const height = this.get_height()
    const place = (child: Gtk.Box, centreX: number, centreY: number, size: number) => {
      child.margin_start = Math.max(0, Math.round(centreX - size / 2))
      child.margin_bottom = Math.max(0, Math.round(height - centreY - size / 2))
    }
    place(this._stickBase, drag.origin.x, drag.origin.y, STICK_BASE_PX)
    place(this._stickKnob, drag.origin.x + drag.knob.x, drag.origin.y + drag.knob.y, STICK_KNOB_PX)
  }

  /**
   * Publish the current touch state as the engine's touch intent.
   *
   * Through `Engine.setTouchInput` → `TouchInputComponent` →
   * `InputSystem`'s merge, never by writing `InputSourceComponent`: that
   * component is what gameplay reads and `InputSystem` rewrites it from
   * the keyboard every tick, so a second writer would be erased inside
   * the same frame.
   */
  private _pushTouchIntent(): void {
    const intent: TouchIntent = touchIntent(this._stickDrag, this._stickButtons)
    this._excalibur?.setTouchInput(intent)
  }

  /**
   * Hold or release the action button.
   *
   * Pointer presses come from a capture-phase click gesture (press and
   * release are separate events there); a keyboard or screen-reader
   * activation arrives as a single `clicked` and is turned into an
   * {@link ACTION_PULSE_MS} hold instead.
   */
  private _setActionHeld(held: boolean): void {
    if (this._stickButtons.action === held) return
    this._stickButtons = { ...this._stickButtons, action: held }
    this._pushTouchIntent()
  }

  private _pulseAction(): void {
    if (this._actionPulseTimeoutId) GLib.source_remove(this._actionPulseTimeoutId)
    this._setActionHeld(true)
    this._actionPulseTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ACTION_PULSE_MS, () => {
      this._actionPulseTimeoutId = 0
      this._setActionHeld(false)
      return GLib.SOURCE_REMOVE
    })
  }

  /**
   * Wire the action button: a capture-phase click gesture for the
   * press/release pair gameplay needs, plus `clicked` for everyone who
   * activates the button without a pointer.
   *
   * The gesture never claims its sequence, so `Gtk.Button`'s own
   * press handling — the active state, the focus ring, `clicked` —
   * stays intact.
   */
  private _wireActionButton(): void {
    const press = new Gtk.GestureClick()
    press.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    press.connect('pressed', () => this._setActionHeld(true))
    press.connect('released', () => this._setActionHeld(false))
    press.connect('cancel', () => this._setActionHeld(false))
    this._actionButton.add_controller(press)

    this._actionButton.connect('clicked', () => {
      // A pointer click arrives here too, after its release — by which
      // point the gesture has already reported the hold, so pulsing
      // again would double the press.
      if (this._stickButtons.action) return
      this._pulseAction()
    })
  }

  /**
   * Subscribe to camera-zoom changes. The callback fires after every
   * engine update tick. Returns `true` if the subscription was
   * registered, `false` if the engine wasn't running yet.
   *
   * Subscriptions are auto-tracked alongside the other engine
   * subscriptions; no caller-side unsubscribe is needed within the
   * engine's lifetime.
   */
  public onCameraZoomChanged(cb: (zoom: number) => void): boolean {
    const excalibur = this._excalibur?.excalibur
    if (!excalibur) return false
    this._excaliburSubscriptions.push(
      excalibur.on('postupdate', () => {
        const zoom = excalibur.currentScene?.camera?.zoom
        if (typeof zoom === 'number') cb(zoom)
      }),
    )
    return true
  }

  /**
   * Subscribe to tile-granular pointer-position changes. Fires once
   * per tile crossing — see {@link ExcaliburEngine.onPointerTileChanged}
   * for semantics. Returns `true` if subscribed, `false` if the engine
   * hasn't started yet. Auto-cleaned alongside the other engine
   * subscriptions.
   */
  public onPointerTileChanged(cb: (event: { sceneId: string; tileX: number; tileY: number }) => void): boolean {
    const excalibur = this._excalibur
    if (!excalibur) return false
    const dispose = excalibur.onPointerTileChanged(cb)
    this._excaliburSubscriptions.push({ close: dispose })
    return true
  }

  /**
   * Repaint the Excalibur clear colour to match the current Adwaita
   * dark / light setting. Listens for `notify::dark` on the global
   * `Adw.StyleManager` so flipping the OS theme updates the canvas
   * background live.
   */
  private _applyScratchpadBackground(): void {
    const styleManager = Adw.StyleManager.get_default()
    const update = () => {
      const dark = styleManager.dark
      const colour = dark ? SCRATCHPAD_BG_DARK : SCRATCHPAD_BG_LIGHT
      // Set the ENGINE's backdrop, not Excalibur's clear colour directly:
      // every map load rewrites the clear colour, so a direct write only
      // held until the first map opened and the surround then cleared to
      // Excalibur's `Color.Transparent` — which is white at alpha 0.
      const engine = this._excalibur
      if (engine) engine.backdropColor = colour
    }
    update()
    // Track future theme switches; released in `_teardown`. Drop any
    // previous attachment first — this is the GLOBAL style manager, so
    // an overwritten handler id would pin this widget for the lifetime
    // of the process.
    if (this._styleManagerHandlerId) styleManager.disconnect(this._styleManagerHandlerId)
    this._styleManagerHandlerId = styleManager.connect('notify::dark', update)
  }

  private _startWithWidget(useFallback: boolean): void {
    let child = this._canvasContainer.get_first_child()
    while (child) {
      this._canvasContainer.remove(child)
      child = this._canvasContainer.get_first_child()
    }

    // Size-propagation note: the bridge widget's natural width can be
    // wide (matches the WebGL framebuffer). The ScrolledWindow wrap
    // around `canvasContainer` in `engine.blp` detaches that min
    // from bubbling up to the ApplicationWindow — see
    // `docs/concepts/responsive-chrome.md` § "Size-propagation
    // hazards" for the full chain.
    const widget = createCanvasBridge(useFallback)
    widget.installGlobals()
    this._canvasContainer.append(widget)
    this._widget = widget

    // Two fingers scale the map. One-finger drags stay with the camera
    // pan in `CameraControlSystem`; see `pinch-zoom.ts` for why the two
    // do not fight.
    attachPinchZoom(widget, this)

    // Two fingers undo, three redo — the touch shorthand for the
    // history pill in the corner. Routed as window actions so they go
    // through the same `win.undo` / `win.redo` the buttons and the
    // keyboard use, rather than reaching into the engine from here.
    attachMultiFingerTap(widget, (fingers) => {
      this.activate_action(fingers >= 3 ? 'win.redo' : 'win.undo', null)
    })

    // Press and hold: the engine decides what the hold means from the
    // armed tool and what is under the finger (a tile pick or a
    // placement's context menu) — see `TileEditorSystem.applyLongPress`.
    attachLongPress(widget, (x, y) => {
      this._excalibur?.longPressAt(x, y)
    })

    // A thumb in the lower-left corner of a Live Run steers the hero.
    // Only during a run — `isStickEnabled` is what keeps the gesture
    // off the editor's brush.
    attachVirtualStick(widget, this)

    // One finger anywhere on the canvas, ever, is proof of a
    // touchscreen; from then on a run shows its controls at any width.
    watchTouchSeen(widget, () => {
      if (this._touchSeen) return
      this._touchSeen = true
      this._applyTouchControls()
    })

    widget.onReady(async (canvas: HTMLCanvasElement) => {
      // Defer the focus grab out of the engine-init render burst.
      // Grabbing focus synchronously here queues a focus-outline redraw
      // that, under the un-paced render ticks of a freshly-created
      // GLArea (e.g. a headless / D-Bus-driven open where the window
      // isn't getting steady frame callbacks), can crash GTK inside
      // `gtk_css_style_snapshot_outline` — the intermittent engine-init
      // SIGSEGV in TODO.md (confirmed via core-dump backtrace).
      // Idle-scheduling lets the first frames settle before focus moves.
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        widget.grab_focus()
        return GLib.SOURCE_REMOVE
      })
      canvas.width = widget.get_allocated_width() || 800
      canvas.height = widget.get_allocated_height() || 600

      widget.onResize((w: number, h: number) => {
        // Sync the Excalibur viewport with the new GTK allocation
        // IMMEDIATELY — before the next GLArea render. Excalibur's
        // own `FillContainer` ResizeObserver also fires on every
        // notifyElementResize, but it dispatches via a microtask
        // (W3C spec — ResizeObserver batches entries through the
        // "deliver resize loop notifications" cycle). If GTK's next
        // render signal fires before that microtask flushes, the
        // freshly-allocated edge pixels show their initial GL state
        // (pure blue / uninitialized memory) for one frame — visible
        // as a bright flash during fast drags. Pushing the
        // resolution write synchronously here closes the gap: the
        // next render clears the entire new area with Excalibur's
        // backgroundColor (the scratchpad dark from
        // `_applyScratchpadBackground()`), not the GL default.
        if (w === 0 || h === 0) return
        const screen = this._excalibur?.excalibur.screen
        if (!screen) return
        try {
          screen.resolution = { width: w, height: h }
          screen.applyResolutionAndViewport()
        } catch {
          // screen not ready yet — ignore; observer microtask will catch up
        }
      })

      try {
        const engine = new ExcaliburEngine(canvas)
        this._excaliburSubscriptions.push(...forwardEngineEvents(engine, this))
        this._excalibur = engine
        engine.setViewportInset(this._viewportInset)
        await engine.initialize()
        // Apply the scratchpad backdrop colour as the engine clear
        // colour. With GLArea alpha compositing being unreliable on
        // this stack, painting the backdrop INSIDE the canvas is the
        // robust fallback — the empty area around the map matches the
        // editor scratchpad instead of showing through as opaque white.
        this._applyScratchpadBackground()
        this._ready = true
        // The `ready` signal settles every waiter; drop their rejectors
        // so a later teardown does not walk a list of dead callbacks.
        this._readyRejectors = []
        this.emit('ready')
      } catch (err) {
        const renderer = useFallback ? 'Canvas 2D' : 'WebGL'
        const detail = formatError(err)
        console.error(`[Engine] ${renderer} start failed: ${detail}`)
        this.status = EngineStatus.ERROR
        // `ready` will never be emitted now. Settle the waiters, or every
        // caller sits on a promise with nothing to report.
        this._failStart(`${renderer} start failed: ${detail}`)
        this.emit(EngineEvent.ERROR, detail)
        // Fallback disabled: swapping widgets after a failed GL init causes
        // libepoxy assertions (the dead GLArea context is still queried).
        // Re-enable once Excalibur cleanup is deterministic.
      }
    })
  }

  // Engine teardown is hooked at TWO points to cover the two paths a
  // widget can leave the tree:
  //
  //   1. App exit — the user closes the window. GTK fires
  //      `close-request` on the GtkWindow BEFORE starting widget
  //      destruction. We catch that and run teardown synchronously,
  //      well before the GC pass that the destruction kicks off.
  //      Without this hook the same teardown would fire from
  //      `vfunc_unroot` mid-GC, which prints
  //      `Attempting to run a JS callback during garbage collection`
  //      (GJS blocks the callback so it's harmless but noisy).
  //
  //   2. Reparent / view swap (no app exit) — the widget is removed
  //      from its parent while the window stays alive. No
  //      `close-request` fires; `vfunc_unroot` is the only signal.
  //      We run teardown there as the fallback.
  //
  // Both call the same `_teardown()` method, which is idempotent
  // (`_teardownComplete` guard), so the app-exit path runs
  // teardown once via `close-request` and then no-ops in
  // `vfunc_unroot`.
  //
  // We deliberately do NOT use `vfunc_unmap` because Adw.Breakpoint
  // reflow unmaps the engine widget when the OverlaySplitView
  // collapses past the tablet breakpoint — `unmap`-fired teardown
  // would stop the Excalibur game loop on every shrink and the
  // canvas would go blank for the rest of the session
  // (Excalibur.stop() → cancelAnimationFrame → frame callback
  // cleared → never recovers). We also avoid `vfunc_dispose`
  // because that always runs mid-GC.
  vfunc_root(): void {
    super.vfunc_root()
    // A re-root (view swap inside the same window) runs this again —
    // release the previous attachment first, or the old toplevel keeps
    // a handler nothing can reach any more.
    this._releaseCloseRequest()
    const root = this.get_root() as Gtk.Window | null
    if (!root || typeof (root as unknown as { connect?: unknown }).connect !== 'function') return
    this._closeRequestRoot = root
    this._closeRequestHandlerId = root.connect('close-request', () => {
      this._teardown()
      return false
    })
  }

  /** Drop the `close-request` handler from the window it was attached to. */
  private _releaseCloseRequest(): void {
    if (this._closeRequestHandlerId === 0) return
    try {
      this._closeRequestRoot?.disconnect(this._closeRequestHandlerId)
    } catch {
      // root may already be disposed
    }
    this._closeRequestHandlerId = 0
    this._closeRequestRoot = null
  }

  /**
   * Public teardown entry point for callers that destroy the widget
   * outside of the window-close path (e.g. `EngineController.dispose()`
   * when leaving the scene editor view). Idempotent — calling it
   * twice is a no-op. Must run BEFORE the widget is removed from its
   * parent, otherwise the C-side `unroot` happens first and we lose
   * the chance to stop Excalibur cleanly in a non-GC context.
   *
   * We deliberately do NOT override `vfunc_unroot` for this — GJS
   * blocks any JS-side vfunc invocation that fires during GC (the
   * widget destruction pass that follows `gtk_window_destroy()`
   * synchronously triggers GC pressure), so an override there would
   * print `Attempting to run a JS callback during garbage collection`
   * even if its body just delegated back to `super`. The C-side
   * default `unroot` handles the GTK-internal bookkeeping; we just
   * need to make sure our teardown happened first.
   */
  dispose(): void {
    this._teardown()
  }

  private _teardown(): void {
    if (this._teardownComplete) return
    this._teardownComplete = true

    this._releaseCloseRequest()
    this._failStart('engine widget was disposed')

    // The touch-control timers would otherwise fire into a disposed
    // widget — both callbacks touch template children.
    for (const id of [this._stickHideTimeoutId, this._actionPulseTimeoutId]) {
      if (id) GLib.source_remove(id)
    }
    this._stickHideTimeoutId = 0
    this._actionPulseTimeoutId = 0

    for (const subscription of this._excaliburSubscriptions) {
      try {
        subscription.close()
      } catch {
        // ignore — listener map may already be gone
      }
    }
    this._excaliburSubscriptions = []

    if (this._styleManagerHandlerId) {
      try {
        Adw.StyleManager.get_default().disconnect(this._styleManagerHandlerId)
      } catch {
        // already disposed
      }
      this._styleManagerHandlerId = 0
    }

    try {
      this._excalibur?.stop()
    } catch {
      // engine may not be started yet
    }
    this._excalibur?.events.clear()
    this._excalibur = null
  }

  /**
   * Record that the engine can never become ready, release the `ready`
   * handlers, and reject everyone waiting on them.
   *
   * Waiters used to be left pending on purpose — every caller
   * dereferences `this._excalibur!` straight after awaiting, so
   * resolving would swap a stall for a `TypeError`. Rejecting gives
   * callers the third option they actually need: `EngineController` can
   * rebuild the widget and `SceneNavigator` can tell the user the map
   * did not open, instead of both sitting on a promise that never
   * settles.
   */
  private _failStart(reason: string): void {
    this._startFailure ??= reason
    this._readyWaiters.disconnectAll()
    const rejectors = [...this._readyRejectors, ...this._inflightRejectors]
    this._readyRejectors = []
    this._inflightRejectors = []
    for (const reject of rejectors) reject(new EngineUnavailableError(reason))
  }

  /**
   * Resolve with `operation`, or reject as soon as the engine can no
   * longer finish it (teardown, failed start) — whichever happens first.
   *
   * See {@link _inflightRejectors} for the stall this closes.
   */
  private _untilTeardown<T>(operation: Promise<T>): Promise<T> {
    if (this._startFailure) {
      return Promise.reject(new EngineUnavailableError(this._startFailure))
    }
    let rejector!: (reason: Error) => void
    const abandoned = new Promise<never>((_resolve, reject) => {
      rejector = reject
    })
    this._inflightRejectors.push(rejector)
    const release = () => {
      const index = this._inflightRejectors.indexOf(rejector)
      if (index >= 0) this._inflightRejectors.splice(index, 1)
    }
    // `Promise.race` subscribes to both sides, so a rejection that
    // arrives after the race settled is already handled — no stray
    // unhandled-rejection warning when `release` loses the entry.
    return Promise.race([operation, abandoned]).finally(release)
  }

  /** `true` once this widget is disposed or its engine failed to start. */
  public get unusable(): boolean {
    return this._teardownComplete || this._startFailure !== null
  }

  /**
   * Resolve once the engine has emitted `ready`; reject if it never can
   * (teardown or a failed start), and reject after
   * {@link READY_TIMEOUT_MS} if the canvas simply never realises — a
   * `Gtk.GLArea` parented into a page that is never mapped emits no
   * `onReady` and no error, which used to leave every caller pending for
   * the rest of the session. A timeout does NOT mark the widget dead:
   * the engine may still be coming up, so the next call waits again.
   */
  private async _waitForReady(): Promise<void> {
    if (this._ready) return
    if (this._startFailure) throw new EngineUnavailableError(this._startFailure)
    await new Promise<void>((resolve, reject) => {
      let timeoutId = 0
      const settle = (finish: () => void) => {
        if (timeoutId) {
          GLib.source_remove(timeoutId)
          timeoutId = 0
        }
        const index = this._readyRejectors.indexOf(rejector)
        if (index >= 0) this._readyRejectors.splice(index, 1)
        finish()
      }
      const rejector = (reason: Error) => settle(() => reject(reason))
      this._readyRejectors.push(rejector)
      this._readyWaiters.connectUntil(this, 'ready', () => {
        settle(resolve)
        return true
      })
      timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, READY_TIMEOUT_MS, () => {
        timeoutId = 0
        settle(() => reject(new EngineUnavailableError(`canvas not ready after ${READY_TIMEOUT_MS} ms`)))
        return GLib.SOURCE_REMOVE
      })
    })
  }
}

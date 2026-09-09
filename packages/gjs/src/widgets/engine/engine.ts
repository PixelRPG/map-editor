import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { WebGLBridge } from '@gjsify/webgl'
import {
  type EditorTool,
  type EditorViewFlags,
  EngineEvent,
  type EngineEventMap,
  EngineStatus,
  Engine as ExcaliburEngine,
  formatError,
  type LayerData,
  type LayerPlane,
  type ProjectLoadOptions,
} from '@pixelrpg/engine'
import { Color, EventEmitter, type Subscription, Vector } from 'excalibur'
import { SignalScope } from '../../utils/signal-scope.ts'
import { type CanvasBridge, createCanvasBridge, readFramebufferPng } from './canvas-bridge.ts'
import { forwardEngineEvents } from './engine-events.ts'
import { attachPinchZoom } from './pinch-zoom.ts'
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
 * GJS engine widget.
 *
 * Hosts a gjsify WebGLBridge (WebGL 2, via Gtk.GLArea) and instantiates
 * the in-process Excalibur engine directly on its canvas. Falls back to
 * Canvas2DBridge (Cairo) if WebGL initialization fails.
 */
export class Engine extends Adw.Bin {
  private declare _canvasContainer: Gtk.Box

  private _widget: CanvasBridge | null = null
  private _excalibur: ExcaliburEngine | null = null
  private _ready = false
  private _excaliburSubscriptions: Subscription[] = []
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
  private _teardownComplete = false
  /** Why the engine can never become ready, once that is known. */
  private _startFailure: string | null = null

  public status: EngineStatus = EngineStatus.INITIALIZING
  public readonly events = new EventEmitter<EngineEventMap>()

  static {
    GObject.registerClass(
      {
        GTypeName: 'Engine',
        Template,
        InternalChildren: ['canvasContainer'],
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

  constructor(params: Engine.ConstructorProps = {}) {
    super(params)
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
    await this._excalibur!.loadProject(projectPath, options)
  }

  public async loadMap(mapId: string): Promise<void> {
    await this._waitForReady()
    await this._excalibur!.loadMap(mapId)
  }

  /** Forward to `Engine.currentMapId` — which map the engine has live, if any. */
  public get currentMapId(): string | null {
    return this._excalibur?.currentMapId ?? null
  }

  public async start(): Promise<void> {
    await this._waitForReady()
    await this._excalibur!.start()
  }

  public async stop(): Promise<void> {
    await this._waitForReady()
    await this._excalibur!.stop()
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

  /** Forward to `Engine.getEditorViewFlags`. */
  public getEditorViewFlags(): EditorViewFlags {
    return this._excalibur?.getEditorViewFlags() ?? { showGrid: false, dimInactiveLayers: false, objectsVisible: true }
  }

  /** Forward to `Engine.clearSaveState` — what ↺ Restart resets. */
  public clearSaveState(): void {
    this._excalibur?.clearSaveState()
  }

  /** Forward to `Engine.setRuntimeMode` — toggles editor ↔ playtest. */
  public setRuntimeMode(active: boolean): void {
    this._excalibur?.setRuntimeMode(active)
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
    const rejectors = this._readyRejectors
    this._readyRejectors = []
    for (const reject of rejectors) reject(new EngineUnavailableError(reason))
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

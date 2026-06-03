import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { Canvas2DBridge } from '@gjsify/canvas2d'
import { WebGLBridge } from '@gjsify/webgl'
import {
  type EditorTool,
  type EditorViewMode,
  EngineEvent,
  type EngineEventMap,
  EngineStatus,
  Engine as ExcaliburEngine,
  type ProjectLoadOptions,
} from '@pixelrpg/engine'
import { Color, EventEmitter, type Subscription } from 'excalibur'
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

function describeError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ? `${err.message}\n${err.stack}` : err.message
  }
  try {
    return typeof err === 'string' ? err : JSON.stringify(err)
  } catch {
    return String(err)
  }
}

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

  private _widget: WebGLBridge | Canvas2DBridge | null = null
  private _excalibur: ExcaliburEngine | null = null
  private _ready = false
  private _excaliburSubscriptions: Subscription[] = []
  private _closeRequestHandlerId = 0
  private _teardownComplete = false

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

  public async initialize(): Promise<void> {
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

  /** Forward to `Engine.setLayerVisible` — toggles render visibility + triggers a graphics rebuild. */
  public setLayerVisible(layerId: string, visible: boolean): boolean {
    return this._excalibur?.setLayerVisible(layerId, visible) ?? false
  }

  /** Forward to `Engine.setEditorViewMode` — toggles editor's grid view. */
  public setEditorViewMode(mode: EditorViewMode): void {
    this._excalibur?.setEditorViewMode(mode)
  }

  /** Forward to `Engine.getEditorViewMode`. */
  public getEditorViewMode(): EditorViewMode {
    return this._excalibur?.getEditorViewMode() ?? 'normal'
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

  /**
   * Subscribe to view-mode changes. Disposer is captured into
   * {@link _excaliburSubscriptions} so unmap releases it.
   */
  public onEditorViewModeChanged(cb: (mode: EditorViewMode) => void): boolean {
    if (!this._excalibur) return false
    const dispose = this._excalibur.onEditorViewModeChanged(cb)
    this._excaliburSubscriptions.push({ close: dispose })
    return true
  }

  /** Forward to `Engine.setLayerLocked` — toggles editor lock; no render change. */
  public setLayerLocked(layerId: string, locked: boolean): boolean {
    return this._excalibur?.setLayerLocked(layerId, locked) ?? false
  }

  /** Read whether a specific layer is locked on the active map. */
  public isLayerLocked(layerId: string): boolean {
    return this._excalibur?.isLayerLocked(layerId) ?? false
  }

  public get excalibur(): ExcaliburEngine | null {
    return this._excalibur
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
  public onPointerTileChanged(
    cb: (event: { sceneId: string; tileX: number; tileY: number }) => void,
  ): boolean {
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
      const excalibur = this._excalibur?.excalibur
      if (excalibur) excalibur.backgroundColor = colour
    }
    update()
    // Track future theme switches; clean up via the existing
    // disconnect helper on unmap.
    const handlerId = styleManager.connect('notify::dark', update)
    this._styleManagerHandlerId = handlerId
  }

  private _styleManagerHandlerId = 0

  private _startWithWidget(useFallback: boolean): void {
    let child = this._canvasContainer.get_first_child()
    while (child) {
      this._canvasContainer.remove(child)
      child = this._canvasContainer.get_first_child()
    }

    const widget = useFallback ? new Canvas2DBridge() : new WebGLBridge()
    widget.set_hexpand(true)
    widget.set_vexpand(true)
    // Size-propagation note: the bridge widget's natural width can be
    // wide (matches the WebGL framebuffer). The ScrolledWindow wrap
    // around `canvasContainer` in `engine.blp` detaches that min
    // from bubbling up to the ApplicationWindow — see
    // `docs/concepts/responsive-chrome.md` § "Size-propagation
    // hazards" for the full chain.
    //
    // The WebGL bridge is a `Gtk.GLArea`, which defaults to an opaque
    // framebuffer. Excalibur clears with `Color.Transparent`, but
    // without `has-alpha` the alpha channel is dropped by GLArea
    // before composition — the GTK widgets behind the canvas (the
    // editor scratchpad backdrop) stay invisible. Opting into alpha
    // here lets the canvas composite against the GTK background.
    //
    // `set_has_alpha` MUST happen before the area is realized; doing
    // it right after construction (and before `append`) keeps the
    // ordering safe.
    if (typeof (widget as { set_has_alpha?: (v: boolean) => void }).set_has_alpha === 'function') {
      ;(widget as unknown as { set_has_alpha: (v: boolean) => void }).set_has_alpha(true)
    } else {
      // Fallback for GIR bindings that expose the GObject property
      // directly instead of the explicit setter.
      try {
        ;(widget as unknown as { has_alpha?: boolean }).has_alpha = true
      } catch {
        // Property may not be settable in this binding; ignore.
      }
    }
    // The Canvas2D fallback isn't a GLArea — paint over a transparent
    // CSS background so it composites the same way.
    widget.add_css_class('engine-canvas')
    widget.installGlobals()
    this._canvasContainer.append(widget)
    this._widget = widget

    widget.onReady(async (canvas: HTMLCanvasElement) => {
      widget.grab_focus()
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
        this._forwardEvents(engine)
        this._excalibur = engine
        await engine.initialize()
        // Apply the scratchpad backdrop colour as the engine clear
        // colour. With GLArea alpha compositing being unreliable on
        // this stack, painting the backdrop INSIDE the canvas is the
        // robust fallback — the empty area around the map matches the
        // editor scratchpad instead of showing through as opaque white.
        this._applyScratchpadBackground()
        this._ready = true
        this.emit('ready')
      } catch (err) {
        const renderer = useFallback ? 'Canvas 2D' : 'WebGL'
        const detail = describeError(err)
        console.error(`[Engine] ${renderer} start failed: ${detail}`)
        this.status = EngineStatus.ERROR
        this.emit(EngineEvent.ERROR, detail)
        // Fallback disabled: swapping widgets after a failed GL init causes
        // libepoxy assertions (the dead GLArea context is still queried).
        // Re-enable once Excalibur cleanup is deterministic.
      }
    })
  }

  private _forwardEvents(engine: ExcaliburEngine): void {
    // Relays each event to the widget's own EventEmitter (typed payload
    // for engine-aware consumers) and — if `gobjectArg` is provided —
    // also emits a GObject signal carrying a single extracted field
    // for Blueprint bindings + classic signal handlers.
    const fwd = <K extends keyof EngineEventMap>(
      event: K,
      gobjectArg?: (payload: EngineEventMap[K]) => unknown,
    ) =>
      engine.events.on(event, (p) => {
        this.events.emit(event, p)
        if (gobjectArg) this.emit(event, gobjectArg(p))
      })

    this._excaliburSubscriptions.push(
      engine.events.on(EngineEvent.STATUS_CHANGED, (p) => {
        // STATUS_CHANGED additionally drives `this.status` (a GObject
        // property), so it stays out of the `fwd` factory.
        this.status = p.status
        this.events.emit(EngineEvent.STATUS_CHANGED, p)
        this.emit(EngineEvent.STATUS_CHANGED, p.status)
      }),
      fwd(EngineEvent.PROJECT_LOADED, (p) => p.projectPath),
      fwd(EngineEvent.MAP_LOADED, (p) => p.mapId),
      fwd(EngineEvent.ERROR, (p) => p.message),
      fwd(EngineEvent.TILE_CLICKED),
      fwd(EngineEvent.TILE_HOVERED),
      fwd(EngineEvent.TILE_PLACED),
      fwd(EngineEvent.TILE_PICKED),
    )
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
    const root = this.get_root() as Gtk.Window | null
    if (!root || typeof (root as unknown as { connect?: unknown }).connect !== 'function') return
    this._closeRequestHandlerId = root.connect('close-request', () => {
      this._teardown()
      return false
    })
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

    if (this._closeRequestHandlerId !== 0) {
      try {
        ;(this.get_root() as Gtk.Window | null)?.disconnect(this._closeRequestHandlerId)
      } catch {
        // root may already be disposed
      }
      this._closeRequestHandlerId = 0
    }

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

  private async _waitForReady(): Promise<void> {
    if (this._ready) return
    await new Promise<void>((resolve) => {
      const id = this.connect('ready', () => {
        this.disconnect(id)
        resolve()
      })
    })
  }
}

import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
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
  /**
   * Pending resize state — the latest (w, h) the GLArea has reported
   * since the last time we actually pushed it into the canvas /
   * Excalibur viewport. We frame-throttle resize handling because
   * each `canvas.width = …` / `applyResolutionAndViewport()` pair
   * is expensive (framebuffer reallocation + GL state reset), and
   * Gtk fires resize events ~60/s while the user drags a window
   * edge or the Adw.OverlaySplitView animates its sidebar in/out.
   */
  private _pendingResize: { w: number; h: number } | null = null
  private _resizeTimeoutId: number | null = null

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
        // Defend against transient 0 × 0 allocations during the
        // mobile breakpoint reflow — Excalibur's screen API would
        // happily reconfigure to a 0 px viewport.
        if (w === 0 || h === 0) return
        // Frame-throttle the viewport recalc. Gtk emits resize
        // events ~60 / second while the user drags a window edge
        // or AdwOverlaySplitView animates its sidebar; coalescing
        // to ~33 ms keeps the per-frame work bounded.
        //
        // Why both `screen.resolution = …` AND
        // `applyResolutionAndViewport()`: Excalibur's
        // `FillContainer` DisplayMode normally recalculates its
        // resolution from the parent element via a `ResizeObserver`
        // — but in GJS the ResizeObserver doesn't see Gtk
        // allocation changes, so Excalibur never learns the
        // canvas has been resized. Setting `screen.resolution`
        // explicitly here gives it the new dimensions; the
        // subsequent `applyResolutionAndViewport()` propagates
        // them into the canvas backing store + WebGL viewport.
        // Without the explicit resolution write, the apply call
        // keeps reconfiguring at the initial size and the
        // user sees a blank canvas at every resize except the
        // first paint.
        this._pendingResize = { w, h }
        if (this._resizeTimeoutId != null) return
        this._resizeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 33, () => {
          this._resizeTimeoutId = null
          const pending = this._pendingResize
          this._pendingResize = null
          if (!pending) return GLib.SOURCE_REMOVE
          const screen = this._excalibur?.excalibur.screen
          if (!screen) return GLib.SOURCE_REMOVE
          try {
            screen.resolution = { width: pending.w, height: pending.h }
            screen.applyResolutionAndViewport()
          } catch {
            // screen not ready yet — ignore
          }
          return GLib.SOURCE_REMOVE
        })
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
    this._excaliburSubscriptions.push(
      engine.events.on(EngineEvent.STATUS_CHANGED, (p) => {
        this.status = p.status
        this.events.emit(EngineEvent.STATUS_CHANGED, p)
        this.emit(EngineEvent.STATUS_CHANGED, p.status)
      }),
      engine.events.on(EngineEvent.PROJECT_LOADED, (p) => {
        this.events.emit(EngineEvent.PROJECT_LOADED, p)
        this.emit(EngineEvent.PROJECT_LOADED, p.projectPath)
      }),
      engine.events.on(EngineEvent.MAP_LOADED, (p) => {
        this.events.emit(EngineEvent.MAP_LOADED, p)
        this.emit(EngineEvent.MAP_LOADED, p.mapId)
      }),
      engine.events.on(EngineEvent.ERROR, (p) => {
        this.events.emit(EngineEvent.ERROR, p)
        this.emit(EngineEvent.ERROR, p.message)
      }),
      engine.events.on(EngineEvent.TILE_CLICKED, (p) => {
        this.events.emit(EngineEvent.TILE_CLICKED, p)
      }),
      engine.events.on(EngineEvent.TILE_HOVERED, (p) => {
        this.events.emit(EngineEvent.TILE_HOVERED, p)
      }),
      engine.events.on(EngineEvent.TILE_PLACED, (p) => {
        this.events.emit(EngineEvent.TILE_PLACED, p)
      }),
      engine.events.on(EngineEvent.TILE_PICKED, (p) => {
        this.events.emit(EngineEvent.TILE_PICKED, p)
      }),
    )
  }

  // Tear down the Excalibur engine + its event bridge before GJS starts
  // reclaiming the widget. Running this in `vfunc_unmap` (not in dispose)
  // keeps us off the GC path, which would otherwise trigger
  // "Attempting to run a JS callback during garbage collection" criticals
  // on app exit.
  vfunc_unmap(): void {
    for (const subscription of this._excaliburSubscriptions) {
      try {
        subscription.close()
      } catch {
        // ignore — listener map may already be gone
      }
    }
    this._excaliburSubscriptions = []

    // Drop the pending resize-throttle timer so it doesn't fire
    // after the engine is torn down and try to write into a
    // null `_excalibur`.
    if (this._resizeTimeoutId != null) {
      try {
        GLib.source_remove(this._resizeTimeoutId)
      } catch {
        // source may already have fired or been removed
      }
      this._resizeTimeoutId = null
      this._pendingResize = null
    }

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

    super.vfunc_unmap()
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

import { EngineEvent, type EngineEventMap } from '@pixelrpg/engine'
import { Engine } from '@pixelrpg/gjs'

type TilePickedPayload = EngineEventMap[EngineEvent.TILE_PICKED]

/**
 * Slot the engine widget gets attached to once it's been (re)created.
 * In the maker that's the `SceneEditorView.setEngineWidget` call —
 * keeping the integration point as a callback lets this controller
 * stay UI-agnostic and unit-testable later.
 */
export type EngineSlot = (engine: Engine | null) => void

/**
 * Encapsulates the engine widget's lifecycle for the maker:
 *
 * - Creates a fresh `Engine` on demand, initialises it, hands it to the
 *   host slot, loads project + map, and applies the default editor
 *   state.
 * - Caches the currently-loaded project / map so subsequent
 *   `ensureForMap` calls skip re-loading the same data.
 * - Wires the zoom-from-engine hook exactly once per engine instance
 *   and dispatches changes to a single subscriber.
 * - Disposes cleanly when the host navigates away from the scene
 *   editor (`vfunc_unmap` on the gjs `Engine` widget nulls out the
 *   underlying Excalibur instance, so caching the wrapper across view
 *   switches yields a TypeError on the next call).
 *
 * The host should call {@link dispose} from `_setView` when leaving
 * the scene editor and {@link ensureForMap} from `_hydrateSceneEditor`
 * when entering it.
 */
export class EngineController {
  private _engine: Engine | null = null
  private _projectPath: string | null = null
  private _mapId: string | null = null
  private _zoomHookAttached = false
  private _lastReportedZoom = 1
  private _zoomListener: ((zoom: number) => void) | null = null
  private _undoHookAttached = false
  private _undoListener: ((state: { canUndo: boolean; canRedo: boolean }) => void) | null = null
  private _tilePickedHookAttached = false
  private _tilePickedListener: ((payload: TilePickedPayload) => void) | null = null
  private _pointerTileHookAttached = false
  private _pointerTileListener:
    | ((payload: { sceneId: string; tileX: number; tileY: number }) => void)
    | null = null

  constructor(private readonly slot: EngineSlot) {}

  /** The currently-active engine, or `null` if disposed. */
  get engine(): Engine | null {
    return this._engine
  }

  /**
   * Called by the host on every postupdate zoom change. Forwarded
   * to the registered listener unless the change is below the
   * 0.01-zoom dead-band (avoids spamming the OSD label on tiny
   * floating-point drift).
   */
  onZoomChanged(listener: (zoom: number) => void): void {
    this._zoomListener = listener
  }

  /**
   * Register a listener that fires whenever the active scene's
   * undo-stack mutates (paint / erase / undo / redo). Mirrors
   * {@link onZoomChanged} — the listener is invoked once
   * synchronously with the current `{ canUndo, canRedo }` snapshot
   * once an engine + map are loaded, then again on every stack
   * change. The maker uses this to keep `win.undo` / `win.redo`
   * `GAction.enabled` in sync so the OSD buttons + Ctrl+Z grey out
   * at stack boundaries.
   */
  onUndoChanged(listener: (state: { canUndo: boolean; canRedo: boolean }) => void): void {
    this._undoListener = listener
  }

  /**
   * Register a listener for the engine's `TILE_PICKED` event (emitted
   * by `TileEditorSystem` when the user clicks while the eyedropper
   * tool is active). Mirrors {@link onZoomChanged} — listener is
   * stored once on the controller and re-attached lazily after each
   * `ensureForMap` via {@link _attachTilePickedHook}.
   *
   * The host typically responds by routing the picked tile through
   * its existing tile-palette state (so palette highlight + context
   * chip + engine `ActiveTileComponent` all stay in sync) and by
   * switching the tool action back to `pencil` for a Tiled-style
   * "pick then immediately paint" workflow.
   */
  onTilePicked(listener: (payload: TilePickedPayload) => void): void {
    this._tilePickedListener = listener
  }

  /**
   * Register a listener fired once per pointer tile-transition over
   * the active map. The host uses this to drive the floating-zoom
   * OSD's coord readout (the label that reads e.g. `12, 7` next to
   * the zoom buttons). Mirrors {@link onZoomChanged} — listener is
   * stored once and re-attached lazily after each `ensureForMap`
   * via {@link _attachPointerTileHook}.
   */
  onPointerTileChanged(
    listener: (payload: { sceneId: string; tileX: number; tileY: number }) => void,
  ): void {
    this._pointerTileListener = listener
  }

  /**
   * Ensure the engine is alive, attached to the host slot, and has the
   * requested project + map loaded. Recreates the engine if the
   * cached wrapper has lost its Excalibur instance.
   */
  async ensureForMap(projectPath: string, mapId: string): Promise<void> {
    if (this._engine && !this._engine.excalibur) {
      this.dispose()
    }

    if (!this._engine) {
      this._engine = new Engine()
      this.slot(this._engine)
      await this._engine.initialize()
    } else {
      // Re-attach in case the host cleared the slot during a view switch.
      this.slot(this._engine)
    }

    if (this._projectPath !== projectPath) {
      await this._engine.loadProject(projectPath)
      this._projectPath = projectPath
      this._mapId = null
    }
    if (this._mapId !== mapId) {
      await this._engine.loadMap(mapId)
      this._mapId = mapId
    }

    // Active tool / tile / layer are pushed by the host
    // (`ApplicationWindow._hydrateSceneEditor`) so the UI's GAction
    // stays the source of truth across map switches. The controller
    // intentionally doesn't reset them here; doing so would force the
    // tool back to a hardcoded default and desync from the toolbar.

    this._attachZoomHook()
    this._attachUndoHook()
    this._attachTilePickedHook()
    this._attachPointerTileHook()
  }

  /**
   * Invalidate the cached project/map paths without tearing the engine
   * down — used after a project reload so the next `ensureForMap`
   * call re-runs `loadProject` against the same path.
   */
  invalidateCache(): void {
    this._projectPath = null
    this._mapId = null
  }

  /** Tear the engine down. Idempotent. */
  dispose(): void {
    if (!this._engine) return
    // Tear the Excalibur engine + bridge subscriptions down BEFORE
    // detaching the widget from its parent. The widget's own
    // `vfunc_unroot` can't be overridden to do this work because
    // GTK widget destruction kicks off a GC pass and GJS blocks
    // any JS-side vfunc call that fires during GC (the
    // `Attempting to run a JS callback during garbage collection`
    // critical). Calling `Engine.dispose()` synchronously here keeps
    // teardown in a user-action context where JS callbacks run
    // freely.
    this._engine.dispose()
    this.slot(null)
    this._engine = null
    this._projectPath = null
    this._mapId = null
    this._zoomHookAttached = false
    this._undoHookAttached = false
    this._tilePickedHookAttached = false
    this._pointerTileHookAttached = false
    // Drop the cached undo state on the host side too — without an
    // engine, both actions should be disabled regardless of what the
    // last loaded scene reported.
    this._undoListener?.({ canUndo: false, canRedo: false })
  }

  /** Read the current camera zoom (1 = 100%) or `null` if no engine. */
  getCameraZoom(): number | null {
    return this._engine?.getCameraZoom() ?? null
  }

  /** Apply an absolute zoom value to the camera. No-op if no engine. */
  applyZoom(zoom: number): void {
    if (this._engine?.getCameraZoom() == null) return
    this._engine.setCameraZoom(zoom)
  }

  /**
   * Bump the camera zoom by `delta` (0.2 = +20%), clamped to a
   * reasonable [0.1, 4] range and rounded to one decimal to match the
   * engine's own scroll-wheel-zoom granularity.
   */
  stepZoom(delta: number): void {
    const current = this.getCameraZoom()
    if (current == null) return
    const next = Math.max(0.1, Math.min(4, Math.round((current + delta) * 10) / 10))
    this.applyZoom(next)
  }

  private _attachZoomHook(): void {
    if (this._zoomHookAttached || !this._engine) return
    this._zoomHookAttached = this._engine.onCameraZoomChanged((zoom) => {
      if (Math.abs(zoom - this._lastReportedZoom) < 0.01) return
      this._lastReportedZoom = zoom
      this._zoomListener?.(zoom)
    })
  }

  private _attachUndoHook(): void {
    if (this._undoHookAttached || !this._engine) return
    this._undoHookAttached = this._engine.onUndoStackChanged((state) => {
      this._undoListener?.(state)
    })
  }

  private _attachTilePickedHook(): void {
    if (this._tilePickedHookAttached || !this._engine) return
    // The gjs Engine widget owns the EventEmitter; on dispose the
    // widget is dropped and its emitter is GC'd along with this
    // closure, so we don't track an explicit Subscription handle.
    this._engine.events.on(EngineEvent.TILE_PICKED, (payload) => {
      this._tilePickedListener?.(payload)
    })
    this._tilePickedHookAttached = true
  }

  private _attachPointerTileHook(): void {
    if (this._pointerTileHookAttached || !this._engine) return
    this._pointerTileHookAttached = this._engine.onPointerTileChanged((payload) => {
      this._pointerTileListener?.(payload)
    })
  }
}

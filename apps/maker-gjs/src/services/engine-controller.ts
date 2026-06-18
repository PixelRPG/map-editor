import { EngineEvent, type EngineEventMap } from '@pixelrpg/engine'
import { Engine } from '@pixelrpg/gjs'
import { TypedEmitter } from './typed-emitter.ts'

type TilePickedPayload = EngineEventMap[EngineEvent.TILE_PICKED]
type PlacementSelectedPayload = EngineEventMap[EngineEvent.PLACEMENT_SELECTED]
type LayerFlagChangedPayload = EngineEventMap[EngineEvent.LAYER_FLAG_CHANGED]

/**
 * Slot the engine widget gets attached to once it's been (re)created.
 * In the maker that's the `SceneEditorView.setEngineWidget` call —
 * keeping the integration point as a callback lets this controller
 * stay UI-agnostic and unit-testable later.
 */
export type EngineSlot = (engine: Engine | null) => void

/** Typed event map for {@link EngineController.on}. */
export interface EngineControllerEvents {
  /**
   * Camera zoom changed (scroll-wheel, Ctrl+= etc.). Filtered through a
   * 0.01-zoom dead-band so tiny floating-point drift doesn't spam the
   * OSD label.
   */
  'zoom-changed': number
  /**
   * The active scene's undo-stack mutated (paint / erase / undo /
   * redo). Fired once with the current snapshot when an engine + map
   * load, then on every stack change — and with `{ false, false }` on
   * {@link EngineController.dispose} so `win.undo` / `win.redo` grey
   * out without an engine.
   */
  'undo-changed': { canUndo: boolean; canRedo: boolean }
  /**
   * The engine's `TILE_PICKED` event (eyedropper click). The host
   * routes the picked tile through its tile-palette state (palette
   * highlight + context chip + engine `ActiveTileComponent` stay in
   * sync) and flips the tool back to `pencil` for a Tiled-style
   * "pick then immediately paint" workflow.
   */
  'tile-picked': TilePickedPayload
  /**
   * The engine's `PLACEMENT_SELECTED` event (`'select'`-tool click).
   * The host mirrors the pick into the right-inspector's objects-tab
   * row highlight; the engine-side selection state is already mutated
   * inside the system, so the canvas ring updates without the host.
   */
  'placement-selected': PlacementSelectedPayload
  /**
   * The engine's `LAYER_FLAG_CHANGED` event — fired on every
   * application path of the layer-flag commands (local toggle,
   * undo/redo, AND inbound peer ops, which don't emit
   * `COMMAND_EXECUTED`) so the Layers tab follows changes the
   * inspector didn't originate, just like the canvas does.
   */
  'layer-flag-changed': LayerFlagChangedPayload
  /**
   * Fired once per pointer tile-transition over the active map — drives
   * the floating-zoom OSD's coord readout (the `12, 7` label).
   */
  'pointer-tile-changed': { sceneId: string; tileX: number; tileY: number }
}

/**
 * Encapsulates the engine widget's lifecycle for the maker:
 *
 * - Creates a fresh `Engine` on demand, initialises it, hands it to the
 *   host slot, loads project + map, and applies the default editor
 *   state.
 * - Caches the currently-loaded project / map so subsequent
 *   `ensureForMap` calls skip re-loading the same data.
 * - Wires the engine hooks exactly once per engine instance and
 *   re-emits them as typed controller events (see
 *   {@link EngineControllerEvents}) — subscribe via {@link on}.
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
  private _undoHookAttached = false
  private _tilePickedHookAttached = false
  private _placementSelectedHookAttached = false
  private _layerFlagHookAttached = false
  private _pointerTileHookAttached = false
  private readonly _events = new TypedEmitter<EngineControllerEvents>()
  /**
   * Excalibur `events.on(...)` subscriptions opened on the current engine
   * (TILE_PICKED / PLACEMENT_SELECTED / LAYER_FLAG_CHANGED). Closed in
   * {@link dispose} so teardown is deterministic rather than relying on the
   * engine emitter being GC'd — the closures capture `this`, so a pinned
   * emitter would otherwise keep firing into a controller whose `_engine`
   * is a newer instance. (The zoom/undo/pointer hooks return a boolean; the
   * gjs `Engine` widget owns those subscriptions and drops them on dispose.)
   */
  private readonly _hookSubs: Array<{ close(): void }> = []

  constructor(private readonly slot: EngineSlot) {}

  /** The currently-active engine, or `null` if disposed. */
  get engine(): Engine | null {
    return this._engine
  }

  /** Subscribe to a controller event. Returns an unsubscribe closure. */
  on<K extends keyof EngineControllerEvents>(
    event: K,
    listener: (payload: EngineControllerEvents[K]) => void,
  ): () => void {
    return this._events.on(event, listener)
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
    this._attachPlacementSelectedHook()
    this._attachLayerFlagHook()
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
    // Close the excalibur subscriptions we own before tearing the engine
    // down, so the capturing closures stop firing deterministically.
    for (const sub of this._hookSubs) sub.close()
    this._hookSubs.length = 0
    this._engine.dispose()
    this.slot(null)
    this._engine = null
    this._projectPath = null
    this._mapId = null
    this._zoomHookAttached = false
    this._undoHookAttached = false
    this._tilePickedHookAttached = false
    this._placementSelectedHookAttached = false
    this._layerFlagHookAttached = false
    this._pointerTileHookAttached = false
    // Drop the cached undo state on the host side too — without an
    // engine, both actions should be disabled regardless of what the
    // last loaded scene reported.
    this._events.emit('undo-changed', { canUndo: false, canRedo: false })
  }

  /** Read the current camera zoom (1 = 100%) or `null` if no engine. */
  getCameraZoom(): number | null {
    return this._engine?.getCameraZoom() ?? null
  }

  /** Apply an absolute zoom value to the camera. Returns `false` (untouched) if no engine. */
  applyZoom(zoom: number): boolean {
    if (this._engine?.getCameraZoom() == null) return false
    this._engine.setCameraZoom(zoom)
    return true
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
      this._events.emit('zoom-changed', zoom)
    })
  }

  private _attachUndoHook(): void {
    if (this._undoHookAttached || !this._engine) return
    this._undoHookAttached = this._engine.onUndoStackChanged((state) => {
      this._events.emit('undo-changed', state)
    })
  }

  private _attachTilePickedHook(): void {
    if (this._tilePickedHookAttached || !this._engine) return
    this._hookSubs.push(
      this._engine.events.on(EngineEvent.TILE_PICKED, (payload) => {
        this._events.emit('tile-picked', payload)
      }),
    )
    this._tilePickedHookAttached = true
  }

  private _attachPlacementSelectedHook(): void {
    if (this._placementSelectedHookAttached || !this._engine) return
    this._hookSubs.push(
      this._engine.events.on(EngineEvent.PLACEMENT_SELECTED, (payload) => {
        this._events.emit('placement-selected', payload)
      }),
    )
    this._placementSelectedHookAttached = true
  }

  private _attachLayerFlagHook(): void {
    if (this._layerFlagHookAttached || !this._engine) return
    this._hookSubs.push(
      this._engine.events.on(EngineEvent.LAYER_FLAG_CHANGED, (payload) => {
        this._events.emit('layer-flag-changed', payload)
      }),
    )
    this._layerFlagHookAttached = true
  }

  private _attachPointerTileHook(): void {
    if (this._pointerTileHookAttached || !this._engine) return
    this._pointerTileHookAttached = this._engine.onPointerTileChanged((payload) => {
      this._events.emit('pointer-tile-changed', payload)
    })
  }
}

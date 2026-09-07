import { EngineEvent, type EngineEventMap } from '@pixelrpg/engine'
import type { Engine } from '@pixelrpg/gjs'
import { SerialQueue } from './serial-queue.ts'
import { TypedEmitter } from './typed-emitter.ts'
import { calculateNextZoom, shouldReportZoomChange } from './zoom-math.ts'

type TilePickedPayload = EngineEventMap[EngineEvent.TILE_PICKED]
type PlacementSelectedPayload = EngineEventMap[EngineEvent.PLACEMENT_SELECTED]
type LayerFlagChangedPayload = EngineEventMap[EngineEvent.LAYER_FLAG_CHANGED]
type LayerListChangedPayload = EngineEventMap[EngineEvent.LAYER_LIST_CHANGED]
type ShowTextPayload = EngineEventMap[EngineEvent.SHOW_TEXT_REQUESTED]
type ItemPickedUpPayload = EngineEventMap[EngineEvent.ITEM_PICKED_UP]
type FlagSetPayload = EngineEventMap[EngineEvent.FLAG_SET]
type PlaySfxPayload = EngineEventMap[EngineEvent.PLAY_SFX_REQUESTED]

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
   * The engine's `LAYER_LIST_CHANGED` event — a layer was added, moved
   * or changed plane on any application path (local, undo/redo, inbound
   * peer op). The host re-reads the map's layer list into the Layers tab.
   */
  'layer-list-changed': LayerListChangedPayload
  /**
   * Fired once per pointer tile-transition over the active map — drives
   * the floating-zoom OSD's coord readout (the `12, 7` label).
   */
  'pointer-tile-changed': { sceneId: string; tileX: number; tileY: number }
  /**
   * Runtime event-script effects (playtest). The engine's
   * `EventActionSystem` emits these when a trigger fires; the host
   * surfaces them as toasts today. A real in-game dialogue box (show
   * text), inventory (item pickup) and audio layer (sfx) are future
   * work — see TODO.md.
   */
  'show-text': ShowTextPayload
  'item-picked-up': ItemPickedUpPayload
  'flag-set': FlagSetPayload
  'play-sfx': PlaySfxPayload
}

/**
 * Every engine → UI bridge {@link EngineController} opens, named. One
 * name per hook, attached once per engine instance and forgotten
 * wholesale on {@link EngineController.dispose} — see
 * {@link EngineController._attachedHooks} for why they are a set and
 * not a field each.
 */
export const ENGINE_HOOKS = [
  'zoom',
  'undo',
  'tile-picked',
  'placement-selected',
  'layer-flag',
  'layer-list',
  'pointer-tile',
  'runtime-effects',
] as const

/** One of {@link ENGINE_HOOKS}. */
export type EngineHook = (typeof ENGINE_HOOKS)[number]

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
  private _lastReportedZoom = 1
  /**
   * Which of {@link ENGINE_HOOKS} are live on the CURRENT engine — the
   * only record of that, so {@link dispose} forgets all of them by
   * clearing one set.
   *
   * It used to be one `_xHookAttached` boolean per hook, reset by a
   * hand-written list in `dispose`; that list had already lost
   * `layer-list`, so after one view switch the Layers tab stopped
   * following add / reorder / plane changes with nothing reporting it.
   * A set cannot fall out of sync with itself.
   */
  private readonly _attachedHooks = new Set<EngineHook>()
  private readonly _events = new TypedEmitter<EngineControllerEvents>()
  /**
   * Excalibur `events.on(...)` subscriptions opened on the current engine
   * (TILE_PICKED / PLACEMENT_SELECTED / LAYER_FLAG_CHANGED). Closed in
   * {@link dispose} so teardown is deterministic rather than relying on the
   * engine emitter being GC'd — the closures capture `this`, so a pinned
   * emitter would otherwise keep firing into a controller whose `_engine`
   * is a newer instance. (The zoom/undo/pointer hooks are not in here: the
   * gjs `Engine` widget keeps those disposers itself and releases them in
   * its own teardown, which is why those three `on…` methods answer with a
   * plain "did I subscribe?" boolean.)
   */
  private readonly _hookSubs: Array<{ close(): void }> = []
  /** Bring-up runs one at a time — see {@link ensureForMap}. */
  private readonly _queue = new SerialQueue()

  /**
   * @param slot        where the engine widget gets mounted.
   * @param createEngine builds the engine widget. Injected rather than
   *   `new Engine()`-ed inline so this controller stays free of a value
   *   import from `@pixelrpg/gjs` — that keeps it (and its hook wiring)
   *   unit-testable off the GTK stack.
   */
  constructor(
    private readonly slot: EngineSlot,
    private readonly createEngine: () => Engine,
  ) {}

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
   *
   * Calls are SERIALISED — a second one queues behind the first instead
   * of interleaving with it. Every caller arrives through
   * `SceneNavigator.open`, which starts hydration with `void
   * this._hydrate(…)`, so two map opens in quick succession (an atlas
   * double-click, two `win.open-scene-by-id` in a row) used to run
   * concurrently over `_engine`, `_projectPath` and `_mapId`. Both then
   * read `_projectPath === null`, both called `loadProject`, and two
   * `excalibur.start()` calls on one Excalibur engine deadlock: neither
   * loader ever reaches `afterload`, so no map is ever loaded and BOTH
   * hydration chains hang forever with no error to report. The editor
   * sits on an empty scene for the rest of the session. Serialising is
   * what makes the cache checks below mean anything.
   */
  ensureForMap(projectPath: string, mapId: string): Promise<void> {
    return this._queue.run(() => this._bringUp(projectPath, mapId))
  }

  private async _bringUp(projectPath: string, mapId: string): Promise<void> {
    // `unusable`, not `!excalibur`: the widget assigns its Excalibur
    // instance only once the GLArea has realised, so `!excalibur` is
    // also true for an engine that is merely still starting. Tearing
    // THAT down is how a second bring-up used to kill a healthy
    // in-flight one. `unusable` means disposed or failed — the two
    // states a rebuild is the right answer to.
    if (this._engine?.unusable) {
      this.dispose()
    }

    if (!this._engine) {
      this._engine = this.createEngine()
      this.slot(this._engine)
      await this._engine.initialize()
    } else {
      // Re-attach in case the host cleared the slot during a view switch.
      this.slot(this._engine)
    }

    try {
      if (this._projectPath !== projectPath) {
        await this._engine.loadProject(projectPath)
        this._projectPath = projectPath
        // `loadProject` activates the project's `startup.initialMapId`
        // by itself. Record which map that was instead of assuming
        // none: assuming `null` here re-loaded the startup map a second
        // time on every project open — a full scene rebuild thrown
        // away, and until `swapInScene` learned to step off the active
        // scene, an outright throw (TODO.md, resolved with this).
        this._mapId = this._engine.currentMapId
      }
      if (this._mapId !== mapId) {
        await this._engine.loadMap(mapId)
        this._mapId = mapId
      }
    } finally {
      // Hook attachment does NOT ride on the load succeeding. A failed
      // load leaves a live, painting engine behind (the project's own
      // startup map is already up by then), and `SceneNavigator._hydrate`
      // deliberately falls through so the user keeps a usable editor —
      // so bailing out here used to strip every engine → UI bridge off a
      // window that looked completely normal. Undo/redo greyed out for
      // the whole session was the visible half of that.
      this._attachHooks()
    }

    // Active tool / tile / layer are pushed by the host
    // (`ApplicationWindow._hydrateSceneEditor`) so the UI's GAction
    // stays the source of truth across map switches. The controller
    // intentionally doesn't reset them here; doing so would force the
    // tool back to a hardcoded default and desync from the toolbar.
  }

  /**
   * Open every engine → UI bridge that is not open yet. Idempotent per
   * engine instance, so callers may run it after any step that could
   * have created the engine.
   */
  private _attachHooks(): void {
    this._attachZoomHook()
    this._attachUndoHook()
    this._attachTilePickedHook()
    this._attachPlacementSelectedHook()
    this._attachLayerFlagHook()
    this._attachLayerListHook()
    this._attachPointerTileHook()
    this._attachRuntimeEffectHooks()
  }

  /**
   * Run `attach` once per engine instance and remember it by name.
   * `attach` reports whether it managed to subscribe — the gjs `Engine`
   * widget refuses while its Excalibur instance is not up yet — and only
   * a `true` is recorded, so a later call retries.
   */
  private _attachOnce(hook: EngineHook, attach: (engine: Engine) => boolean): void {
    if (this._attachedHooks.has(hook) || !this._engine) return
    if (attach(this._engine)) this._attachedHooks.add(hook)
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
    this._attachedHooks.clear()
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
    this.applyZoom(calculateNextZoom(current, delta))
  }

  private _attachZoomHook(): void {
    this._attachOnce('zoom', (engine) =>
      engine.onCameraZoomChanged((zoom) => {
        if (!shouldReportZoomChange(zoom, this._lastReportedZoom)) return
        this._lastReportedZoom = zoom
        this._events.emit('zoom-changed', zoom)
      }),
    )
  }

  private _attachUndoHook(): void {
    this._attachOnce('undo', (engine) =>
      engine.onUndoStackChanged((state) => {
        this._events.emit('undo-changed', state)
      }),
    )
  }

  private _attachTilePickedHook(): void {
    this._attachOnce('tile-picked', (engine) => {
      this._hookSubs.push(
        engine.events.on(EngineEvent.TILE_PICKED, (payload) => {
          this._events.emit('tile-picked', payload)
        }),
      )
      return true
    })
  }

  private _attachPlacementSelectedHook(): void {
    this._attachOnce('placement-selected', (engine) => {
      this._hookSubs.push(
        engine.events.on(EngineEvent.PLACEMENT_SELECTED, (payload) => {
          this._events.emit('placement-selected', payload)
        }),
      )
      return true
    })
  }

  private _attachLayerFlagHook(): void {
    this._attachOnce('layer-flag', (engine) => {
      this._hookSubs.push(
        engine.events.on(EngineEvent.LAYER_FLAG_CHANGED, (payload) => {
          this._events.emit('layer-flag-changed', payload)
        }),
      )
      return true
    })
  }

  private _attachLayerListHook(): void {
    this._attachOnce('layer-list', (engine) => {
      this._hookSubs.push(
        engine.events.on(EngineEvent.LAYER_LIST_CHANGED, (payload) => {
          this._events.emit('layer-list-changed', payload)
        }),
      )
      return true
    })
  }

  private _attachPointerTileHook(): void {
    this._attachOnce('pointer-tile', (engine) =>
      engine.onPointerTileChanged((payload) => {
        this._events.emit('pointer-tile-changed', payload)
      }),
    )
  }

  /**
   * Subscribe to the runtime event-script effects (`show-text`,
   * `item-picked-up`, `flag-set`, `play-sfx`) the engine's
   * `EventActionSystem` emits during playtest, re-emitting each as a
   * typed controller event. One method covers all four (they share the
   * same lifecycle + teardown); the host decides how to present them.
   */
  private _attachRuntimeEffectHooks(): void {
    this._attachOnce('runtime-effects', (engine) => {
      this._hookSubs.push(
        engine.events.on(EngineEvent.SHOW_TEXT_REQUESTED, (payload) => this._events.emit('show-text', payload)),
        engine.events.on(EngineEvent.ITEM_PICKED_UP, (payload) => this._events.emit('item-picked-up', payload)),
        engine.events.on(EngineEvent.FLAG_SET, (payload) => this._events.emit('flag-set', payload)),
        engine.events.on(EngineEvent.PLAY_SFX_REQUESTED, (payload) => this._events.emit('play-sfx', payload)),
      )
      return true
    })
  }
}

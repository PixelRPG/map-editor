import { EngineEvent, type EngineEventMap, type EngineStatus, type Engine as ExcaliburEngine } from '@pixelrpg/engine'
import type { EventEmitter, Subscription } from 'excalibur'

/** The widget-side sink an engine's events are relayed onto. */
export interface EngineEventSink {
  /** Typed relay for engine-aware consumers. */
  events: EventEmitter<EngineEventMap>
  /** GObject signal emit — a single extracted field per event, for Blueprint binds. */
  emit(signal: string, ...args: unknown[]): void
  /** Mirror of `EngineEvent.STATUS_CHANGED`, exposed as a plain widget field. */
  status: EngineStatus
}

/**
 * Relay every engine event onto `sink`.
 *
 * Each event goes to the sink's own `EventEmitter` (typed payload for
 * engine-aware consumers) and — where a single field carries the meaning
 * — also out as a GObject signal for Blueprint bindings + classic signal
 * handlers.
 *
 * Returns the subscriptions so the caller can release them on teardown.
 */
export function forwardEngineEvents(engine: ExcaliburEngine, sink: EngineEventSink): Subscription[] {
  const fwd = <K extends keyof EngineEventMap>(event: K, gobjectArg?: (payload: EngineEventMap[K]) => unknown) =>
    engine.events.on(event, (p) => {
      sink.events.emit(event, p)
      if (gobjectArg) sink.emit(event, gobjectArg(p))
    })

  return [
    engine.events.on(EngineEvent.STATUS_CHANGED, (p) => {
      // STATUS_CHANGED additionally drives `sink.status` (a GObject
      // property), so it stays out of the `fwd` factory.
      sink.status = p.status
      sink.events.emit(EngineEvent.STATUS_CHANGED, p)
      sink.emit(EngineEvent.STATUS_CHANGED, p.status)
    }),
    fwd(EngineEvent.PROJECT_LOADED, (p) => p.projectPath),
    fwd(EngineEvent.MAP_LOADED, (p) => p.mapId),
    fwd(EngineEvent.ERROR, (p) => p.message),
    fwd(EngineEvent.TILE_CLICKED),
    fwd(EngineEvent.TILE_HOVERED),
    fwd(EngineEvent.TILE_PLACED),
    fwd(EngineEvent.TILE_PICKED),
    // Select-tool canvas picks — without this relay the host never
    // hears about them and the Objects-list / Props sync stays dead.
    fwd(EngineEvent.PLACEMENT_SELECTED),
    // Layer eye/padlock mirroring — fires on every application path
    // of the layer-flag commands (local, undo/redo, remote peer), so
    // the host's Layers tab follows changes it didn't originate.
    fwd(EngineEvent.LAYER_FLAG_CHANGED),
    // Layer LIST mirroring (add / reorder / change of plane) — same
    // every-path contract, so the Layers tab re-reads the map after a
    // remote peer's move or an undo it didn't originate.
    fwd(EngineEvent.LAYER_LIST_CHANGED),
    // Runtime event-script effects (playtest). The `EventActionSystem`
    // emits these on `TRIGGER_FIRED`; the host surfaces them (toasts
    // today — a real dialogue box / inventory / audio layer later).
    fwd(EngineEvent.SHOW_TEXT_REQUESTED),
    fwd(EngineEvent.ITEM_PICKED_UP),
    fwd(EngineEvent.FLAG_SET),
    fwd(EngineEvent.PLAY_SFX_REQUESTED),
  ]
}

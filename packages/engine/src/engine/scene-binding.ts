import type { EventEmitter } from 'excalibur'
import type { MapScene } from '../scenes/map.scene.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'

/** Reads the currently-active {@link MapScene}, or `null` when none is. */
export type ActiveSceneAccessor = () => MapScene | null

/**
 * Bind a per-scene subscription that survives map switches.
 *
 * Every `Engine.on…` observer faces the same problem: scenes are
 * rebuilt per `loadMap`, so a subscription taken against the current
 * scene goes dead the moment the user opens another map — and callers
 * (GActions, the collab awareness bridges) must not have to
 * re-register. `bind` is invoked immediately and again after every
 * `MAP_LOADED`; it returns the disposer for whatever it attached, or
 * `null` when there was nothing to attach to.
 *
 * The returned disposer drops both the inner subscription and the
 * `MAP_LOADED` listener.
 */
export function rebindOnMapLoaded(events: EventEmitter<EngineEventMap>, bind: () => (() => void) | null): () => void {
  let inner: (() => void) | null = null
  const rebind = () => {
    inner?.()
    inner = bind()
  }
  rebind()
  const mapSub = events.on(EngineEvent.MAP_LOADED, () => rebind())
  return () => {
    inner?.()
    inner = null
    mapSub.close()
  }
}

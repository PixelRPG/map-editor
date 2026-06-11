/** A listener for one event of a {@link TypedEmitter} event map. */
export type TypedListener<T> = (payload: T) => void

/**
 * Minimal typed multi-listener event emitter — THE one
 * controller→host notification mechanism in the maker.
 *
 * Every maker service/controller that needs to notify the window (or a
 * sibling) exposes a typed `on(event, listener)` delegating to a
 * private instance of this class, mirroring the pattern
 * `SessionService` established: typed event maps (no raw string
 * literals beyond the keys of the map), multiple listeners per event,
 * and unsubscribe closures so hosts can tear down symmetrically.
 *
 * Replaces the previous five ad-hoc flavours (nullable callback
 * fields, single-listener setter methods, host-bound view callbacks,
 * …) which were each "null until the host wires it" and produced
 * silent no-refresh bugs when a wiring line was forgotten.
 *
 * Deliberately NOT `ex.EventEmitter`: that one is for engine-side
 * events (AGENTS.md); maker controllers are plain TS services with no
 * Excalibur dependency. GTK widgets keep using GObject signals.
 */
export class TypedEmitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<TypedListener<never>>>()

  /** Subscribe to `event`. Returns an unsubscribe closure. */
  on<K extends keyof Events>(event: K, listener: TypedListener<Events[K]>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener as TypedListener<never>)
    return () => set?.delete(listener as TypedListener<never>)
  }

  /** Invoke every listener registered for `event` with `payload`. */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    // Copy so a listener that unsubscribes (itself or a sibling)
    // mid-dispatch can't skip entries of the live Set.
    for (const listener of [...set]) (listener as TypedListener<Events[K]>)(payload)
  }
}

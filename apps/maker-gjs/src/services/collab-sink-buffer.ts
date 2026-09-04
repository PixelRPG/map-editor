/**
 * A one-slot callback sink with a holding pen for everything that
 * arrives before the sink is registered.
 *
 * The joiner's `start()` → `ProjectStore.setCollabSession` window (the
 * snapshot pull + sandbox project load, seconds long) used to drop
 * project-level traffic on the floor: a host editing the cast /
 * entity-library / sprite-sets while a joiner connected silently
 * desynced the joiner. Buffering makes that window lossless — the
 * project-op channel carries idempotent upserts, so replaying one
 * already folded into the snapshot is safe.
 *
 * Clearing the sink (`set(null)`) deliberately does NOT drop the
 * pending values: the store detaches its sinks whenever no project is
 * loaded and re-attaches on the next load, and the traffic in between
 * still has to land.
 */
export class SinkBuffer<T> {
  private sink: ((value: T) => void) | null = null
  private readonly pending: T[] = []

  /** The registered sink, or `null` while values are being buffered. */
  get(): ((value: T) => void) | null {
    return this.sink
  }

  /** Register (or clear) the sink; registering drains the pen in arrival order. */
  set(sink: ((value: T) => void) | null): void {
    this.sink = sink
    if (sink) for (const value of this.pending.splice(0)) sink(value)
  }

  /** Hand a value to the sink, or hold it until one is registered. */
  deliver(value: T): void {
    if (this.sink) this.sink(value)
    else this.pending.push(value)
  }

  /** Discard everything held. Does not touch the registered sink. */
  clear(): void {
    this.pending.length = 0
  }
}

/**
 * Tiny pub/sub registry keyed by an arbitrary "type" token.
 *
 * Pure data — no engine dependencies, fully testable under
 * vitest's `node` environment without pulling in Excalibur's
 * browser polyfills. {@link SessionState} composes one of these
 * per scene to dispatch component-add / -remove / -mutate
 * notifications to subscribers.
 *
 * Listeners receive the current value as the registry sees it
 * (set by the host calling `notify`). Subscribers never observe
 * the previous value as a separate parameter — the latest value
 * is the contract.
 */
export class SubscriptionRegistry<KeyT, ValueT> {
  private readonly listeners = new Map<KeyT, Set<(value: ValueT | null) => void>>()
  private readonly latest = new Map<KeyT, ValueT | null>()

  /**
   * Subscribe to changes for a given key. Fires the listener once
   * synchronously with the current value (which is `null` if the
   * key has never been notified). Returns a `disconnect` function;
   * call it to stop receiving updates.
   */
  subscribe(key: KeyT, listener: (value: ValueT | null) => void): () => void {
    let bucket = this.listeners.get(key)
    if (!bucket) {
      bucket = new Set()
      this.listeners.set(key, bucket)
    }
    bucket.add(listener)

    // Sync prime — listener sees the current value (or `null`) on
    // subscribe. Mirrors RxJS BehaviorSubject semantics.
    listener(this.latest.has(key) ? (this.latest.get(key) ?? null) : null)

    return () => {
      const set = this.listeners.get(key)
      if (!set) return
      set.delete(listener)
      if (set.size === 0) this.listeners.delete(key)
    }
  }

  /**
   * Broadcast a new value (or `null` for "removed / absent") to
   * every listener subscribed to `key`. Stores the value so
   * future subscribers get it on prime.
   */
  notify(key: KeyT, value: ValueT | null): void {
    this.latest.set(key, value)
    const bucket = this.listeners.get(key)
    if (!bucket) return
    // Snapshot the bucket so a listener can unsubscribe inside its
    // own callback without breaking iteration.
    for (const listener of [...bucket]) {
      listener(value)
    }
  }

  /** Current cached value for `key`, or `null` if never set / cleared. */
  peek(key: KeyT): ValueT | null {
    return this.latest.get(key) ?? null
  }

  /** Number of active subscribers across all keys — useful for leak tests. */
  get size(): number {
    let total = 0
    for (const bucket of this.listeners.values()) total += bucket.size
    return total
  }

  /** Drop every subscriber + cached value. The registry is reusable after. */
  clear(): void {
    this.listeners.clear()
    this.latest.clear()
  }
}

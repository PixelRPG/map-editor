/**
 * The MapPreview bake cache + cache-key logic. Kept GTK-free (no `gi://`
 * import) so it unit-tests under the node target — the `MapPreview` widget
 * itself subclasses `Gtk.Widget` and can't run headlessly.
 */

/**
 * A bounded, insertion-order cache: eviction is least-recently-STORED, not
 * least-recently-READ. `set` refreshes a key's position (so re-storing the
 * same key moves it to newest); `get` does NOT — reads never affect
 * eviction order. The oldest entry is dropped once the cache exceeds
 * `maxSize`. Generic over the value `V`, which the cache treats opaquely
 * (MapPreview stores baked `Gdk.Texture`s, but none of that leaks here).
 */
export class BakeCache<V> {
  private readonly map = new Map<string, V>()

  constructor(private readonly maxSize: number) {}

  get(key: string): V | undefined {
    return this.map.get(key)
  }

  set(key: string, value: V): void {
    // delete-then-set refreshes insertion order so eviction is
    // least-recently-stored.
    this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
  }

  get size(): number {
    return this.map.size
  }
}

/**
 * Build a bake's cache key from its stable base (`path:<project>` or
 * `map:<project>:<id>:<fingerprint>`). A `null` base means "not
 * cacheable" → `null`.
 *
 * A bake covers the whole map at a capped edge length, so the content
 * fingerprint in the base is the whole key: the size a host happens to
 * draw it at never changes what was rasterised.
 */
export function buildCacheKey(base: string | null): string | null {
  return base || null
}

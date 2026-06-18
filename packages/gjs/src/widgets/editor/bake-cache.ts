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

/** A bake's cache-key viewport component (map-pixel centre + native-pixel zoom). */
export interface CacheKeyViewport {
  centerX: number
  centerY: number
  zoom: number
}

/**
 * Build a bake's cache key from its stable base (`path:<project>` or
 * `map:<project>:<id>:<fingerprint>`) and the optional viewport. A `null`
 * base means "not cacheable" → `null`; no viewport (fit-whole-map mode)
 * keys on the base alone.
 *
 * The centre is rounded to the nearest pixel so two nearby pan centres
 * collapse to the SAME key (a cache hit instead of a redundant re-bake);
 * `zoom` rides verbatim.
 */
export function buildCacheKey(base: string | null, viewport: CacheKeyViewport | null): string | null {
  if (!base) return null
  if (!viewport) return base
  const { zoom, centerX, centerY } = viewport
  return `${base}:vp:${zoom}:${Math.round(centerX)}:${Math.round(centerY)}`
}

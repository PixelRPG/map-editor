/**
 * Memoised per-sprite-set preview resource cache.
 *
 * The cast gallery previews every character on its OWN sheet, so a
 * refresh resolves one resource per referenced set. Without memoisation
 * that re-wraps (and re-uploads) the same texture on every refresh; with
 * it, a broken reference is only ever probed once — a `null` result is
 * cached deliberately so a missing sheet can't retry-storm.
 *
 * Generic over the wrapped resource so it stays free of GTK imports and
 * unit-tests under Node.
 */
export class PreviewCache<T> {
  private readonly entries = new Map<string, T | null>()

  constructor(private readonly load: (id: string) => Promise<T | null>) {}

  /** Resolve `id`, loading it on first request. */
  async get(id: string): Promise<T | null> {
    if (this.entries.has(id)) return this.entries.get(id) ?? null
    const loaded = await this.load(id)
    this.entries.set(id, loaded)
    return loaded
  }

  /** Forget one id — the set changed and its preview is stale. */
  evict(id: string): void {
    this.entries.delete(id)
  }

  /** Forget everything — a different project's textures must not leak across. */
  clear(): void {
    this.entries.clear()
  }
}

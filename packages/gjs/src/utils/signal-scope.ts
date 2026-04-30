import type GObject from '@girs/gobject-2.0'

/**
 * Tracks GObject signal connections for symmetric connect/disconnect across
 * `vfunc_map`/`vfunc_unmap`.
 *
 * Connect via `scope.connect(source, signal, fn)` in `vfunc_map`; release all
 * in `vfunc_unmap` via `scope.disconnectAll()`. The scope handles the bookkeeping
 * (tracking which handler IDs belong to which source) so widgets don't reinvent
 * the index-array dance.
 */
export class SignalScope {
  private bindings: Array<{ source: GObject.Object; id: number }> = []

  // biome-ignore lint/suspicious/noExplicitAny: GObject signal handlers have heterogeneous signatures; the scope deliberately accepts any tuple here, callers cast or use specific types at the call site.
  connect<T extends GObject.Object>(source: T, signal: string, handler: (...args: any[]) => void): void {
    const id = source.connect(signal, handler)
    this.bindings.push({ source, id })
  }

  disconnectAll(): void {
    for (const { source, id } of this.bindings) {
      source.disconnect(id)
    }
    this.bindings.length = 0
  }
}

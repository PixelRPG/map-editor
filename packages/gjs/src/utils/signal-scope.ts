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

  /**
   * Connect a handler that keeps running until it returns `true`, then
   * disconnects itself — a one-shot that can wait for a CONDITION (the
   * first non-zero allocation, the first ready frame) rather than the
   * first emission.
   *
   * Use this instead of the hand-rolled
   * `const id = src.connect(sig, () => { src.disconnect(id) … })`: that
   * shape leaks whenever the condition never arrives, because the only
   * release path runs inside the handler. Here the binding is tracked
   * like any other, so `disconnectAll()` releases it on teardown even if
   * it never fired, and re-arming is a `disconnectAll()` away.
   */
  connectUntil<T extends GObject.Object>(source: T, signal: string, handler: () => boolean): void {
    const binding = { source, id: 0 }
    binding.id = source.connect(signal, () => {
      if (!handler()) return
      // Drop the tracked binding first: disconnecting a handler from
      // inside its own emission is fine, but a later `disconnectAll()`
      // must not disconnect the same id twice.
      const index = this.bindings.indexOf(binding)
      if (index >= 0) this.bindings.splice(index, 1)
      source.disconnect(binding.id)
    })
    this.bindings.push(binding)
  }

  disconnectAll(): void {
    for (const { source, id } of this.bindings) {
      source.disconnect(id)
    }
    this.bindings.length = 0
  }
}

/**
 * Tiny typed event emitter used by the engine instead of the previous
 * RPC-based EventDispatcher.
 */
export class TypedEventEmitter<M> {
  private readonly listeners = new Map<keyof M, Set<(payload: any) => void>>()

  on<K extends keyof M>(type: K, cb: (payload: M[K]) => void): () => void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(cb as (payload: any) => void)
    return () => {
      set!.delete(cb as (payload: any) => void)
    }
  }

  off<K extends keyof M>(type: K, cb: (payload: M[K]) => void): void {
    this.listeners.get(type)?.delete(cb as (payload: any) => void)
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.listeners.get(type)
    if (!set) return
    for (const cb of set) {
      try {
        cb(payload)
      } catch (err) {
        console.error(`TypedEventEmitter listener for "${String(type)}" threw:`, err)
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}

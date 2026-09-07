/**
 * Runs async tasks one at a time, in submission order.
 *
 * For multi-`await` sequences over shared mutable state whose callers
 * fire and forget. Engine bring-up is the case this exists for:
 * `SceneNavigator.open` starts hydration with `void this._hydrate(…)`,
 * so a second map open lands in the middle of the first one's awaits.
 *
 * A rejected task does not poison the queue: the next task runs either
 * way, and the rejection is delivered to whoever submitted it.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()

  /**
   * Queue `task` behind everything already submitted. Returns the task's
   * own promise, so the caller sees its result or its error — not the
   * queue's.
   */
  run<T>(task: () => Promise<T>): Promise<T> {
    // The same continuation on both settle paths: the queue cares that
    // the previous task FINISHED, not that it succeeded.
    const next = this.tail.then(task, task)
    this.tail = next.catch(() => undefined)
    return next
  }
}

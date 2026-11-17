import type { Subscription } from 'excalibur'

/**
 * Anything that undoes one subscription: Excalibur's {@link Subscription}
 * handle (returned by every `EventEmitter.on` / `PointerAbstraction.on`)
 * or the plain unsubscribe function `SessionState.subscribe` returns.
 */
export type Releasable = Subscription | (() => void)

/**
 * Tracks engine-side subscriptions so a system can release all of them
 * in one call.
 *
 * The engine-wide event bus and `engine.input.pointers.primary` outlive
 * every `MapScene`, so a handler a system installs in `onInitialize`
 * keeps firing after the scene it belongs to has been switched away —
 * for as long as the engine lives. Collect each handle here and release
 * them from `System.dispose()` (Excalibur 1.0's teardown hook, called by
 * the `SystemManager` when an initialized system is removed).
 *
 * This is the engine-side counterpart of `SignalScope` in `@pixelrpg/gjs`:
 * same shape (subscribe through the scope, release all at the symmetric
 * lifecycle point), different substrate.
 */
export class SubscriptionScope {
  private releases: Array<() => void> = []

  /** Track one or more handles. Returns nothing — the scope owns them now. */
  add(...subscriptions: Releasable[]): void {
    for (const subscription of subscriptions) {
      this.releases.push(typeof subscription === 'function' ? subscription : () => subscription.close())
    }
  }

  /** Release every tracked subscription. Idempotent. */
  closeAll(): void {
    // Copy first: a `close()` must not be able to mutate the array we
    // are walking, and a second `closeAll()` has to find it empty.
    const releases = this.releases
    this.releases = []
    for (const release of releases) release()
  }

  /** How many subscriptions are currently held — for tests and diagnostics. */
  get size(): number {
    return this.releases.length
  }
}

import { Entity, type Scene } from 'excalibur'
import type { Component, ComponentCtor } from 'excalibur'
import { SubscriptionRegistry } from './subscription-registry.ts'

/**
 * Helper around the per-scene **session-singleton entity** that holds
 * editor + runtime mode state and (over time) every other piece of
 * "per-user, per-scene" state the editor cares about.
 *
 * One singleton per `Scene`. The same `Scene` instance always
 * resolves to the same singleton — that's the load-bearing
 * invariant for the subscription bridge.
 *
 * Components attached to the singleton are observed by the GTK
 * widgets via {@link subscribe}; the bridge fires with the current
 * value at subscribe time and again on add / remove / explicit
 * mutation notify.
 *
 * See `docs/concepts/editor-architecture.md` for the architectural
 * justification + the relationship between this helper, the
 * Operation-oriented mutation API, and the future Undo system.
 */

/** Stable name used for the singleton entity in `scene.world`. */
export const SESSION_ENTITY_NAME = 'session-state'

type Listener<C extends Component> = (component: C | null) => void
type Unsubscribe = () => void

// Per-Scene subscription registries. WeakMap keys on the Scene so the
// registry disappears when the scene itself is garbage-collected.
const registries = new WeakMap<Scene, SubscriptionRegistry<ComponentCtor<Component>, Component>>()

function getRegistry(scene: Scene): SubscriptionRegistry<ComponentCtor<Component>, Component> {
  let reg = registries.get(scene)
  if (!reg) {
    reg = new SubscriptionRegistry()
    registries.set(scene, reg)
  }
  return reg
}

// biome-ignore lint/complexity/noStaticOnlyClass: Used as a namespace for cohesive helpers; conversion would break the typed-key/value API and barrel exports.
export class SessionState {
  /**
   * Get-or-create the singleton entity on `scene`. Idempotent —
   * second + later calls return the existing entity. Called by
   * `MapScene`'s constructor; widgets call it as well so they don't
   * need to know whether the maker already initialised it.
   */
  static ensure(scene: Scene): Entity {
    const existing = SessionState._find(scene)
    if (existing) return existing
    const entity = new Entity({ name: SESSION_ENTITY_NAME })
    scene.add(entity)
    return entity
  }

  /**
   * Read the current value of a component on the singleton, or
   * `null` when not present. Convenience around `entity.get(...)`
   * that also normalises `undefined → null` so callers can `??`
   * cleanly.
   */
  static get<C extends Component>(scene: Scene, ctor: ComponentCtor<C>): C | null {
    const entity = SessionState._find(scene)
    return (entity?.get(ctor) ?? null) as C | null
  }

  /**
   * Attach (or replace) a component on the singleton. Fires
   * subscribers with the new component. Use this for *adding* a
   * mode marker / state component to the singleton — for editing a
   * field on an existing component in place, call
   * {@link notifyMutation} after the mutation.
   *
   * **Same-instance fast path**: when the caller passes the exact
   * same instance that's already attached (common when systems do
   * `get → mutate → set` to push the change through), skip the
   * `removeComponent` + `addComponent` round-trip. Excalibur's
   * component removal is partially deferred and re-adding the same
   * instance in the same tick can leave the component half-removed
   * by the next frame — observably "every second click silently
   * drops the new state". Treating same-instance as "just notify"
   * is both faster and dodges that lifecycle hazard. Callers doing
   * in-place updates should still prefer {@link notifyMutation};
   * this fast path is a belt for the suspenders.
   */
  static set<C extends Component>(scene: Scene, component: C): void {
    const entity = SessionState.ensure(scene)
    const ctor = component.constructor as ComponentCtor<C>
    const existing = entity.get(ctor)

    if (existing === component) {
      getRegistry(scene).notify(ctor as ComponentCtor<Component>, component)
      return
    }

    if (existing) entity.removeComponent(ctor)
    entity.addComponent(component)
    getRegistry(scene).notify(ctor as ComponentCtor<Component>, component)
  }

  /**
   * Remove a component from the singleton if present. Fires
   * subscribers with `null`. No-op when the component isn't
   * attached.
   */
  static unset<C extends Component>(scene: Scene, ctor: ComponentCtor<C>): void {
    const entity = SessionState._find(scene)
    if (!entity?.get(ctor)) return
    entity.removeComponent(ctor)
    getRegistry(scene).notify(ctor as ComponentCtor<Component>, null)
  }

  /**
   * Subscribe to changes of a component on the singleton. Fires
   * once synchronously with the current value (or `null`), then
   * again on each `set` / `unset` / `notifyMutation` for that
   * component type.
   *
   * Returns a `disconnect` function — callers stash it in their
   * per-widget disposables bag and release it from `vfunc_unmap`.
   */
  static subscribe<C extends Component>(
    scene: Scene,
    ctor: ComponentCtor<C>,
    listener: Listener<C>,
  ): Unsubscribe {
    SessionState.ensure(scene) // make sure the singleton exists so latest-value semantics work
    const reg = getRegistry(scene)
    return reg.subscribe(ctor as ComponentCtor<Component>, (value) => {
      listener((value as C | null) ?? SessionState.get(scene, ctor))
    })
  }

  /**
   * Notify subscribers that a component's fields changed in place.
   * Systems that mutate component state (e.g. updating
   * `ActiveToolComponent.tool`) call this after the mutation —
   * Excalibur doesn't observe per-field changes, so this is the
   * explicit "fence" around mutations.
   *
   * Workspace rule: every system that writes to a component on the
   * session-singleton MUST follow the write with a `notifyMutation`
   * call. See `AGENTS.md` § "Engine patterns — ECS".
   */
  static notifyMutation<C extends Component>(scene: Scene, component: C): void {
    const ctor = component.constructor as ComponentCtor<Component>
    getRegistry(scene).notify(ctor, component)
  }

  /**
   * Internal — find the singleton entity if it exists; returns
   * `null` when the scene hasn't been initialised yet. Used by
   * `get` / `unset` so they don't accidentally construct the
   * singleton just to read it.
   */
  private static _find(scene: Scene): Entity | null {
    for (const entity of scene.entities) {
      if (entity.name === SESSION_ENTITY_NAME) return entity
    }
    return null
  }
}

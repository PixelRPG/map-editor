import type { Scene } from 'excalibur'

/**
 * Key of the default scene Excalibur registers in its `Director`
 * constructor. It always exists and is never a map, which makes it the
 * one safe place to stand while a map scene is being replaced.
 */
export const ROOT_SCENE_KEY = 'root'

/**
 * The slice of `ex.Engine` {@link swapInScene} drives. Narrow on
 * purpose: the swap is the one piece of map loading with no dependency
 * on resources, GTK or a canvas, so keeping it behind a duck-typed host
 * lets it be unit-tested against Excalibur's two documented contracts
 * (see {@link swapInScene}) instead of a live engine.
 */
export interface SceneSwapHost {
  /** Every scene currently registered, keyed by name. */
  readonly scenes: Record<string, unknown>
  /** Name of the scene being drawn right now. */
  readonly currentSceneName: string
  addScene(key: string, scene: Scene): void
  removeScene(key: string): void
  goToScene(key: string): Promise<void>
}

/**
 * Register `scene` under `key`, replacing whatever was there, and leave
 * the engine showing it.
 *
 * Two Excalibur contracts shape this, and violating either produces a
 * bug that looks like anything but a scene swap:
 *
 * 1. **`removeScene` refuses the active scene** — `Director.remove`
 *    throws `Cannot remove a currently active scene: <key>`. Re-entering
 *    the map you are already on (the maker opening the project's startup
 *    map, a teleport into the room you are standing in) hits it. So step
 *    onto {@link ROOT_SCENE_KEY} first; the removal is then ordinary.
 *
 * 2. **`goToScene` does not switch synchronously** — it deactivates the
 *    outgoing scene across `await` points, so `currentSceneName` and
 *    `currentScene` keep pointing at the PREVIOUS scene until the
 *    returned promise resolves. Awaiting it is what makes "the map is
 *    loaded" true at the moment the caller announces it. Callers of this
 *    helper announce `MAP_LOADED`, and every `rebindOnMapLoaded` observer
 *    re-reads the active scene when they hear it.
 *
 * A third rule is ours, not Excalibur's: **the map we leave is retired**
 * — see {@link retireScene}.
 */
export async function swapInScene(host: SceneSwapHost, key: string, scene: Scene): Promise<void> {
  const outgoing = host.currentSceneName
  if (host.scenes[key]) {
    if (outgoing === key) await host.goToScene(ROOT_SCENE_KEY)
    retireScene(host, key)
  }
  host.addScene(key, scene)
  await host.goToScene(key)
  // Retire the map we came from, now that the engine is off it. `root`
  // is Excalibur's own always-present scene and is never a map, so it stays.
  if (outgoing !== key && outgoing !== ROOT_SCENE_KEY) retireScene(host, outgoing)
}

/** The part of `ex.Scene` {@link retireScene} needs — see that function. */
interface SceneWithWorld {
  readonly world: { clearSystems(): void }
}

function hasWorld(value: unknown): value is SceneWithWorld {
  const world = (value as { world?: { clearSystems?: unknown } } | null | undefined)?.world
  return typeof world?.clearSystems === 'function'
}

/**
 * Drop a map scene for good: remove its systems, then unregister it.
 *
 * `ProjectLoader.loadMap` rebuilds every room from data (RPG-Maker-style
 * reset), so a `MapScene` instance is used exactly once and nothing ever
 * returns to it. Excalibur does not know that: `Director.remove` only
 * deletes the lookup entry, and leaving a scene via `goToScene` touches
 * neither its systems nor its entities. Two things therefore survive a
 * map switch unless we end them here.
 *
 * 1. **Subscriptions on emitters that outlive the scene.** Systems
 *    install their handlers on the engine-wide event bus and on
 *    `engine.input.pointers.primary` in `onInitialize`. `clearSystems()`
 *    runs Excalibur 1.0's `System.dispose()` for each initialized
 *    system, which is where ours release them (`SubscriptionScope`).
 *    Without it every visited map leaves a live `CameraControlSystem`
 *    behind and `POINTER_DRAG_MOVE` pans the camera once per map the
 *    session has seen — the second room scrolls twice as fast as the
 *    first.
 * 2. **The scene's memory.** A `MapScene` holds its tilemaps, their
 *    collider boxes (≈5400 on `kokiri-forest`) and every spawned
 *    entity. Unregistering the scene is what lets all of it be
 *    collected.
 *
 * No-ops when `key` names nothing, so callers need not check first.
 */
export function retireScene(host: SceneSwapHost, key: string): void {
  const scene = host.scenes[key]
  if (!scene) return
  if (hasWorld(scene)) scene.world.clearSystems()
  host.removeScene(key)
}

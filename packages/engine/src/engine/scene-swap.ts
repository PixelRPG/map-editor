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
 */
export async function swapInScene(host: SceneSwapHost, key: string, scene: Scene): Promise<void> {
  if (host.scenes[key]) {
    if (host.currentSceneName === key) await host.goToScene(ROOT_SCENE_KEY)
    host.removeScene(key)
  }
  host.addScene(key, scene)
  await host.goToScene(key)
}

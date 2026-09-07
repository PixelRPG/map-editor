/**
 * The two Excalibur contracts {@link swapInScene} exists to honour,
 * pinned against a host that reproduces them.
 *
 * Both were violated by the inline swap this helper replaced
 * (`removeScene` → `addScene` → un-awaited `goToScene`), and neither
 * violation reported anything:
 *
 * - removing the ACTIVE scene threw `Cannot remove a currently active
 *   scene`, which aborted `EngineController.ensureForMap` before it
 *   attached any engine → UI hook;
 * - not awaiting `goToScene` emitted `MAP_LOADED` while
 *   `currentScene` still pointed at the map the user had just left, so
 *   every `rebindOnMapLoaded` observer — `CommandHistory.onChanged`
 *   among them — subscribed to the previous scene's session-singleton
 *   and never saw a single edit on the new one.
 *
 * Undo and redo greyed out is what the user saw for both.
 */

import { describe, expect, it } from '@gjsify/unit'
import type { Scene } from 'excalibur'

import { ROOT_SCENE_KEY, type SceneSwapHost, swapInScene } from './scene-swap.ts'

/** Stand-in for `ex.Scene` — the swap never touches its members. */
function fakeScene(name: string): Scene {
  return { name } as unknown as Scene
}

/**
 * A host that behaves like Excalibur's `Director` in the two ways that
 * matter: it refuses to remove the scene it is showing, and its scene
 * switch only takes effect once the returned promise resolves.
 */
function createHost(initial: Record<string, Scene>, current: string) {
  const calls: string[] = []
  const host = {
    scenes: { ...initial } as Record<string, unknown>,
    currentSceneName: current,
    addScene(key: string, scene: Scene) {
      calls.push(`add:${key}`)
      host.scenes[key] = scene
    },
    removeScene(key: string) {
      calls.push(`remove:${key}`)
      // Director.remove: `throw new Error('Cannot remove a currently active scene: ' + key)`
      if (key === host.currentSceneName) throw new Error(`Cannot remove a currently active scene: ${key}`)
      delete host.scenes[key]
    },
    async goToScene(key: string) {
      calls.push(`goTo:${key}`)
      // Director.swapScene awaits the outgoing scene's deactivation,
      // the destination loader's resources and the new scene's
      // `_initialize` / `_activate` before it moves `currentSceneName`.
      // A timer models that as the hard boundary it is: no amount of
      // microtask chaining lets a caller who skipped the await observe
      // the switch.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      host.currentSceneName = key
    },
  }
  return { host: host as SceneSwapHost & typeof host, calls }
}

export default async function () {
  await describe('swapInScene', async () => {
    await it('does not resolve until the engine really shows the new scene', async () => {
      const { host } = createHost({ [ROOT_SCENE_KEY]: fakeScene('root') }, ROOT_SCENE_KEY)

      const swap = swapInScene(host, 'tree-house', fakeScene('tree-house'))
      // Mid-flight: the switch has been asked for but has not happened.
      expect(host.currentSceneName).toBe(ROOT_SCENE_KEY)

      await swap

      // This is the promise `ProjectLoader.loadMap` awaits before it
      // emits MAP_LOADED, so it must not resolve one moment earlier.
      expect(host.currentSceneName).toBe('tree-house')
      expect(host.scenes['tree-house']).toBeDefined()
    })

    await it('replaces a scene that is not the active one without a detour', async () => {
      const { host, calls } = createHost(
        { [ROOT_SCENE_KEY]: fakeScene('root'), 'tree-house': fakeScene('old') },
        ROOT_SCENE_KEY,
      )

      await swapInScene(host, 'tree-house', fakeScene('new'))

      expect(calls).toStrictEqual(['remove:tree-house', 'add:tree-house', 'goTo:tree-house'])
      expect((host.scenes['tree-house'] as { name: string }).name).toBe('new')
    })

    await it('re-enters the CURRENTLY ACTIVE map instead of throwing', async () => {
      const { host, calls } = createHost(
        { [ROOT_SCENE_KEY]: fakeScene('root'), 'kokiri-forest': fakeScene('old') },
        'kokiri-forest',
      )

      await swapInScene(host, 'kokiri-forest', fakeScene('rebuilt'))

      // Stepping onto root is what makes the removal legal.
      expect(calls).toStrictEqual([
        `goTo:${ROOT_SCENE_KEY}`,
        'remove:kokiri-forest',
        'add:kokiri-forest',
        'goTo:kokiri-forest',
      ])
      expect(host.currentSceneName).toBe('kokiri-forest')
      expect((host.scenes['kokiri-forest'] as { name: string }).name).toBe('rebuilt')
    })

    await it('never asks the engine to remove the scene it is showing', async () => {
      const { host, calls } = createHost(
        { [ROOT_SCENE_KEY]: fakeScene('root'), 'kokiri-forest': fakeScene('old') },
        'kokiri-forest',
      )

      await swapInScene(host, 'kokiri-forest', fakeScene('rebuilt'))

      const removedWhileActive = calls.indexOf('remove:kokiri-forest') < calls.indexOf(`goTo:${ROOT_SCENE_KEY}`)
      expect(removedWhileActive).toBe(false)
    })
  })
}

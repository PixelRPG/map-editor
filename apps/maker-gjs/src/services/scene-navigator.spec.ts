import { describe, expect, it } from '@gjsify/unit'
import type { SampleScene } from '@pixelrpg/gjs'

import type { LoadedProject } from './project-loader.ts'
import { SceneNavigator, type SceneNavigatorContext } from './scene-navigator.ts'

const scene = (id: string): SampleScene => ({ id, name: `Room ${id}`, rows: [], x: 0, y: 0, tilePx: 4 })

interface Calls {
  setScene: string[]
  followScene: string[]
  showSceneEditorPage: number
  populateInspector: string[]
  mapMissing: number
}

/**
 * A navigator with no project loaded, which is what keeps the test
 * synchronous: `open` only hydrates (engine + inspector, both async)
 * once a project is there, while `followEngineMap` is reached by an
 * engine that already has the map up.
 */
const harness = (project: LoadedProject | null = null) => {
  const calls: Calls = { setScene: [], followScene: [], showSceneEditorPage: 0, populateInspector: [], mapMissing: 0 }
  const ctx: SceneNavigatorContext = {
    getProject: () => project,
    reportMapMissing: () => {
      calls.mapMissing += 1
    },
    reportMapLoadFailed: () => {},
    showSceneEditorPage: () => {
      calls.showSceneEditorPage += 1
    },
    setScene: (s) => void calls.setScene.push(s.id),
    followScene: (s) => void calls.followScene.push(s.id),
    ensureEngineForMap: async () => {},
    onEngineReady: () => {},
    populateInspector: async (_project, sceneId) => void calls.populateInspector.push(sceneId),
    refreshAtlasWorld: () => {},
  }
  const navigator = new SceneNavigator(ctx)
  navigator.setScenes([scene('hall'), scene('cellar')])
  return { navigator, calls }
}

export default async () => {
  await describe('SceneNavigator.followEngineMap', async () => {
    await it('renames the chrome for a map the engine opened itself', async () => {
      const { navigator, calls } = harness()
      navigator.open('hall')

      navigator.followEngineMap('cellar')

      expect(navigator.currentSceneId).toBe('cellar')
      expect(calls.followScene).toStrictEqual(['cellar'])
    })

    // `setScene` resets the zoom readout to 100%, and a teleport carries
    // the run's zoom across — so following must take the other door.
    await it('does not go through the zoom-resetting setScene path', async () => {
      const { navigator, calls } = harness()
      navigator.open('hall')

      navigator.followEngineMap('cellar')

      expect(calls.setScene).toStrictEqual(['hall'])
    })

    // The common case: the window opened the map, the engine reports it
    // back. Re-running the follow would re-populate the inspector and
    // throw away the page someone was reading.
    await it('ignores the echo of a map the window itself opened', async () => {
      const { navigator, calls } = harness()
      navigator.open('hall')

      navigator.followEngineMap('hall')

      expect(calls.followScene).toStrictEqual([])
      expect(navigator.currentSceneId).toBe('hall')
    })

    // `open` toasts an unknown id; the follow must stay silent. The
    // engine is the authority on what it loaded, so a map the atlas
    // does not know about is a stale atlas, not a user mistake.
    await it('ignores a map that is not in the atlas', async () => {
      const { navigator, calls } = harness()
      navigator.open('hall')

      navigator.followEngineMap('nowhere')

      expect(calls.followScene).toStrictEqual([])
      expect(calls.mapMissing).toBe(0)
      expect(navigator.currentSceneId).toBe('hall')
    })

    await it('leaves the editor page alone — the run is already on it', async () => {
      const { navigator, calls } = harness()
      navigator.open('hall')
      const shown = calls.showSceneEditorPage

      navigator.followEngineMap('cellar')

      expect(calls.showSceneEditorPage).toBe(shown)
    })

    await it('refills the inspector from the destination map', async () => {
      const { navigator, calls } = harness({} as LoadedProject)
      navigator.followEngineMap('cellar')

      // The follow fires it without awaiting; one microtask turn is all
      // the promise needs to reach the recorder.
      await Promise.resolve()

      expect(calls.populateInspector).toStrictEqual(['cellar'])
    })
  })
}

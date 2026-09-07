/**
 * {@link EngineController}'s hook wiring — the layer where "undo and
 * redo stay greyed out" became invisible.
 *
 * `ensureForMap` used to attach the eight engine → UI bridges as
 * straight-line statements AFTER `await loadMap(…)`. When that await
 * threw — and it did, deterministically, whenever the requested map was
 * the one the engine had already auto-loaded from
 * `startup.initialMapId`, because Excalibur refuses to remove the scene
 * it is showing — all eight were skipped. The engine stayed up and
 * painting, `SceneNavigator._hydrate` caught the error and deliberately
 * fell through so the user kept a usable editor, and every engine → UI
 * bridge was simply absent for the rest of the session. Undo/redo grey
 * forever was the half of that the user could see.
 *
 * So the contract here is: hook attachment is not conditional on the
 * load succeeding, a failed load is still reported to the caller, and
 * `dispose` forgets ALL of them rather than a hand-written subset.
 */

import { describe, expect, it } from '@gjsify/unit'
import type { Engine as GjsEngine } from '@pixelrpg/gjs'

import { ENGINE_HOOKS, EngineController } from './engine-controller.ts'

type UndoListener = (state: { canUndo: boolean; canRedo: boolean }) => void

/** Hooks the gjs `Engine` widget owns; the rest ride its event emitter. */
const WIDGET_OWNED_HOOKS = 'pointer-tile,undo,zoom'
/** TILE_PICKED, PLACEMENT_SELECTED, LAYER_FLAG, LAYER_LIST + the four runtime effects. */
const EMITTER_HOOK_COUNT = 8

/**
 * Everything `ensureForMap` and the hook attachments touch on the gjs
 * `Engine` widget, and nothing else. Records which hooks were opened so
 * a test can assert on the set rather than on eight separate flags.
 */
function makeFakeEngine(options: { failOnMap?: boolean; startupMapId?: string; holdProjectLoad?: Promise<void> } = {}) {
  const opened: string[] = []
  const loadedMaps: string[] = []
  const loadedProjects: string[] = []
  let currentMapId: string | null = null
  let undoListener: UndoListener | null = null
  const engine = {
    excalibur: {},
    unusable: false,
    initialize: async () => {},
    // Mirrors the real engine: the project's `startup.initialMapId` is
    // activated as part of loading the project, and the load takes time
    // — `holdProjectLoad` is the window a second bring-up used to slip
    // into.
    loadProject: async (path: string) => {
      loadedProjects.push(path)
      if (options.holdProjectLoad) await options.holdProjectLoad
      currentMapId = options.startupMapId ?? null
    },
    get currentMapId() {
      return currentMapId
    },
    loadMap: async (mapId: string) => {
      loadedMaps.push(mapId)
      if (options.failOnMap) throw new Error('Cannot remove a currently active scene: kokiri-forest')
      currentMapId = mapId
    },
    dispose: () => {},
    onCameraZoomChanged: () => {
      opened.push('zoom')
      return true
    },
    onUndoStackChanged: (cb: UndoListener) => {
      opened.push('undo')
      undoListener = cb
      return true
    },
    onPointerTileChanged: () => {
      opened.push('pointer-tile')
      return true
    },
    events: {
      on: (name: string) => {
        opened.push(`event:${name}`)
        return { close: () => {} }
      },
    },
  }
  return {
    widget: engine as unknown as GjsEngine,
    /** The widget-owned hooks, sorted, as a comparable string. */
    get widgetHooks() {
      return opened
        .filter((entry) => !entry.startsWith('event:'))
        .sort()
        .join(',')
    },
    get emitterHookCount() {
      return opened.filter((entry) => entry.startsWith('event:')).length
    },
    get totalHooks() {
      return opened.length
    },
    /** Every map id handed to `loadMap`, in order. */
    loadedMaps,
    /** Every project path handed to `loadProject`, in order. */
    loadedProjects,
    /** Simulate the engine reporting an undo-stack change. */
    reportUndoState: (state: { canUndo: boolean; canRedo: boolean }) => undoListener?.(state),
    get undoHookAttached() {
      return undoListener !== null
    },
    /** Simulate the widget having been disposed or failed to start. */
    markUnusable: () => {
      engine.unusable = true
    },
  }
}

/** A controller whose factory hands out `fakes` in order, one per engine. */
function makeController(...fakes: Array<ReturnType<typeof makeFakeEngine>>) {
  let next = 0
  return new EngineController(
    () => {},
    () => fakes[next++]?.widget as GjsEngine,
  )
}

export default async function () {
  await describe('EngineController.ensureForMap', async () => {
    await it('attaches every engine hook on a clean load', async () => {
      const fake = makeFakeEngine()
      const controller = makeController(fake)

      await controller.ensureForMap('/project.json', 'kokiri-forest')

      expect(fake.widgetHooks).toBe(WIDGET_OWNED_HOOKS)
      expect(fake.emitterHookCount).toBe(EMITTER_HOOK_COUNT)
    })

    await it('still attaches every hook when the map load fails', async () => {
      const fake = makeFakeEngine({ failOnMap: true })
      const controller = makeController(fake)

      let rejected: unknown = null
      try {
        await controller.ensureForMap('/project.json', 'kokiri-forest')
      } catch (error) {
        rejected = error
      }

      // The failure must still reach `SceneNavigator._hydrate`…
      expect(rejected instanceof Error).toBe(true)
      // …and must not have taken the UI bridges with it.
      expect(fake.undoHookAttached).toBe(true)
      expect(fake.widgetHooks).toBe(WIDGET_OWNED_HOOKS)
      expect(fake.emitterHookCount).toBe(EMITTER_HOOK_COUNT)
    })

    await it('forwards undo-stack changes to subscribers after a failed load', async () => {
      const fake = makeFakeEngine({ failOnMap: true })
      const controller = makeController(fake)
      const seen: Array<{ canUndo: boolean; canRedo: boolean }> = []
      controller.on('undo-changed', (state) => void seen.push(state))

      await controller.ensureForMap('/project.json', 'kokiri-forest').catch(() => {})
      fake.reportUndoState({ canUndo: true, canRedo: false })

      // This is exactly what `win.undo.set_enabled(true)` rides on.
      expect(seen.at(-1)).toStrictEqual({ canUndo: true, canRedo: false })
    })

    await it('does not re-load the map that loadProject already activated', async () => {
      const fake = makeFakeEngine({ startupMapId: 'kokiri-forest' })
      const controller = makeController(fake)

      await controller.ensureForMap('/project.json', 'kokiri-forest')

      // The engine is already showing it; a second load would rebuild
      // the scene for nothing (and used to throw outright).
      expect(fake.loadedMaps.join(',')).toBe('')
    })

    await it('still loads a map the project did not activate', async () => {
      const fake = makeFakeEngine({ startupMapId: 'kokiri-forest' })
      const controller = makeController(fake)

      await controller.ensureForMap('/project.json', 'tree-house')

      expect(fake.loadedMaps.join(',')).toBe('tree-house')
    })

    await it('runs one project load when two opens overlap', async () => {
      // The defect: `SceneNavigator.open` starts hydration with `void
      // this._hydrate(…)`, so a second map open lands inside the first
      // one's awaits. Both then read `_projectPath === null` and both
      // call `loadProject` — and two `excalibur.start()` calls on one
      // Excalibur engine deadlock, so NEITHER finishes, no map is ever
      // loaded, and both hydration chains hang with nothing thrown.
      let release!: () => void
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const fake = makeFakeEngine({ startupMapId: 'kokiri-forest', holdProjectLoad: held })
      const controller = makeController(fake)

      const first = controller.ensureForMap('/project.json', 'kokiri-forest')
      const second = controller.ensureForMap('/project.json', 'tree-house')
      release()
      await Promise.all([first, second])

      expect(fake.loadedProjects.length).toBe(1)
    })

    await it('creates one engine when two opens overlap', async () => {
      // The other half: while the first bring-up waits for its canvas,
      // the widget has no Excalibur instance yet. A liveness probe of
      // `!engine.excalibur` reads that as "dead", so the second call
      // used to dispose a perfectly healthy engine mid-start — and the
      // first call's `loadProject` then waited on a `ready` signal that
      // widget would never emit.
      let release!: () => void
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const first = makeFakeEngine({ startupMapId: 'kokiri-forest', holdProjectLoad: held })
      const second = makeFakeEngine({ startupMapId: 'kokiri-forest' })
      const controller = makeController(first, second)

      const a = controller.ensureForMap('/project.json', 'kokiri-forest')
      const b = controller.ensureForMap('/project.json', 'kokiri-forest')
      release()
      await Promise.all([a, b])

      expect(second.totalHooks).toBe(0)
      expect(controller.engine).toBe(first.widget)
    })

    await it('loads the second map exactly once when two opens overlap', async () => {
      let release!: () => void
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const fake = makeFakeEngine({ startupMapId: 'kokiri-forest', holdProjectLoad: held })
      const controller = makeController(fake)

      const a = controller.ensureForMap('/project.json', 'kokiri-forest')
      const b = controller.ensureForMap('/project.json', 'tree-house')
      release()
      await Promise.all([a, b])

      // The queued call sees a cache that tells the truth: the project
      // load already put kokiri-forest up, so only the switch remains.
      expect(fake.loadedMaps.join(',')).toBe('tree-house')
    })

    await it('replaces an engine that reports itself unusable', async () => {
      const dead = makeFakeEngine()
      const fresh = makeFakeEngine()
      const controller = makeController(dead, fresh)
      await controller.ensureForMap('/project.json', 'kokiri-forest')

      dead.markUnusable()
      await controller.ensureForMap('/project.json', 'kokiri-forest')

      expect(controller.engine).toBe(fresh.widget)
    })

    await it('does not re-attach a hook on a second ensureForMap', async () => {
      const fake = makeFakeEngine()
      const controller = makeController(fake)

      await controller.ensureForMap('/project.json', 'kokiri-forest')
      const afterFirst = fake.totalHooks
      await controller.ensureForMap('/project.json', 'tree-house')

      expect(fake.totalHooks).toBe(afterFirst)
    })
  })

  await describe('EngineController.dispose', async () => {
    await it('forgets every hook, so a replacement engine is fully wired', async () => {
      const first = makeFakeEngine()
      const second = makeFakeEngine()
      const controller = makeController(first, second)
      await controller.ensureForMap('/project.json', 'kokiri-forest')

      controller.dispose()
      await controller.ensureForMap('/project.json', 'kokiri-forest')

      // The pre-set version reset one boolean per hook from a
      // hand-written list in `dispose`, and that list had lost
      // `layer-list` — so after one view switch the Layers tab stopped
      // following add / reorder / plane changes, silently.
      expect(second.widgetHooks).toBe(WIDGET_OWNED_HOOKS)
      expect(second.emitterHookCount).toBe(EMITTER_HOOK_COUNT)
    })

    await it('reports both actions disabled once the engine is gone', async () => {
      const controller = makeController(makeFakeEngine())
      const seen: Array<{ canUndo: boolean; canRedo: boolean }> = []
      await controller.ensureForMap('/project.json', 'kokiri-forest')
      controller.on('undo-changed', (state) => void seen.push(state))

      controller.dispose()

      expect(seen.at(-1)).toStrictEqual({ canUndo: false, canRedo: false })
    })
  })

  await describe('ENGINE_HOOKS', async () => {
    await it('names every hook exactly once', async () => {
      expect(new Set(ENGINE_HOOKS).size).toBe(ENGINE_HOOKS.length)
    })
  })
}

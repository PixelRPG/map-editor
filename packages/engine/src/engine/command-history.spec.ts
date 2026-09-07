/**
 * {@link CommandHistory.onChanged} — the observer `win.undo` /
 * `win.redo` take their enabled state from.
 *
 * It had no spec, and the surface it guards is easy to break from a
 * distance: the observer resolves the scene it listens to at subscribe
 * time and again on `MAP_LOADED`, so anything that makes either moment
 * point at the wrong scene silently disconnects undo from the map the
 * user is editing — the engine keeps recording commands, `canUndo()`
 * keeps returning `true`, and both buttons stay grey forever.
 *
 * So the contract pinned here is deliberately about WHICH scene the
 * observer follows, not only about the counts.
 */

import { describe, expect, it } from '@gjsify/unit'
import { type Entity, EventEmitter } from 'excalibur'

import type { Command } from '../commands/index.ts'
import { MapScene } from '../scenes/map.scene.ts'
import type { EngineEventMap } from '../types/index.ts'
import { EngineEvent } from '../types/index.ts'
import { CommandHistory } from './command-history.ts'

/**
 * A duck-typed `MapScene` (`Object.create`, so the engine's
 * `instanceof MapScene` narrowing holds) carrying just the entity list
 * `SessionState` needs for its session-singleton.
 */
function makeScene(): MapScene {
  const entities: Entity[] = []
  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, {
    // `Scene.entities` is a getter over the world's entity manager, so
    // the singleton has to be reachable through that same path.
    world: { entityManager: { entities } },
    add: (entity: Entity) => void entities.push(entity),
  })
  return scene
}

/** A command whose apply/revert only record where they ran. */
function makeCommand(applied: MapScene[] = []): Command {
  return {
    kind: 'test/noop',
    label: 'Test',
    payload: {},
    apply: (scene) => void applied.push(scene as MapScene),
    revert: (scene) => void applied.push(scene as MapScene),
  }
}

export default async function () {
  await describe('CommandHistory.onChanged', async () => {
    await it('fires immediately with the empty stack', async () => {
      const events = new EventEmitter<EngineEventMap>()
      const history = new CommandHistory(() => makeScene(), events)
      const seen: Array<{ canUndo: boolean; canRedo: boolean }> = []

      history.onChanged((state) => void seen.push(state))

      expect(seen).toStrictEqual([{ canUndo: false, canRedo: false }])
    })

    await it('reports canUndo after a command is executed', async () => {
      const events = new EventEmitter<EngineEventMap>()
      const scene = makeScene()
      const history = new CommandHistory(() => scene, events)
      const seen: Array<{ canUndo: boolean; canRedo: boolean }> = []
      history.onChanged((state) => void seen.push(state))

      history.execute(makeCommand())

      expect(seen.at(-1)).toStrictEqual({ canUndo: true, canRedo: false })
    })

    await it('follows undo and redo back down and up the stack', async () => {
      const events = new EventEmitter<EngineEventMap>()
      const scene = makeScene()
      const history = new CommandHistory(() => scene, events)
      const seen: Array<{ canUndo: boolean; canRedo: boolean }> = []
      history.onChanged((state) => void seen.push(state))

      history.execute(makeCommand())
      history.undo()
      expect(seen.at(-1)).toStrictEqual({ canUndo: false, canRedo: true })

      history.redo()
      expect(seen.at(-1)).toStrictEqual({ canUndo: true, canRedo: false })
    })

    await it('rebinds to the scene that is active when MAP_LOADED fires', async () => {
      const events = new EventEmitter<EngineEventMap>()
      const first = makeScene()
      const second = makeScene()
      let active = first
      const history = new CommandHistory(() => active, events)
      const seen: Array<{ canUndo: boolean; canRedo: boolean }> = []
      history.onChanged((state) => void seen.push(state))

      // The engine only announces MAP_LOADED once the switch has really
      // happened (see `swapInScene`), so the accessor already resolves
      // to the new scene here.
      active = second
      events.emit(EngineEvent.MAP_LOADED, { mapId: 'second' })
      expect(seen.at(-1)).toStrictEqual({ canUndo: false, canRedo: false })

      history.execute(makeCommand())

      expect(seen.at(-1)).toStrictEqual({ canUndo: true, canRedo: false })
    })

    await it('stops reporting the scene it was rebound away from', async () => {
      const events = new EventEmitter<EngineEventMap>()
      const first = makeScene()
      const second = makeScene()
      let active = first
      const history = new CommandHistory(() => active, events)
      const seen: Array<{ canUndo: boolean; canRedo: boolean }> = []
      history.onChanged((state) => void seen.push(state))

      active = second
      events.emit(EngineEvent.MAP_LOADED, { mapId: 'second' })
      const afterSwitch = seen.length

      // Mutate the OLD scene's stack directly through a history bound to it.
      const stale = new CommandHistory(() => first, events)
      stale.execute(makeCommand())

      expect(seen.length).toBe(afterSwitch)
    })

    await it('disconnects on dispose', async () => {
      const events = new EventEmitter<EngineEventMap>()
      const scene = makeScene()
      const history = new CommandHistory(() => scene, events)
      const seen: Array<{ canUndo: boolean; canRedo: boolean }> = []
      const dispose = history.onChanged((state) => void seen.push(state))

      dispose()
      history.execute(makeCommand())

      expect(seen).toStrictEqual([{ canUndo: false, canRedo: false }])
    })
  })
}

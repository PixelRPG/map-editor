import { describe, expect, it } from '@gjsify/unit'
import { Entity, EventEmitter, Scene } from 'excalibur'
import { EntityStatesComponent } from '../components/entity-states.component.ts'
import { GameSaveStateComponent } from '../components/game-save-state.component.ts'
import { PlacementIdComponent } from '../components/placement-id.component.ts'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import { FlagSystem } from '../systems/flag.system.ts'
import { StateSystem } from '../systems/state.system.ts'
import type { FlagData } from '../types/data/FlagData.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { writeFlag } from './flag-write.ts'

const DEFS: FlagData[] = [
  { id: 'coins', name: 'Coins', kind: 'number', initial: 0, scope: 'game' },
  { id: 'chest-open', name: 'Chest open', kind: 'yes-no', initial: false, scope: 'thing' },
]

function rig(runtime = true) {
  const events = new EventEmitter<EngineEventMap>()
  const scene = new Scene()
  if (runtime) SessionState.set(scene, new RuntimeModeComponent())
  const chest = new Entity()
  chest.addComponent(new PlacementIdComponent('chest-a'))
  chest.addComponent(new EntityStatesComponent([{ id: 'open', when: { flag: 'chest-open' }, components: [] }], []))
  scene.world.add(chest)
  const flags = new FlagSystem(events, DEFS)
  const states = new StateSystem()
  for (const system of [flags, states]) system.onInitialize(scene.world, scene)
  const store = () => SessionState.get(scene, GameSaveStateComponent)!
  const write = (flag: string, value: boolean | number | string, thing?: string) =>
    writeFlag(events, scene, DEFS, flag, value, thing)
  return { events, scene, chest, states, store, write }
}

export default async () => {
  await describe('writeFlag — the Game memory panel’s write', async () => {
    await it('lands a game-scoped value in the world bag', async () => {
      const { store, write } = rig()
      expect(write('coins', 7)).toBe(true)
      expect(store().world.flags.coins).toBe(7)
    })

    await it('lands a thing-scoped value in that placement’s own bag and re-resolves its state', async () => {
      const { store, write, states, chest } = rig()
      states.onUpdate(16)
      expect(chest.get(EntityStatesComponent)?.activeStateId).toBe(null)
      expect(write('chest-open', true, 'chest-a')).toBe(true)
      states.onUpdate(16)
      expect(store().world.things['chest-a']).toStrictEqual({ 'chest-open': true })
      expect(chest.get(EntityStatesComponent)?.activeStateId).toBe('open')
    })

    await it('is announced as FLAG_SET, like a value the game wrote itself', async () => {
      const { events, write } = rig()
      const seen: string[] = []
      events.on(EngineEvent.FLAG_SET, (p) => seen.push(`${p.flag}=${String(p.value)}`))
      write('coins', 3)
      expect(seen).toStrictEqual(['coins=3'])
    })

    await it('refuses outside a run', async () => {
      const { store, write } = rig(false)
      expect(write('coins', 7)).toBe(false)
      expect(store().world.flags.coins).toBe(0)
    })

    await it('refuses a flag the project never declared and a value of the wrong type', async () => {
      const { store, write } = rig()
      expect(write('nope', 1)).toBe(false)
      expect(write('coins', 'many')).toBe(false)
      expect(store().world.flags.coins).toBe(0)
    })
  })
}

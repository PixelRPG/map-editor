import { describe, expect, it } from '@gjsify/unit'
import { Entity, EventEmitter, Scene } from 'excalibur'
import { EntityStatesComponent } from '../components/entity-states.component.ts'
import { EventActionsComponent } from '../components/event-actions.component.ts'
import { GameSaveStateComponent } from '../components/game-save-state.component.ts'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import type { ActionData } from '../types/data/ActionData.ts'
import type { EntityState } from '../types/data/EntityDefinition.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { EventActionSystem } from './event-action.system.ts'
import { FlagSystem } from './flag.system.ts'
import { StateSystem } from './state.system.ts'

const LOCKED: ActionData = { id: 'a1', type: 'show-text', text: 'Locked' }
const OPEN: ActionData = { id: 'a2', type: 'teleport', targetMapId: 'inside', targetTileX: 1, targetTileY: 1 }

/**
 * The key-and-door rig: a door whose base behaviour says "Locked" and
 * whose `open` state teleports, gated on the `has-key` flag. `seen`
 * records the engine events an interaction produced, which is what a
 * player would experience.
 */
function rig(states: EntityState[], baseActions: ActionData[] = [LOCKED], runtime = true) {
  const events = new EventEmitter<EngineEventMap>()
  const scene = new Scene()
  if (runtime) SessionState.set(scene, new RuntimeModeComponent())

  const door = new Entity()
  door.addComponent(new EventActionsComponent(baseActions.slice()))
  door.addComponent(new EntityStatesComponent(states, baseActions))
  scene.world.add(door)

  const flags = new FlagSystem(events)
  const stateSystem = new StateSystem()
  const actions = new EventActionSystem(events)
  for (const system of [flags, stateSystem, actions]) system.initialize(scene.world, scene)

  const seen: string[] = []
  events.on(EngineEvent.SHOW_TEXT_REQUESTED, (p) => seen.push(`text:${p.text}`))
  events.on(EngineEvent.TELEPORT_REQUESTED, (p) => seen.push(`tp:${p.targetMapId}`))

  const interact = () => events.emit(EngineEvent.TRIGGER_FIRED, { entityId: door.id, by: 'action-button' })
  const tick = () => stateSystem.update(16)
  return { events, scene, door, seen, interact, tick }
}

const openState: EntityState = {
  id: 'open',
  when: { flag: 'has-key' },
  components: [{ type: 'actions', actions: [OPEN] }],
}

export default async () => {
  await describe('flag store + entity states — the key and the door', async () => {
    await it('runs the base actions before the flag is set', async () => {
      const { interact, tick, seen } = rig([openState])
      tick()
      interact()
      expect(seen).toStrictEqual(['text:Locked'])
    })

    await it('runs the state actions once the flag is set', async () => {
      const { events, interact, tick, seen } = rig([openState])
      tick()
      interact()
      events.emit(EngineEvent.FLAG_SET, { flag: 'has-key', value: true })
      tick()
      interact()
      expect(seen).toStrictEqual(['text:Locked', 'tp:inside'])
    })

    await it('runs the base actions again once the save state is cleared', async () => {
      const { events, scene, interact, tick, seen } = rig([openState])
      events.emit(EngineEvent.FLAG_SET, { flag: 'has-key', value: true })
      tick()
      interact()
      // ↺ Restart clears the playthrough's save state.
      SessionState.set(scene, new GameSaveStateComponent())
      tick()
      interact()
      expect(seen).toStrictEqual(['tp:inside', 'text:Locked'])
    })

    await it('folds FLAG_SET into the save state on the session singleton', async () => {
      const { events, scene } = rig([openState])
      events.emit(EngineEvent.FLAG_SET, { flag: 'has-key', value: true })
      events.emit(EngineEvent.FLAG_SET, { flag: 'coins', value: 3 })
      expect(SessionState.get(scene, GameSaveStateComponent)?.flags).toStrictEqual({ 'has-key': true, coins: 3 })
    })

    await it('matches a non-boolean flag through `equals`', async () => {
      const { events, interact, tick, seen } = rig([
        { id: 'open', when: { flag: 'quest', equals: 'done' }, components: [{ type: 'actions', actions: [OPEN] }] },
      ])
      events.emit(EngineEvent.FLAG_SET, { flag: 'quest', value: 'started' })
      tick()
      interact()
      events.emit(EngineEvent.FLAG_SET, { flag: 'quest', value: 'done' })
      tick()
      interact()
      expect(seen).toStrictEqual(['text:Locked', 'tp:inside'])
    })

    await it('takes the first matching state', async () => {
      const { events, interact, tick, seen } = rig([
        { id: 'first', when: { flag: 'f' }, components: [{ type: 'actions', actions: [OPEN] }] },
        {
          id: 'second',
          when: { flag: 'f' },
          components: [{ type: 'actions', actions: [{ id: 'a3', type: 'show-text', text: 'second' }] }],
        },
      ])
      events.emit(EngineEvent.FLAG_SET, { flag: 'f', value: true })
      tick()
      interact()
      expect(seen).toStrictEqual(['tp:inside'])
    })

    await it('never activates a state without a condition', async () => {
      const { interact, tick, seen } = rig([{ id: 'manual', components: [{ type: 'actions', actions: [OPEN] }] }])
      tick()
      interact()
      expect(seen).toStrictEqual(['text:Locked'])
    })

    await it('never matches a condition shape this build does not understand', async () => {
      // Forward compatibility: a project from a newer editor opens and
      // behaves predictably rather than half-matching.
      const { events, interact, tick, seen } = rig([
        {
          id: 'future',
          when: { hour: 20 } as unknown as EntityState['when'],
          components: [{ type: 'actions', actions: [OPEN] }],
        },
      ])
      events.emit(EngineEvent.FLAG_SET, { flag: 'hour', value: 20 })
      tick()
      interact()
      expect(seen).toStrictEqual(['text:Locked'])
    })

    await it('keeps the base actions when a state overlays other component types only', async () => {
      // Actions-only runtime: the door's look does not change, and the
      // behaviour it had must not silently be cleared either.
      const { events, interact, tick, seen } = rig([
        { id: 'open', when: { flag: 'has-key' }, components: [{ type: 'visual', spriteSetId: 's', spriteId: 4 }] },
      ])
      events.emit(EngineEvent.FLAG_SET, { flag: 'has-key', value: true })
      tick()
      interact()
      expect(seen).toStrictEqual(['text:Locked'])
    })

    await it('gives an entity with no base actions the state actions', async () => {
      const { events, door, interact, tick, seen } = rig([openState], [])
      door.removeComponent(EventActionsComponent, true)
      events.emit(EngineEvent.FLAG_SET, { flag: 'has-key', value: true })
      tick()
      interact()
      expect(seen).toStrictEqual(['tp:inside'])
    })

    await it('does not resolve states while editing', async () => {
      // Gated on RuntimeModeComponent like PlayerSystem: the editor
      // always shows the base composition.
      const { events, door, tick } = rig([openState], [LOCKED], false)
      events.emit(EngineEvent.FLAG_SET, { flag: 'has-key', value: true })
      tick()
      expect(door.get(EntityStatesComponent)?.activeStateId).toBe(null)
      expect(door.get(EventActionsComponent)?.actions).toStrictEqual([LOCKED])
    })

    await it('records which state is active', async () => {
      const { events, door, tick } = rig([openState])
      tick()
      expect(door.get(EntityStatesComponent)?.activeStateId).toBe(null)
      expect(door.get(EntityStatesComponent)?.resolvedOnce).toBe(true)
      events.emit(EngineEvent.FLAG_SET, { flag: 'has-key', value: true })
      tick()
      expect(door.get(EntityStatesComponent)?.activeStateId).toBe('open')
    })
  })
}

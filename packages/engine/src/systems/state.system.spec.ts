import { describe, expect, it } from '@gjsify/unit'
import { Entity, EventEmitter, Scene } from 'excalibur'
import { EntityStatesComponent } from '../components/entity-states.component.ts'
import { EventActionsComponent } from '../components/event-actions.component.ts'
import { GameSaveStateComponent } from '../components/game-save-state.component.ts'
import { PlacementIdComponent } from '../components/placement-id.component.ts'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import type { ActionData } from '../types/data/ActionData.ts'
import type { EntityState } from '../types/data/EntityDefinition.ts'
import type { FlagData } from '../types/data/FlagData.ts'
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
  for (const system of [flags, stateSystem, actions]) system.onInitialize(scene.world, scene)

  const seen: string[] = []
  events.on(EngineEvent.SHOW_TEXT_REQUESTED, (p) => {
    seen.push(`text:${p.text}`)
    // No text box in this rig: close at once, as a dismissed one would.
    events.emit(EngineEvent.DIALOGUE_CLOSED, {})
  })
  events.on(EngineEvent.TELEPORT_REQUESTED, (p) => seen.push(`tp:${p.targetMapId}`))

  const interact = () => events.emit(EngineEvent.TRIGGER_FIRED, { entityId: door.id, by: 'action-button' })
  const tick = () => stateSystem.onUpdate(16)
  return { events, scene, door, seen, interact, tick }
}

const openState: EntityState = {
  id: 'open',
  when: { flag: 'has-key' },
  components: [{ type: 'actions', actions: [OPEN] }],
}

const TAKE_LID_OFF: ActionData = { id: 'c1', type: 'set-flag', flag: 'chest-open', value: true }
const EMPTY: ActionData = { id: 'c2', type: 'show-text', text: 'Empty' }
const COIN_FOUND: ActionData = { id: 'c3', type: 'set-flag', flag: 'found-a-chest', value: true }

/**
 * Two chests built from one definition, sharing one `scope: 'thing'`
 * flag — the case the scope exists for. Touching a shut chest sets
 * "Chest is open" and gives a coin; touching an open one says it is
 * empty. If the flag were one value for the game, the second chest
 * would be empty before anyone touched it.
 */
function chestRig() {
  const events = new EventEmitter<EngineEventMap>()
  const scene = new Scene()
  SessionState.set(scene, new RuntimeModeComponent())

  const base = [TAKE_LID_OFF, COIN_FOUND]
  const states: EntityState[] = [
    { id: 'open', when: { flag: 'chest-open' }, components: [{ type: 'actions', actions: [EMPTY] }] },
  ]
  const chests = new Map<string, Entity>()
  for (const id of ['chest-a', 'chest-b']) {
    const chest = new Entity()
    chest.addComponent(new PlacementIdComponent(id))
    chest.addComponent(new EventActionsComponent(base.slice()))
    chest.addComponent(new EntityStatesComponent(states, base))
    scene.world.add(chest)
    chests.set(id, chest)
  }

  const flagDefs: FlagData[] = [
    { id: 'chest-open', name: 'Chest open', kind: 'yes-no', initial: false, scope: 'thing' },
    { id: 'found-a-chest', name: 'Found a chest', kind: 'yes-no', initial: false, scope: 'game' },
  ]
  const flags = new FlagSystem(events, flagDefs)
  const stateSystem = new StateSystem()
  const actions = new EventActionSystem(events)
  for (const system of [flags, stateSystem, actions]) system.onInitialize(scene.world, scene)

  const seen: string[] = []
  events.on(EngineEvent.SHOW_TEXT_REQUESTED, (p) => {
    seen.push(`text:${p.text}`)
    events.emit(EngineEvent.DIALOGUE_CLOSED, {})
  })

  const touch = (id: string) => events.emit(EngineEvent.TRIGGER_FIRED, { entityId: chests.get(id)!.id, by: 'touch' })
  const tick = () => stateSystem.onUpdate(16)
  const store = () => SessionState.get(scene, GameSaveStateComponent)!
  const stateOf = (id: string) => chests.get(id)!.get(EntityStatesComponent)?.activeStateId ?? null
  return { events, scene, seen, touch, tick, store, stateOf }
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

    await it('adds to a counter flag and flips a comparing state at the threshold', async () => {
      const { events, interact, tick, seen, scene } = rig([
        {
          id: 'open',
          when: { type: 'counter', flag: 'coins', op: '≥', value: 3 },
          components: [{ type: 'actions', actions: [OPEN] }],
        },
      ])
      for (let i = 0; i < 2; i++) events.emit(EngineEvent.COUNTER_CHANGED, { flag: 'coins', amount: 1 })
      tick()
      interact()
      events.emit(EngineEvent.COUNTER_CHANGED, { flag: 'coins', amount: 1 })
      tick()
      interact()
      events.emit(EngineEvent.COUNTER_CHANGED, { flag: 'coins', amount: -2 })
      tick()
      interact()
      expect(SessionState.get(scene, GameSaveStateComponent)?.flags.coins).toBe(1)
      expect(seen).toStrictEqual(['text:Locked', 'tp:inside', 'text:Locked'])
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

  await describe('this chest is open — one flag, one memory per placement', async () => {
    await it('opens only the chest that was touched', async () => {
      const { touch, tick, store, stateOf } = chestRig()
      touch('chest-a')
      tick()
      expect(store().world.things).toStrictEqual({ 'chest-a': { 'chest-open': true } })
      expect(stateOf('chest-a')).toBe('open')
      expect(stateOf('chest-b')).toBe(null)
    })

    await it('leaves the shared bag alone, so a second chest still starts shut', async () => {
      const { touch, tick, store } = chestRig()
      touch('chest-a')
      tick()
      // The whole bug: a thing-scoped write that landed in `world.flags`
      // would read back `true` for every chest in the game.
      expect(store().flags['chest-open']).toBe(false)
    })

    await it('runs each chest’s own body: the first gives, the second gives, the first is empty', async () => {
      const { touch, tick, seen, store } = chestRig()
      touch('chest-a')
      tick()
      touch('chest-b')
      tick()
      touch('chest-a')
      expect(seen).toStrictEqual(['text:Empty'])
      expect(store().world.things).toStrictEqual({
        'chest-a': { 'chest-open': true },
        'chest-b': { 'chest-open': true },
      })
    })

    await it('still writes a game-scoped flag from a placement to the world', async () => {
      // Scope decides the bag, not where the action ran: a chest that
      // sets "Found a chest" sets it for the playthrough.
      const { touch, store } = chestRig()
      touch('chest-a')
      expect(store().flags['found-a-chest']).toBe(true)
      expect(store().world.things['chest-a']).toStrictEqual({ 'chest-open': true })
    })
  })
}

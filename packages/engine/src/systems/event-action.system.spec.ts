import { describe, expect, it } from '@gjsify/unit'
import { Entity, EventEmitter, Scene } from 'excalibur'

import { ActionRunComponent, ControlLockComponent, EventActionsComponent } from '../components/index.ts'
import type { ActionData } from '../types/data/ActionData.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { EventActionSystem, MAX_STEPS_PER_TICK, type StepOutcome } from './event-action.system.ts'

function setup(actions: ActionData[] | null) {
  const events = new EventEmitter<EngineEventMap>()
  const scene = new Scene()
  const entity = new Entity()
  if (actions) entity.addComponent(new EventActionsComponent(actions))
  scene.world.add(entity)
  const sys = new EventActionSystem(events)
  sys.onInitialize(scene.world, scene)
  const seen: string[] = []
  events.on(EngineEvent.SHOW_TEXT_REQUESTED, (p) => {
    seen.push(`text:${p.text}`)
    // No text box in this rig: close at once, as a dismissed one would.
    events.emit(EngineEvent.DIALOGUE_CLOSED, {})
  })
  events.on(EngineEvent.TELEPORT_REQUESTED, (p) => seen.push(`tp:${p.targetMapId}`))
  events.on(EngineEvent.ITEM_PICKED_UP, (p) => seen.push(`item:${p.itemId}x${p.qty}`))
  events.on(EngineEvent.FLAG_SET, (p) => seen.push(`flag:${p.flag}=${String(p.value)}`))
  events.on(EngineEvent.PLAY_SFX_REQUESTED, (p) => seen.push(`sfx:${p.sound}`))
  return { events, entity, seen }
}

export default async () => {
  await describe('EventActionSystem', async () => {
    await it('runs each action in order on TRIGGER_FIRED, mapped to engine events', async () => {
      const { events, entity, seen } = setup([
        { id: '1', type: 'show-text', text: 'hi' },
        { id: '2', type: 'give-item', itemId: 'potion', qty: 2 },
        { id: '3', type: 'set-flag', flag: 'opened', value: true },
        { id: '4', type: 'play-sfx', sound: 'chime' },
        // Last on purpose: a teleport step ends the run.
        { id: '5', type: 'teleport', targetMapId: 'dungeon', targetTileX: 3, targetTileY: 4 },
      ])
      events.emit(EngineEvent.TRIGGER_FIRED, { entityId: entity.id, by: 'action-button' })
      expect(seen).toStrictEqual(['text:hi', 'item:potionx2', 'flag:opened=true', 'sfx:chime', 'tp:dungeon'])
    })

    await it('defaults give-item qty to 1', async () => {
      const { events, entity, seen } = setup([{ id: '1', type: 'give-item', itemId: 'key' }])
      events.emit(EngineEvent.TRIGGER_FIRED, { entityId: entity.id, by: 'action-button' })
      expect(seen).toStrictEqual(['item:keyx1'])
    })

    await it('ignores a trigger from an entity without an actions component', async () => {
      const { events, entity, seen } = setup(null)
      events.emit(EngineEvent.TRIGGER_FIRED, { entityId: entity.id, by: 'walk-onto' })
      expect(seen.length).toBe(0)
    })
  })

  await describe('EventActionSystem — localized text', async () => {
    function run(locale: string | undefined, languages = { default: 'en', others: ['de'] }) {
      const events = new EventEmitter<EngineEventMap>()
      const scene = new Scene()
      const entity = new Entity()
      entity.addComponent(
        new EventActionsComponent([
          {
            id: '1',
            type: 'show-text',
            text: { en: 'Hello', de: 'Hallo' },
            speaker: { en: 'Mido', de: 'Mido (Wächter)' },
          },
        ]),
      )
      scene.world.add(entity)
      const sys = new EventActionSystem(events, languages, locale)
      sys.onInitialize(scene.world, scene)
      const seen: string[] = []
      events.on(EngineEvent.SHOW_TEXT_REQUESTED, (p) => seen.push(`${p.speaker}: ${p.text}`))
      events.emit(EngineEvent.TRIGGER_FIRED, { entityId: entity.id, by: 'action-button' })
      return seen
    }

    await it('shows the project default language when no locale is given', async () => {
      expect(run(undefined)).toStrictEqual(['Mido: Hello'])
    })

    await it('shows the requested language for text and speaker', async () => {
      expect(run('de')).toStrictEqual(['Mido (Wächter): Hallo'])
    })

    await it('falls back to the default language for an unknown locale', async () => {
      expect(run('fr')).toStrictEqual(['Mido: Hello'])
    })
  })

  await describe('EventActionSystem — sequencing', async () => {
    const flag = (n: number): ActionData => ({ id: `f${n}`, type: 'set-flag', flag: `f${n}`, value: true })
    const wait = (ms: number): ActionData => ({ id: `w${ms}`, type: 'wait', ms })
    const fire = (
      events: EventEmitter<EngineEventMap>,
      entity: Entity,
      by: 'action-button' | 'auto' = 'action-button',
    ) => events.emit(EngineEvent.TRIGGER_FIRED, { entityId: entity.id, by })

    function rig(
      actions: ActionData[],
      make: (events: EventEmitter<EngineEventMap>) => EventActionSystem = (e) => new EventActionSystem(e),
    ) {
      const events = new EventEmitter<EngineEventMap>()
      const scene = new Scene()
      const entity = new Entity()
      entity.addComponent(new EventActionsComponent(actions))
      scene.world.add(entity)
      const sys = make(events)
      sys.onInitialize(scene.world, scene)
      const seen: string[] = []
      events.on(EngineEvent.FLAG_SET, (p) => seen.push(p.flag))
      events.on(EngineEvent.SHOW_TEXT_REQUESTED, (p) => seen.push(`text:${p.text}`))
      const locked = () => SessionState.get(scene, ControlLockComponent) !== null
      const running = () => entity.has(ActionRunComponent)
      return { events, scene, entity, sys, seen, locked, running }
    }

    await it('resumes after wait at the step after it', async () => {
      const { events, entity, sys, seen, running } = rig([flag(1), wait(100), flag(2)])
      fire(events, entity)
      expect(seen).toStrictEqual(['f1'])
      expect(running()).toBe(true)
      sys.onUpdate(60)
      expect(seen).toStrictEqual(['f1'])
      sys.onUpdate(60)
      expect(seen).toStrictEqual(['f1', 'f2'])
      expect(running()).toBe(false)
    })

    await it('holds a show-text step until the text box closes', async () => {
      const text: ActionData = { id: 't', type: 'show-text', text: 'hi' }
      const { events, entity, sys, seen, locked, running } = rig([text, flag(1)])
      fire(events, entity)
      sys.onUpdate(16)
      expect(seen).toStrictEqual(['text:hi'])
      expect(running()).toBe(true)
      expect(locked()).toBe(true)
      events.emit(EngineEvent.DIALOGUE_CLOSED, {})
      sys.onUpdate(16)
      expect(seen).toStrictEqual(['text:hi', 'f1'])
      expect(running()).toBe(false)
      expect(locked()).toBe(false)
    })

    await it('does not wait when the text box closes inside the request', async () => {
      const text: ActionData = { id: 't', type: 'show-text', text: '' }
      const { events, entity, seen, running } = rig([text, flag(1)])
      events.on(EngineEvent.SHOW_TEXT_REQUESTED, () => events.emit(EngineEvent.DIALOGUE_CLOSED, {}))
      fire(events, entity)
      expect(seen).toStrictEqual(['text:', 'f1'])
      expect(running()).toBe(false)
    })

    await it('drops a trigger during a run instead of queueing or restarting it', async () => {
      const { events, entity, sys, seen } = rig([flag(1), wait(100), flag(2)])
      fire(events, entity)
      fire(events, entity)
      sys.onUpdate(100)
      sys.onUpdate(100)
      expect(seen).toStrictEqual(['f1', 'f2'])
    })

    await it('refuses a run on another entity while a blocking run waits', async () => {
      const { events, scene, entity, sys, seen } = rig([wait(100)])
      const other = new Entity()
      other.addComponent(new EventActionsComponent([flag(9)]))
      scene.world.add(other)
      fire(events, entity)
      fire(events, other, 'auto')
      expect(seen.length).toBe(0)
      sys.onUpdate(100)
      fire(events, other)
      expect(seen).toStrictEqual(['f9'])
    })

    await it('holds the control lock only while a blocking run waits', async () => {
      const { events, entity, sys, locked } = rig([wait(50)])
      expect(locked()).toBe(false)
      fire(events, entity)
      expect(locked()).toBe(true)
      sys.onUpdate(50)
      expect(locked()).toBe(false)
    })

    await it('never takes the lock for a list that finishes inside the trigger', async () => {
      const { events, entity, locked } = rig([flag(1)])
      fire(events, entity)
      expect(locked()).toBe(false)
    })

    await it('ends the run and releases the lock at a teleport step', async () => {
      const { events, entity, sys, seen, locked, running } = rig([
        wait(10),
        { id: 't', type: 'teleport', targetMapId: 'm', targetTileX: 1, targetTileY: 1 },
        flag(1),
      ])
      fire(events, entity)
      expect(locked()).toBe(true)
      sys.onUpdate(10)
      expect(seen.length).toBe(0)
      expect(running()).toBe(false)
      expect(locked()).toBe(false)
    })

    await it('keeps the lock with the scene it belongs to', async () => {
      const { events, entity } = rig([wait(50)])
      fire(events, entity)
      expect(SessionState.get(new Scene(), ControlLockComponent)).toBe(null)
    })

    await it('yields at the step budget so a self-entering list cannot hang the frame', async () => {
      class Looping extends EventActionSystem {
        public entered = 0
        protected override step(run: ActionRunComponent): StepOutcome {
          this.entered++
          return { kind: 'enter', actions: run.frames[0].actions }
        }
      }
      let sys: Looping | null = null
      const { events, entity } = rig([flag(1)], (e) => {
        sys = new Looping(e)
        return sys
      })
      fire(events, entity)
      expect(sys!.entered).toBe(MAX_STEPS_PER_TICK)
      sys!.onUpdate(16)
      expect(sys!.entered).toBe(MAX_STEPS_PER_TICK * 2)
    })

    await it('does no work when idle', async () => {
      const { sys, running } = rig([flag(1)])
      sys.onUpdate(16)
      expect(running()).toBe(false)
    })
  })
}

import { describe, expect, it } from '@gjsify/unit'
import { Entity, EventEmitter, Scene } from 'excalibur'

import { EventActionsComponent } from '../components/index.ts'
import type { ActionData } from '../types/data/ActionData.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { EventActionSystem } from './event-action.system.ts'

function setup(actions: ActionData[] | null) {
  const events = new EventEmitter<EngineEventMap>()
  const scene = new Scene()
  const entity = new Entity()
  if (actions) entity.addComponent(new EventActionsComponent(actions))
  scene.world.add(entity)
  const sys = new EventActionSystem(events)
  sys.initialize(scene.world, scene)
  const seen: string[] = []
  events.on(EngineEvent.SHOW_TEXT_REQUESTED, (p) => seen.push(`text:${p.text}`))
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
        { id: '2', type: 'teleport', targetMapId: 'dungeon', targetTileX: 3, targetTileY: 4 },
        { id: '3', type: 'give-item', itemId: 'potion', qty: 2 },
        { id: '4', type: 'set-flag', flag: 'opened', value: true },
        { id: '5', type: 'play-sfx', sound: 'chime' },
      ])
      events.emit(EngineEvent.TRIGGER_FIRED, { entityId: entity.id, by: 'action-button' })
      expect(seen).toStrictEqual(['text:hi', 'tp:dungeon', 'item:potionx2', 'flag:opened=true', 'sfx:chime'])
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
}

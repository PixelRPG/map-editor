import { describe, expect, it } from '@gjsify/unit'
import { Entity, EventEmitter, Scene } from 'excalibur'

import { DialogueComponent, TileTransformComponent, TriggerComponent } from '../components/index.ts'
import { dialogueSpec } from '../entity/specs/dialogue.ts'
import { migrateMapDialogue, migrateProjectDialogue } from '../format/migrate-dialogue.ts'
import type { GameProjectData, MapData } from '../types/data/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { EventActionSystem } from './event-action.system.ts'
import { TriggerSystem } from './trigger.system.ts'

const LANGS = { default: 'en', others: ['de'] }

function rig(
  locale?: string,
  lines: DialogueComponent['lines'] = [
    { en: 'One', de: 'Eins' },
    { en: 'Two', de: 'Zwei' },
  ],
) {
  const events = new EventEmitter<EngineEventMap>()
  const scene = new Scene()
  const sign = new Entity()
  sign.addComponent(new TileTransformComponent(5, 5, 'l'))
  sign.addComponent(new TriggerComponent('action-button'))
  sign.addComponent(new DialogueComponent(lines, { en: 'Sign', de: 'Schild' }))
  scene.world.add(sign)
  new TriggerSystem(events).onInitialize(scene.world, scene)
  const actions = new EventActionSystem(events, LANGS, locale)
  actions.onInitialize(scene.world, scene)
  const seen: string[] = []
  events.on(EngineEvent.SHOW_TEXT_REQUESTED, (p) => seen.push(`${p.speaker}: ${p.text}`))
  return { events, seen, actions }
}

export default async () => {
  await describe('dialogue — speaking', async () => {
    await it('speaks one box per line when read while facing it', async () => {
      const { events, seen, actions } = rig()
      events.emit(EngineEvent.PLAYER_ACTION_PRESSED, { tileX: 5, tileY: 6, facing: 'up' })
      expect(seen).toStrictEqual(['Sign: One'])
      events.emit(EngineEvent.DIALOGUE_CLOSED, {})
      actions.onUpdate(16)
      expect(seen).toStrictEqual(['Sign: One', 'Sign: Two'])
    })

    await it('skips a page with nothing to say, and a blank one in the played language', async () => {
      const { events, seen, actions } = rig(undefined, ['', 'Hello', { en: '  ' }, 'Bye'])
      events.emit(EngineEvent.PLAYER_ACTION_PRESSED, { tileX: 5, tileY: 6, facing: 'up' })
      expect(seen).toStrictEqual(['Sign: Hello'])
      events.emit(EngineEvent.DIALOGUE_CLOSED, {})
      actions.onUpdate(16)
      expect(seen).toStrictEqual(['Sign: Hello', 'Sign: Bye'])
    })

    await it('uses the active language', async () => {
      const { events, seen } = rig('de')
      events.emit(EngineEvent.PLAYER_ACTION_PRESSED, { tileX: 5, tileY: 6, facing: 'up' })
      expect(seen).toStrictEqual(['Schild: Eins'])
    })

    await it('stays silent when the hero faces away or stands beside', async () => {
      const { events, seen } = rig()
      events.emit(EngineEvent.PLAYER_ACTION_PRESSED, { tileX: 5, tileY: 6, facing: 'down' })
      events.emit(EngineEvent.PLAYER_ACTION_PRESSED, { tileX: 4, tileY: 6, facing: 'up' })
      events.emit(EngineEvent.PLAYER_ACTION_PRESSED, { tileX: 4, tileY: 5, facing: 'left' })
      expect(seen.length).toBe(0)
    })

    await it('drops a re-trigger while the box is open', async () => {
      const { events, seen } = rig()
      events.emit(EngineEvent.PLAYER_ACTION_PRESSED, { tileX: 5, tileY: 6, facing: 'up' })
      events.emit(EngineEvent.PLAYER_ACTION_PRESSED, { tileX: 5, tileY: 6, facing: 'up' })
      expect(seen).toStrictEqual(['Sign: One'])
    })
  })

  await describe('dialogue — spec and migration', async () => {
    await it('validates lines and speaker', async () => {
      expect(dialogueSpec.validate?.({ type: 'dialogue', lines: [{ en: 'a' }, 'b'] }).length).toBe(0)
      expect((dialogueSpec.validate?.({ type: 'dialogue' }) ?? []).length > 0).toBe(true)
      expect((dialogueSpec.validate?.({ type: 'dialogue', lines: [3] }) ?? []).length > 0).toBe(true)
      expect((dialogueSpec.validate?.({ type: 'dialogue', lines: [], dialogueId: 'x' }) ?? []).length > 0).toBe(true)
    })

    await it('migrates a legacy dialogueId in the library and in map placements', async () => {
      const project = {
        entityLibrary: [{ id: 'n', name: 'N', components: [{ type: 'dialogue', dialogueId: 'hi' }] }],
      } as unknown as GameProjectData
      migrateProjectDialogue(project)
      expect(project.entityLibrary?.[0].components[0]).toStrictEqual({ type: 'dialogue', lines: [] })

      const map = {
        objectPlacements: [
          { id: 'p', inline: { id: 'd', name: 'D', components: [{ type: 'dialogue', dialogueId: 'x' }] } },
        ],
      } as unknown as MapData
      migrateMapDialogue(map)
      expect(map.objectPlacements?.[0].inline?.components[0]).toStrictEqual({ type: 'dialogue', lines: [] })
    })

    await it('leaves a current dialogue untouched', async () => {
      const comp = { type: 'dialogue', lines: [{ en: 'a' }] }
      const project = { entityLibrary: [{ id: 'n', name: 'N', components: [comp] }] } as unknown as GameProjectData
      migrateProjectDialogue(project)
      expect(project.entityLibrary?.[0].components[0]).toStrictEqual({ type: 'dialogue', lines: [{ en: 'a' }] })
    })
  })
}

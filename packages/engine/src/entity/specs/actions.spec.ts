import { describe, expect, it } from '@gjsify/unit'

import { EventActionsComponent } from '../../components/index.ts'
import type { ComponentData } from '../../types/data/index.ts'
import { isActionData } from '../../types/data/ActionData.ts'
import { actionsSpec } from './actions.ts'

export default async () => {
  await describe('isActionData', async () => {
    await it('accepts each well-formed action type', async () => {
      expect(isActionData({ id: '1', type: 'show-text', text: 'hi' })).toBe(true)
      expect(isActionData({ id: '2', type: 'teleport', targetMapId: 'm', targetTileX: 1, targetTileY: 2 })).toBe(true)
      expect(isActionData({ id: '3', type: 'give-item', itemId: 'potion' })).toBe(true)
      expect(isActionData({ id: '4', type: 'set-flag', flag: 'f', value: true })).toBe(true)
      expect(isActionData({ id: '5', type: 'play-sfx', sound: 's' })).toBe(true)
      expect(isActionData({ id: '6', type: 'wait', ms: 100 })).toBe(true)
    })

    await it('rejects malformed / unknown entries', async () => {
      expect(isActionData({ id: '1', type: 'show-text' })).toBe(false) // missing text
      expect(isActionData({ id: '2', type: 'teleport', targetMapId: 'm' })).toBe(false) // missing coords
      expect(isActionData({ type: 'show-text', text: 'x' })).toBe(false) // missing id
      expect(isActionData({ id: '3', type: 'nope' })).toBe(false) // unknown type
      expect(isActionData(null)).toBe(false)
    })
  })

  await describe('actionsSpec.validate', async () => {
    const run = (actions: unknown): string[] =>
      actionsSpec.validate?.({ type: 'actions', actions } as ComponentData) ?? []

    await it('passes an empty or valid list', async () => {
      expect(run([]).length).toBe(0)
      expect(run([{ id: 'a', type: 'show-text', text: 'hi' }]).length).toBe(0)
      expect(run(undefined).length).toBe(0)
    })

    await it('flags a non-array, an invalid entry, and duplicate ids', async () => {
      expect(run('nope').length).toBeGreaterThan(0)
      expect(run([{ id: 'a', type: 'bogus' }]).length).toBeGreaterThan(0)
      const dup = run([
        { id: 'x', type: 'play-sfx', sound: 's' },
        { id: 'x', type: 'play-sfx', sound: 't' },
      ])
      expect(dup.some((e) => e.includes('duplicate'))).toBe(true)
    })
  })

  await describe('actionsSpec.build', async () => {
    await it('builds an inert EventActionsComponent carrying the list', async () => {
      const comp = actionsSpec.build(
        { type: 'actions', actions: [{ id: 'a', type: 'play-sfx', sound: 's' }] } as ComponentData,
        { placementId: 'p', tileX: 0, tileY: 0, tileWidth: 16, tileHeight: 16 },
      )
      expect(comp instanceof EventActionsComponent).toBe(true)
      expect((comp as EventActionsComponent).actions.length).toBe(1)
    })
  })
}

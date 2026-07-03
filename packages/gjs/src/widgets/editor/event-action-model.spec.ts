import { describe, expect, it } from '@gjsify/unit'

import { actionSummary, defaultAction, makeActionId, parseFlagValue } from './event-action-model.ts'

export default async () => {
  await describe('event-action-model', async () => {
    await it('builds a valid default action for every type', async () => {
      expect(defaultAction('show-text', 'a', '')).toStrictEqual({ id: 'a', type: 'show-text', text: '' })
      expect(defaultAction('teleport', 'b', 'cave')).toStrictEqual({
        id: 'b',
        type: 'teleport',
        targetMapId: 'cave',
        targetTileX: 0,
        targetTileY: 0,
      })
      expect(defaultAction('give-item', 'c', '')).toStrictEqual({ id: 'c', type: 'give-item', itemId: '', qty: 1 })
      expect(defaultAction('set-flag', 'd', '')).toStrictEqual({ id: 'd', type: 'set-flag', flag: '', value: true })
      expect(defaultAction('play-sfx', 'e', '')).toStrictEqual({ id: 'e', type: 'play-sfx', sound: '' })
      expect(defaultAction('wait', 'f', '')).toStrictEqual({ id: 'f', type: 'wait', ms: 500 })
    })

    await it('parses set-flag values as boolean → number → string', async () => {
      expect(parseFlagValue('true')).toBe(true)
      expect(parseFlagValue('false')).toBe(false)
      expect(parseFlagValue('42')).toBe(42)
      expect(parseFlagValue('3.5')).toBe(3.5)
      expect(parseFlagValue('opened')).toBe('opened')
      expect(parseFlagValue('')).toBe('') // empty stays a string, not 0
    })

    await it('generates a unique <type>-<n> id avoiding taken ones', async () => {
      expect(makeActionId('show-text', new Set())).toBe('show-text-1')
      expect(makeActionId('show-text', new Set(['show-text-1']))).toBe('show-text-2')
      expect(makeActionId('teleport', new Set(['teleport-1', 'teleport-2']))).toBe('teleport-3')
    })

    await it('summarises each action type for the row title', async () => {
      const mapLabel = (id: string) => (id === 'cave' ? 'Cave' : id || '(None)')
      expect(actionSummary({ id: '1', type: 'give-item', itemId: 'potion', qty: 2 }, mapLabel)).toBe('Give 2× potion')
      expect(
        actionSummary({ id: '2', type: 'teleport', targetMapId: 'cave', targetTileX: 4, targetTileY: 9 }, mapLabel),
      ).toBe('Teleport → Cave (4, 9)')
      expect(actionSummary({ id: '3', type: 'show-text', text: 'hi', speaker: 'Sign' }, mapLabel)).toBe('Sign: hi')
      expect(actionSummary({ id: '4', type: 'set-flag', flag: 'x', value: true }, mapLabel)).toBe('Set flag x = true')
      expect(actionSummary({ id: '5', type: 'play-sfx', sound: 'chime' }, mapLabel)).toBe('Play sound: chime')
      expect(actionSummary({ id: '6', type: 'wait', ms: 500 }, mapLabel)).toBe('Wait 500 ms')
    })
  })
}

import { describe, expect, it } from '@gjsify/unit'

import type { ActionData } from '@pixelrpg/engine'
import {
  type AskAction,
  actionSummary,
  addAnswer,
  canAddAnswer,
  canRemoveAnswer,
  collectActionIds,
  defaultAction,
  ENGLISH_SUMMARY,
  flagValueForKind,
  makeActionId,
  makeOptionId,
  moveAnswer,
  moveItemTo,
  pickableActionTypes,
  removeAnswer,
  setAnswerActions,
  setAnswerLabel,
  setCancelOption,
  valueEditorKind,
} from './event-action-model.ts'

const ask = (): AskAction => defaultAction('ask', 'ask-1', '') as AskAction

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

    await it('keeps a flag value that fits the kind and replaces one that does not', async () => {
      expect(flagValueForKind(false, 'yes-no')).toBe(false)
      expect(flagValueForKind(3, 'number')).toBe(3)
      expect(flagValueForKind('a', 'text')).toBe('a')
      expect(flagValueForKind('a', 'yes-no')).toBe(true) // a switch starts as "set to yes"
      expect(flagValueForKind(true, 'number')).toBe(0)
      expect(flagValueForKind(7, 'text')).toBe('')
    })

    await it('follows the flag kind for the value editor, else the stored value', async () => {
      expect(valueEditorKind('number', true)).toBe('number')
      expect(valueEditorKind(undefined, 4)).toBe('number')
      expect(valueEditorKind(undefined, 'x')).toBe('text')
      expect(valueEditorKind(undefined, true)).toBe('yes-no')
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
      expect(actionSummary({ id: '4', type: 'set-flag', flag: 'x', value: true }, mapLabel)).toBe('Set “x” to yes')
      expect(actionSummary({ id: '4', type: 'set-flag', flag: 'x', value: false }, mapLabel, () => 'Met Mido')).toBe(
        'Set “Met Mido” to no',
      )
      expect(actionSummary({ id: '4', type: 'set-flag', flag: 'x', value: 3 }, mapLabel)).toBe('Set “x” to 3')
      expect(actionSummary({ id: '4', type: 'set-flag', flag: 'x', value: 'open' }, mapLabel)).toBe('Set “x” to open')
      expect(actionSummary({ id: '4', type: 'set-flag', flag: '', value: true }, mapLabel)).toBe('Set “…” to yes')
      expect(
        actionSummary({ id: '4', type: 'wait', ms: 5 }, mapLabel, undefined, {
          ...ENGLISH_SUMMARY,
          wait: (ms) => `Warte ${ms}`,
        }),
      ).toBe('Warte 5') // the text comes from the caller
      expect(actionSummary({ id: '5', type: 'play-sfx', sound: 'chime' }, mapLabel)).toBe('Play sound: chime')
      expect(actionSummary({ id: '6', type: 'wait', ms: 500 }, mapLabel)).toBe('Wait 500 ms')
    })

    await it('starts an ask with two stable, distinct answers', async () => {
      const a = ask()
      expect(a.options.map((o) => o.id)).toStrictEqual(['ask-1-opt-1', 'ask-1-opt-2'])
      expect(canAddAnswer(a)).toBe(true)
      expect(canRemoveAnswer(a)).toBe(false)
    })

    await it('adds answers up to four and then stops', async () => {
      let a = ask()
      a = addAnswer(addAnswer(a))
      expect(a.options.length).toBe(4)
      expect(new Set(a.options.map((o) => o.id)).size).toBe(4)
      expect(canAddAnswer(a)).toBe(false)
      expect(addAnswer(a)).toBe(a)
    })

    await it('does not reuse the id of a removed answer right away', async () => {
      let a = addAnswer(ask())
      a = removeAnswer(a, 0)
      expect(a.options.map((o) => o.id)).toStrictEqual(['ask-1-opt-2', 'ask-1-opt-3'])
      expect(makeOptionId(a)).toBe('ask-1-opt-4')
    })

    await it('removes answers down to two and drops a cancel choice that pointed at the removed one', async () => {
      let a = setCancelOption(addAnswer(ask()), 'ask-1-opt-3')
      expect(a.cancelOptionId).toBe('ask-1-opt-3')
      const kept = removeAnswer(a, 0)
      expect(kept.cancelOptionId).toBe('ask-1-opt-3')
      a = removeAnswer(a, 2)
      expect('cancelOptionId' in a).toBe(false)
      expect(removeAnswer(a, 0)).toBe(a)
    })

    await it('sets and clears the cancel choice, refusing an unknown id', async () => {
      const a = ask()
      expect(setCancelOption(a, 'ask-1-opt-2').cancelOptionId).toBe('ask-1-opt-2')
      expect('cancelOptionId' in setCancelOption(setCancelOption(a, 'ask-1-opt-2'), undefined)).toBe(false)
      expect('cancelOptionId' in setCancelOption(a, 'nope')).toBe(false)
    })

    await it('reorders answers and actions by index', async () => {
      expect(moveItemTo(['a', 'b', 'c'], 0, 2)).toStrictEqual(['b', 'c', 'a'])
      expect(moveItemTo(['a', 'b', 'c'], 2, 0)).toStrictEqual(['c', 'a', 'b'])
      expect(moveItemTo(['a', 'b', 'c'], 1, 9)).toStrictEqual(['a', 'c', 'b'])
      expect(moveItemTo(['a', 'b'], 5, 0)).toStrictEqual(['a', 'b'])
      const a = moveAnswer(ask(), 0, 1)
      expect(a.options.map((o) => o.id)).toStrictEqual(['ask-1-opt-2', 'ask-1-opt-1'])
    })

    await it('edits an answer label and its nested list without touching the others', async () => {
      const inner: ActionData = { id: 'wait-1', type: 'wait', ms: 10 }
      const a = setAnswerActions(setAnswerLabel(ask(), 1, 'Yes'), 1, [inner])
      expect(a.options[0]).toStrictEqual({ id: 'ask-1-opt-1', label: '', actions: [] })
      expect(a.options[1]).toStrictEqual({ id: 'ask-1-opt-2', label: 'Yes', actions: [inner] })
    })

    await it('collects ids through nested answer lists and keeps asks out of the nested picker', async () => {
      const a = setAnswerActions(ask(), 0, [{ id: 'wait-9', type: 'wait', ms: 1 }])
      const ids = collectActionIds([{ id: 'show-text-1', type: 'show-text', text: 'x' }, a])
      expect([...ids].sort()).toStrictEqual(['ask-1', 'show-text-1', 'wait-9'])
      expect(makeActionId('wait', ids)).toBe('wait-1')
      expect(pickableActionTypes(false).includes('ask')).toBe(true)
      expect(pickableActionTypes(true).includes('ask')).toBe(false)
      expect(pickableActionTypes(true).length).toBe(pickableActionTypes(false).length - 1)
    })
  })
}

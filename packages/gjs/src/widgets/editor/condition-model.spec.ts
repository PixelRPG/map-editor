import { describe, expect, it } from '@gjsify/unit'

import type { Condition } from '@pixelrpg/engine'
import {
  addLeaf,
  changeConditionKind,
  type ConditionFlag,
  conditionKindOf,
  conditionSummary,
  defaultLeaf,
  leafForFlag,
  leafKindForFlag,
  leavesOf,
  removeLeaf,
  replaceLeaf,
  usesItems,
  whenSentence,
} from './condition-model.ts'

const FLAGS: ConditionFlag[] = [
  { value: 'coins', label: 'Coins', kind: 'number' },
  { value: 'key', label: 'Has Key', kind: 'yes-no' },
  { value: 'mood', label: 'Mood', kind: 'text' },
]

export default async () => {
  await describe('condition-model', async () => {
    await it('reads the shorthand as a flag-is row and rejects non-conditions', async () => {
      expect(conditionKindOf({ flag: 'key' })).toBe('flag-is')
      expect(conditionKindOf({ type: 'counter', flag: 'coins', op: '≥', value: 3 })).toBe('counter')
      expect(conditionKindOf({ type: 'not', of: { flag: 'key' } })).toBe('not')
      expect(conditionKindOf({ type: 'any', of: [{ type: 'all', of: [] }] })).toBe(null)
      expect(conditionKindOf('nope')).toBe(null)
    })

    await it('picks the leaf shape by the flag kind', async () => {
      expect(leafKindForFlag('number')).toBe('counter')
      expect(leafKindForFlag('yes-no')).toBe('flag-is')
      expect(leafKindForFlag('text')).toBe('flag-is')
      expect(leafKindForFlag(undefined)).toBe('flag-is')
    })

    await it('reshapes a leaf when its flag changes kind', async () => {
      const counter = defaultLeaf('counter', 'coins')
      expect(leafForFlag(counter, 'key', 'yes-no')).toStrictEqual({ type: 'flag-is', flag: 'key', equals: true })
      expect(leafForFlag(counter, 'mood', 'text')).toStrictEqual({ type: 'flag-is', flag: 'mood', equals: '' })
      const key = { type: 'flag-is', flag: 'key', equals: false } as const
      expect(leafForFlag(key, 'coins', 'number')).toStrictEqual({ type: 'counter', flag: 'coins', op: '≥', value: 1 })
      expect(leafForFlag(key, 'other', 'yes-no')).toStrictEqual({ type: 'flag-is', flag: 'other', equals: false })
      const kept = { type: 'counter', flag: 'coins', op: '<', value: 7 } as const
      expect(leafForFlag(kept, 'gems', 'number')).toStrictEqual({ type: 'counter', flag: 'gems', op: '<', value: 7 })
    })

    await it('changes the top shape and keeps what it can', async () => {
      const leaf = { type: 'counter', flag: 'coins', op: '>', value: 2 } as const
      expect(changeConditionKind(leaf, 'all', FLAGS)).toStrictEqual({ type: 'all', of: [leaf] })
      expect(changeConditionKind({ type: 'all', of: [leaf, { flag: 'key' }] }, 'not', FLAGS)).toStrictEqual({
        type: 'not',
        of: leaf,
      })
      expect(changeConditionKind({ type: 'any', of: [{ flag: 'key' }, leaf] }, 'all', FLAGS)).toStrictEqual({
        type: 'all',
        of: [{ flag: 'key' }, leaf],
      })
      expect(changeConditionKind({ type: 'any', of: [leaf] }, 'counter', FLAGS)).toStrictEqual(leaf)
      expect(changeConditionKind(undefined, 'flag-is', FLAGS)).toStrictEqual({
        type: 'flag-is',
        flag: 'coins',
        equals: true,
      })
      expect(changeConditionKind(leaf, 'has-item', FLAGS)).toStrictEqual({ type: 'has-item', itemId: '' })
    })

    await it('edits a group one level deep and never empties it', async () => {
      const group: Condition = { type: 'all', of: [{ flag: 'key' }] }
      const added = addLeaf(group, defaultLeaf('counter', 'coins'))
      expect(added).toStrictEqual({ type: 'all', of: [{ flag: 'key' }, defaultLeaf('counter', 'coins')] })
      expect(removeLeaf(added, 0)).toStrictEqual({ type: 'all', of: [defaultLeaf('counter', 'coins')] })
      expect(removeLeaf(group, 0)).toStrictEqual(group)
      expect(replaceLeaf(added, 1, { flag: 'mood', equals: 'x' })).toStrictEqual({
        type: 'all',
        of: [{ flag: 'key' }, { flag: 'mood', equals: 'x' }],
      })
      expect(replaceLeaf({ type: 'not', of: { flag: 'key' } }, 0, { flag: 'mood' })).toStrictEqual({
        type: 'not',
        of: { flag: 'mood' },
      })
      expect(addLeaf({ type: 'not', of: { flag: 'key' } }, { flag: 'mood' })).toStrictEqual({
        type: 'not',
        of: { flag: 'key' },
      })
    })

    await it('says the condition the way a child would', async () => {
      expect(conditionSummary({ type: 'counter', flag: 'coins', op: '≥', value: 3 }, FLAGS)).toBe('Coins ≥ 3')
      expect(conditionSummary({ type: 'flag-is', flag: 'key' }, FLAGS)).toBe('Has Key is Yes')
      expect(conditionSummary({ flag: 'key', equals: false }, FLAGS)).toBe('Has Key is No')
      expect(conditionSummary({ flag: 'mood', equals: 'happy' }, FLAGS)).toBe('Mood is “happy”')
      expect(
        conditionSummary(
          { type: 'all', of: [{ flag: 'key' }, { type: 'counter', flag: 'coins', op: '≠', value: 0 }] },
          FLAGS,
        ),
      ).toBe('Has Key is Yes and Coins ≠ 0')
      expect(conditionSummary({ type: 'any', of: [{ flag: 'key' }, { flag: 'mood', equals: 'a' }] }, FLAGS)).toBe(
        'Has Key is Yes or Mood is “a”',
      )
      expect(conditionSummary({ type: 'not', of: { flag: 'key' } }, FLAGS)).toBe('Not: Has Key is Yes')
      expect(conditionSummary({ flag: 'gone' }, FLAGS)).toBe('… is Yes')
      expect(conditionSummary({ type: 'has-item', itemId: 'sword' }, FLAGS)).toBe('Has item sword')
    })

    await it('says a state card\'s condition as one whole "When" sentence', async () => {
      expect(whenSentence({ type: 'counter', flag: 'coins', op: '≥', value: 3 }, FLAGS)).toBe('When Coins ≥ 3')
      expect(whenSentence({ flag: 'key' }, FLAGS)).toBe('When Has Key is Yes')
      expect(whenSentence({ flag: 'key', equals: false }, FLAGS)).toBe('When Has Key is No')
      expect(whenSentence({ flag: 'mood', equals: 'happy' }, FLAGS)).toBe('When Mood is “happy”')
      expect(
        whenSentence(
          { type: 'all', of: [{ flag: 'key' }, { type: 'counter', flag: 'coins', op: '≠', value: 0 }] },
          FLAGS,
        ),
      ).toBe('When all of: Has Key is Yes; Coins ≠ 0')
      expect(whenSentence({ type: 'any', of: [{ flag: 'key' }, { flag: 'mood', equals: 'a' }] }, FLAGS)).toBe(
        'When any of: Has Key is Yes; Mood is “a”',
      )
      expect(whenSentence({ type: 'not', of: { flag: 'key' } }, FLAGS)).toBe('When not: Has Key is Yes')
      expect(whenSentence({ type: 'has-item', itemId: 'sword' }, FLAGS)).toBe('When the player has item sword')
      expect(whenSentence(undefined, FLAGS)).toBe('Only when switched on by an action')
    })

    await it('flags items so the editor can warn', async () => {
      expect(usesItems({ type: 'has-item', itemId: 'a' })).toBe(true)
      expect(usesItems({ type: 'any', of: [{ flag: 'key' }, { type: 'has-item', itemId: 'a' }] })).toBe(true)
      expect(usesItems({ flag: 'key' })).toBe(false)
    })

    await it('treats a leaf with no flag picked yet as a leaf, not a group', async () => {
      const blank = defaultLeaf('flag-is')
      expect(leavesOf(blank)).toStrictEqual([blank])
      expect(conditionSummary(blank, FLAGS)).toBe('… is Yes')
      const counter = defaultLeaf('counter')
      expect(leavesOf(counter)).toStrictEqual([counter])
      expect(typeof conditionSummary({ type: 'all', of: [blank, counter] }, FLAGS)).toBe('string')
    })
  })
}

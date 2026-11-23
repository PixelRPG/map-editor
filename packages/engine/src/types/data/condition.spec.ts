import { describe, expect, it } from '@gjsify/unit'
import { COUNTER_OPERATORS, type CounterOperator, evaluateCondition, isCondition } from './Condition.ts'

const flags = { key: true, coins: 3, name: 'Ada', off: false }
const state = { flags }

const COMPARE: { op: CounterOperator; value: number; actual: number; holds: boolean }[] = []
for (const [op, rows] of Object.entries({
  '=': [
    [3, 3, true],
    [2, 3, false],
  ],
  '≠': [
    [2, 3, true],
    [3, 3, false],
  ],
  '<': [
    [2, 3, true],
    [3, 3, false],
  ],
  '≤': [
    [3, 3, true],
    [4, 3, false],
  ],
  '>': [
    [4, 3, true],
    [3, 3, false],
  ],
  '≥': [
    [3, 3, true],
    [2, 3, false],
  ],
}) as [CounterOperator, [number, number, boolean][]][]) {
  for (const [actual, value, holds] of rows) COMPARE.push({ op, actual, value, holds })
}

export default async () => {
  await describe('evaluateCondition', async () => {
    await it('knows every operator', async () => {
      expect(new Set(COMPARE.map((c) => c.op)).size).toBe(COUNTER_OPERATORS.length)
    })

    for (const row of COMPARE) {
      await it(`counter ${row.actual} ${row.op} ${row.value} is ${row.holds}`, async () => {
        const cond = { type: 'counter', flag: 'n', op: row.op, value: row.value }
        expect(evaluateCondition(cond, { flags: { n: row.actual } })).toBe(row.holds)
      })
    }

    await it('reads the shorthand as flag-is, equals defaulting to true', async () => {
      expect(evaluateCondition({ flag: 'key' }, state)).toBe(true)
      expect(evaluateCondition({ flag: 'off' }, state)).toBe(false)
      expect(evaluateCondition({ flag: 'name', equals: 'Ada' }, state)).toBe(true)
      expect(evaluateCondition({ flag: 'coins', equals: 3 }, state)).toBe(true)
    })

    await it('flag-is behaves like the shorthand', async () => {
      expect(evaluateCondition({ type: 'flag-is', flag: 'key' }, state)).toBe(true)
      expect(evaluateCondition({ type: 'flag-is', flag: 'key', equals: false }, state)).toBe(false)
      expect(evaluateCondition({ type: 'flag-is', flag: 'off', equals: false }, state)).toBe(true)
    })

    await it('is false for a missing flag and never throws', async () => {
      expect(evaluateCondition({ type: 'flag-is', flag: 'nope' }, state)).toBe(false)
      expect(evaluateCondition({ type: 'counter', flag: 'nope', op: '≥', value: 0 }, state)).toBe(false)
      expect(evaluateCondition({ type: 'counter', flag: 'nope', op: '<', value: 5 }, state)).toBe(false)
    })

    await it('is false when the flag kind does not match', async () => {
      expect(evaluateCondition({ type: 'counter', flag: 'name', op: '≥', value: 0 }, state)).toBe(false)
      expect(evaluateCondition({ type: 'counter', flag: 'key', op: '=', value: 1 }, state)).toBe(false)
      expect(evaluateCondition({ type: 'flag-is', flag: 'coins', equals: true }, state)).toBe(false)
    })

    await it('has-item holds nothing until items exist', async () => {
      expect(evaluateCondition({ type: 'has-item', itemId: 'sword' }, state)).toBe(false)
    })

    await it('combines leaves with all / any / not', async () => {
      const yes = { type: 'flag-is', flag: 'key' }
      const no = { type: 'flag-is', flag: 'off' }
      expect(evaluateCondition({ type: 'all', of: [yes, yes] }, state)).toBe(true)
      expect(evaluateCondition({ type: 'all', of: [yes, no] }, state)).toBe(false)
      expect(evaluateCondition({ type: 'any', of: [no, yes] }, state)).toBe(true)
      expect(evaluateCondition({ type: 'any', of: [no, no] }, state)).toBe(false)
      expect(evaluateCondition({ type: 'not', of: no }, state)).toBe(true)
      expect(evaluateCondition({ type: 'not', of: yes }, state)).toBe(false)
    })

    await it('allows one nesting level only', async () => {
      const leaf = { type: 'flag-is', flag: 'key' }
      expect(isCondition({ type: 'all', of: [leaf] })).toBe(true)
      expect(isCondition({ type: 'all', of: [{ type: 'any', of: [leaf] }] })).toBe(false)
      expect(isCondition({ type: 'not', of: { type: 'not', of: leaf } })).toBe(false)
      expect(evaluateCondition({ type: 'not', of: { type: 'not', of: leaf } }, state)).toBe(false)
    })

    await it('never matches a shape it does not know, even under not', async () => {
      expect(evaluateCondition({ type: 'moon-phase' }, state)).toBe(false)
      expect(evaluateCondition({ flag: 'key', extra: 1 }, state)).toBe(false)
      expect(evaluateCondition({ type: 'not', of: { type: 'moon-phase' } }, state)).toBe(false)
      expect(evaluateCondition(undefined, state)).toBe(false)
      expect(evaluateCondition(null, state)).toBe(false)
      expect(evaluateCondition('key', state)).toBe(false)
    })

    await it('rejects a counter with a bad operator or a non-finite value', async () => {
      expect(isCondition({ type: 'counter', flag: 'n', op: '~', value: 1 })).toBe(false)
      expect(isCondition({ type: 'counter', flag: 'n', op: '=', value: Number.NaN })).toBe(false)
    })
  })
}

import { type FlagValue, isFlagValue } from './EntityDefinition.ts'

/**
 * What a state asks of the game before it switches on: a typed union,
 * not an expression language. Leaves compare one thing; `all` / `any` /
 * `not` combine leaves, one level deep (a group holds leaves, never
 * another group), which keeps the editor a list of rows and the data
 * easy to validate.
 */

/** The six ways a counter can be compared. */
export const COUNTER_OPERATORS = ['=', '≠', '<', '≤', '>', '≥'] as const
export type CounterOperator = (typeof COUNTER_OPERATORS)[number]

/**
 * The first condition shape ever stored: one flag against one value,
 * `equals` defaulting to `true`. Projects hold it as is; it reads as a
 * `flag-is` leaf, so nothing about the author's data is rewritten.
 */
export interface StateCondition {
  /** Flag id in `GameSaveStateComponent.flags`. */
  flag: string
  /** Value the flag must hold. Absent = `true`. */
  equals?: FlagValue
}

/** A yes/no or text flag holds exactly this value (`equals` absent = `true`). */
export interface FlagIsCondition {
  type: 'flag-is'
  flag: string
  equals?: FlagValue
}

/** A number flag compares to a number. */
export interface CounterCondition {
  type: 'counter'
  flag: string
  op: CounterOperator
  value: number
}

/**
 * The hero carries an item. Stored and editable, but items have no runtime
 * yet, so it never holds.
 */
export interface HasItemCondition {
  type: 'has-item'
  itemId: string
}

/** One comparison: a typed leaf, or the original flag shorthand. */
export type ConditionLeaf = FlagIsCondition | CounterCondition | HasItemCondition | StateCondition

/** Several leaves combined. `not` negates exactly one. */
export type ConditionGroup =
  | { type: 'all'; of: ConditionLeaf[] }
  | { type: 'any'; of: ConditionLeaf[] }
  | { type: 'not'; of: ConditionLeaf }

export type Condition = ConditionLeaf | ConditionGroup

/** What a condition reads. Items join here once the game has them. */
export interface ConditionState {
  flags: Readonly<Record<string, FlagValue>>
}

function hasOnlyKeys(v: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(v).every((k) => keys.includes(k))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function isFlagId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** The original `{ flag, equals }` shorthand. */
export function isStateCondition(value: unknown): value is StateCondition {
  if (!isRecord(value)) return false
  if (!isFlagId(value.flag)) return false
  if (value.equals !== undefined && !isFlagValue(value.equals)) return false
  // An unknown sibling key means a richer vocabulary this build does not
  // know; matching on half a condition would be worse than not matching.
  return hasOnlyKeys(value, ['flag', 'equals'])
}

export function isConditionLeaf(value: unknown): value is ConditionLeaf {
  if (!isRecord(value)) return false
  switch (value.type) {
    case undefined:
      return isStateCondition(value)
    case 'flag-is':
      return (
        isFlagId(value.flag) &&
        (value.equals === undefined || isFlagValue(value.equals)) &&
        hasOnlyKeys(value, ['type', 'flag', 'equals'])
      )
    case 'counter':
      return (
        isFlagId(value.flag) &&
        typeof value.op === 'string' &&
        (COUNTER_OPERATORS as readonly string[]).includes(value.op) &&
        typeof value.value === 'number' &&
        Number.isFinite(value.value) &&
        hasOnlyKeys(value, ['type', 'flag', 'op', 'value'])
      )
    case 'has-item':
      return isFlagId(value.itemId) && hasOnlyKeys(value, ['type', 'itemId'])
    default:
      return false
  }
}

/** Type guard for every supported condition shape; anything else is "not understood". */
export function isCondition(value: unknown): value is Condition {
  if (!isRecord(value)) return false
  if (value.type === 'all' || value.type === 'any') {
    return Array.isArray(value.of) && value.of.every(isConditionLeaf) && hasOnlyKeys(value, ['type', 'of'])
  }
  if (value.type === 'not') return isConditionLeaf(value.of) && hasOnlyKeys(value, ['type', 'of'])
  return isConditionLeaf(value)
}

function compare(actual: number, op: CounterOperator, expected: number): boolean {
  switch (op) {
    case '=':
      return actual === expected
    case '≠':
      return actual !== expected
    case '<':
      return actual < expected
    case '≤':
      return actual <= expected
    case '>':
      return actual > expected
    case '≥':
      return actual >= expected
  }
}

function leafHolds(leaf: ConditionLeaf, state: ConditionState): boolean {
  const l = leaf as unknown as Record<string, unknown>
  switch (l.type) {
    case 'has-item':
      return false
    case 'counter': {
      const actual = state.flags[(leaf as CounterCondition).flag]
      if (typeof actual !== 'number') return false
      return compare(actual, (leaf as CounterCondition).op, (leaf as CounterCondition).value)
    }
    default: {
      const { flag, equals } = leaf as StateCondition
      return state.flags[flag] === (equals ?? true)
    }
  }
}

/**
 * Does `condition` hold? Pure and total: a flag nobody has set, a number
 * compared with a word, and a shape this build does not know all answer
 * `false`. An unknown shape is `false` even under `not`, so a state written
 * by a newer editor stays off rather than flipping on.
 */
export function evaluateCondition(condition: unknown, state: ConditionState): boolean {
  if (!isCondition(condition)) return false
  const c = condition as Record<string, unknown>
  switch (c.type) {
    case 'all':
      return (c.of as ConditionLeaf[]).every((leaf) => leafHolds(leaf, state))
    case 'any':
      return (c.of as ConditionLeaf[]).some((leaf) => leafHolds(leaf, state))
    case 'not':
      return !leafHolds(c.of as ConditionLeaf, state)
    default:
      return leafHolds(condition as ConditionLeaf, state)
  }
}

/** Every flag id a condition reads, in order, with the leaf that names it. */
export function conditionLeaves(condition: Condition): ConditionLeaf[] {
  const c = condition as unknown as Record<string, unknown>
  if (c.type === 'all' || c.type === 'any') return [...(c.of as ConditionLeaf[])]
  if (c.type === 'not') return [c.of as ConditionLeaf]
  return [condition as ConditionLeaf]
}

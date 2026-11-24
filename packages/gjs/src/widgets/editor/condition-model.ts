import {
  type Condition,
  type ConditionLeaf,
  type CounterOperator,
  type FlagKind,
  type FlagValue,
  isCondition,
  isConditionLeaf,
} from '@pixelrpg/engine'

/**
 * GTK-free logic of the condition editor: which shape a row is, how a
 * flag's kind picks the shape, the one-level group edits and the
 * child-readable summary. Like the action model it holds no gettext — the
 * sentences come in as a {@link ConditionText} from the widget side
 * (`condition-summary.ts`); {@link ENGLISH_CONDITION_TEXT} is what specs
 * and a caller without translations get.
 */

/** What the top row of a condition editor can be. */
export type ConditionKind = 'flag-is' | 'counter' | 'has-item' | 'all' | 'any' | 'not'

export const CONDITION_KINDS: readonly ConditionKind[] = ['flag-is', 'counter', 'has-item', 'all', 'any', 'not']

/** The kinds a group's rows can be; a group never holds a group. */
export const LEAF_KINDS: readonly ConditionKind[] = ['flag-is', 'counter', 'has-item']

type LeafKind = 'flag-is' | 'counter' | 'has-item'

/** The sentences a condition summary is made of; the widget side translates each. */
export interface ConditionText {
  /** A flag that is switched on or off: "Has Key is Yes". */
  flagIsYesNo(flag: string, on: boolean): string
  /** A flag that holds a word: "Mood is “happy”". */
  flagIsText(flag: string, value: string): string
  /** A number flag against a number: "Coins ≥ 3". */
  counter(flag: string, op: CounterOperator, value: number): string
  hasItem(item: string): string
  all(parts: string[]): string
  any(parts: string[]): string
  not(part: string): string
  /** What stands in for a flag or item nobody picked yet. */
  noFlag: string
  /**
   * The same leaves as one WHOLE "When …" sentence each, for a state card:
   * a translation reorders the words, so none of these is built by
   * gluing {@link ConditionText.flagIsYesNo} and friends to a "When".
   */
  when: WhenText
}

/** The "When …" sentences of a state card. */
export interface WhenText {
  flagIsYesNo(flag: string, on: boolean): string
  flagIsText(flag: string, value: string): string
  counter(flag: string, op: CounterOperator, value: number): string
  hasItem(item: string): string
  /** `parts` are the leaf sentences without a leading "When", joined by the caller. */
  all(parts: string): string
  any(parts: string): string
  not(part: string): string
  /** A state without a condition: switched on by hand only. */
  manual: string
}

export const ENGLISH_CONDITION_TEXT: ConditionText = {
  flagIsYesNo: (flag, on) => `${flag} is ${on ? 'Yes' : 'No'}`,
  flagIsText: (flag, value) => `${flag} is “${value}”`,
  counter: (flag, op, value) => `${flag} ${op} ${value}`,
  hasItem: (item) => `Has item ${item}`,
  all: (parts) => parts.join(' and '),
  any: (parts) => parts.join(' or '),
  not: (part) => `Not: ${part}`,
  noFlag: '…',
  when: {
    flagIsYesNo: (flag, on) => `When ${flag} is ${on ? 'Yes' : 'No'}`,
    flagIsText: (flag, value) => `When ${flag} is “${value}”`,
    counter: (flag, op, value) => `When ${flag} ${op} ${value}`,
    hasItem: (item) => `When the player has item ${item}`,
    all: (parts) => `When all of: ${parts}`,
    any: (parts) => `When any of: ${parts}`,
    not: (part) => `When not: ${part}`,
    manual: 'Only when switched on by an action',
  },
}

/** A flag as the picker knows it. */
export interface ConditionFlag {
  value: string
  label: string
  kind?: FlagKind
}

/** The shape one leaf has; the `{ flag, equals }` shorthand reads as `flag-is`. */
export function leafKindOf(leaf: ConditionLeaf): LeafKind {
  return 'type' in leaf ? leaf.type : 'flag-is'
}

/** The shape the editor shows for a stored condition; `null` for data that is no condition. */
export function conditionKindOf(condition: unknown): ConditionKind | null {
  if (!isCondition(condition)) return null
  if (isConditionLeaf(condition)) return leafKindOf(condition)
  return condition.type
}

/** The leaf shape a flag of this kind is compared with; a flag nobody picked reads as yes/no. */
export function leafKindForFlag(kind: FlagKind | undefined): 'flag-is' | 'counter' {
  return kind === 'number' ? 'counter' : 'flag-is'
}

function defaultEquals(kind: FlagKind | undefined): FlagValue {
  return kind === 'text' ? '' : true
}

/** A fresh leaf of `kind`, already fitting `flag` where it has one. */
export function defaultLeaf(kind: LeafKind, flag = '', flagKind?: FlagKind): ConditionLeaf {
  switch (kind) {
    case 'counter':
      return { type: 'counter', flag, op: '≥', value: 1 }
    case 'has-item':
      return { type: 'has-item', itemId: '' }
    default:
      return { type: 'flag-is', flag, equals: defaultEquals(flagKind) }
  }
}

/**
 * The leaf after its flag changed: a number flag becomes a counter, any
 * other a flag-is, and a value that cannot fit the new kind is reset.
 * Keeps the operator and number when the leaf stays a counter.
 */
export function leafForFlag(leaf: ConditionLeaf, flag: string, flagKind: FlagKind | undefined): ConditionLeaf {
  if (leafKindOf(leaf) === 'has-item') return leaf
  if (leafKindForFlag(flagKind) === 'counter') {
    return 'type' in leaf && leaf.type === 'counter' ? { ...leaf, flag } : defaultLeaf('counter', flag)
  }
  const equals = 'equals' in leaf ? leaf.equals : undefined
  const fits = flagKind === 'text' ? typeof equals === 'string' : typeof equals === 'boolean'
  return { type: 'flag-is', flag, equals: fits && equals !== undefined ? equals : defaultEquals(flagKind) }
}

/**
 * Whether the editor shows this as a group. Decided by `type` alone: a leaf
 * still being filled in (no flag picked yet) is not a valid condition for the
 * engine, but it is a leaf here, never a group.
 */
function isGroup(condition: Condition): condition is Exclude<Condition, ConditionLeaf> {
  return 'type' in condition && (condition.type === 'all' || condition.type === 'any' || condition.type === 'not')
}

/** The leaves a condition holds, in order (a leaf is its own single leaf). */
export function leavesOf(condition: Condition): ConditionLeaf[] {
  if (!isGroup(condition)) return [condition]
  return Array.isArray(condition.of) ? [...condition.of] : [condition.of]
}

function pickFlag(flags: readonly ConditionFlag[]): string {
  return flags[0]?.value ?? ''
}

/**
 * The condition after the top row changed shape. A leaf wrapped in a group
 * keeps its leaf; a group turned into a leaf keeps its first one; `all` ↔
 * `any` keeps every leaf; `not` keeps the first.
 */
export function changeConditionKind(
  condition: Condition | undefined,
  kind: ConditionKind,
  flags: readonly ConditionFlag[] = [],
): Condition {
  const leaves = condition ? leavesOf(condition) : []
  const first = leaves[0]
  const fresh = () => {
    const flag = pickFlag(flags)
    return defaultLeaf('flag-is', flag, flags[0]?.kind)
  }
  switch (kind) {
    case 'all':
    case 'any':
      return { type: kind, of: leaves.length > 0 ? leaves : [fresh()] }
    case 'not':
      return { type: 'not', of: first ?? fresh() }
    default: {
      if (first && leafKindOf(first) === kind) return first
      if (kind === 'has-item') return defaultLeaf('has-item')
      const flag = first && 'flag' in first ? first.flag : pickFlag(flags)
      const flagKind = flags.find((f) => f.value === flag)?.kind
      return defaultLeaf(kind, flag, flagKind)
    }
  }
}

/** A group with the leaf at `index` swapped; a bare leaf or `not` is replaced outright. */
export function replaceLeaf(condition: Condition, index: number, leaf: ConditionLeaf): Condition {
  if (!isGroup(condition)) return leaf
  if (condition.type === 'not') return { type: 'not', of: leaf }
  const of = [...condition.of]
  of[index] = leaf
  return { type: condition.type, of }
}

/** A group with one more leaf; anything but `all` / `any` is returned as is. */
export function addLeaf(condition: Condition, leaf: ConditionLeaf): Condition {
  if (!isGroup(condition) || condition.type === 'not') return condition
  return { type: condition.type, of: [...condition.of, leaf] }
}

/** A group without the leaf at `index`; the last leaf stays (an empty group would never mean anything). */
export function removeLeaf(condition: Condition, index: number): Condition {
  if (!isGroup(condition) || condition.type === 'not') return condition
  if (condition.of.length <= 1) return condition
  return { type: condition.type, of: condition.of.filter((_, i) => i !== index) }
}

/** Whether the top row is a group that takes more than one leaf. */
export function takesManyLeaves(kind: ConditionKind): boolean {
  return kind === 'all' || kind === 'any'
}

/** Whether a condition mentions an item; items have no runtime yet, so the editor warns. */
export function usesItems(condition: Condition): boolean {
  return leavesOf(condition).some((l) => leafKindOf(l) === 'has-item')
}

/** One leaf as a sentence a child can read. */
export function leafSummary(
  leaf: ConditionLeaf,
  flags: readonly ConditionFlag[],
  text: ConditionText = ENGLISH_CONDITION_TEXT,
): string {
  if ('type' in leaf && leaf.type === 'has-item') return text.hasItem(leaf.itemId || text.noFlag)
  const id = (leaf as { flag: string }).flag
  const name = id ? (flags.find((f) => f.value === id)?.label ?? text.noFlag) : text.noFlag
  if ('type' in leaf && leaf.type === 'counter') return text.counter(name, leaf.op, leaf.value)
  const equals = (leaf as { equals?: FlagValue }).equals ?? true
  return typeof equals === 'string' ? text.flagIsText(name, equals) : text.flagIsYesNo(name, equals !== false)
}

/** The whole condition as one sentence; an absent condition is the caller's to word. */
export function conditionSummary(
  condition: Condition,
  flags: readonly ConditionFlag[],
  text: ConditionText = ENGLISH_CONDITION_TEXT,
): string {
  if (!isGroup(condition)) return leafSummary(condition, flags, text)
  if (condition.type === 'not') return text.not(leafSummary(condition.of, flags, text))
  const parts = condition.of.map((l) => leafSummary(l, flags, text))
  return condition.type === 'all' ? text.all(parts) : text.any(parts)
}

/**
 * The condition as a card's "When …" sentence. A single leaf reads as one
 * whole sentence; a group lists its leaves (each as its plain summary,
 * `; ` apart) inside one whole group sentence. Built from the same leaf
 * summary as {@link conditionSummary}, so the two never disagree.
 */
export function whenSentence(
  condition: Condition | undefined,
  flags: readonly ConditionFlag[],
  text: ConditionText = ENGLISH_CONDITION_TEXT,
): string {
  if (!condition) return text.when.manual
  const name = (id: string) => (id ? (flags.find((f) => f.value === id)?.label ?? text.noFlag) : text.noFlag)
  if (!isGroup(condition)) {
    if ('type' in condition && condition.type === 'has-item') return text.when.hasItem(condition.itemId || text.noFlag)
    if ('type' in condition && condition.type === 'counter')
      return text.when.counter(name(condition.flag), condition.op, condition.value)
    const leaf = condition as { flag: string; equals?: FlagValue }
    const equals = leaf.equals ?? true
    return typeof equals === 'string'
      ? text.when.flagIsText(name(leaf.flag), equals)
      : text.when.flagIsYesNo(name(leaf.flag), equals !== false)
  }
  if (condition.type === 'not') return text.when.not(leafSummary(condition.of, flags, text))
  const parts = condition.of.map((l) => leafSummary(l, flags, text)).join('; ')
  return condition.type === 'all' ? text.when.all(parts) : text.when.any(parts)
}

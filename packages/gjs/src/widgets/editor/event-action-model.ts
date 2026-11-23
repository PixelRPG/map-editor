import {
  ACTION_TYPES,
  ASK_MAX_OPTIONS,
  ASK_MIN_OPTIONS,
  type ActionData,
  type AskOption,
  DEFAULT_LANGUAGES,
  defaultFlagInitial,
  type FlagKind,
  flagKindOfValue,
  flagValueFitsKind,
  type LocalizedText,
  resolveText,
} from '@pixelrpg/engine'

/**
 * GTK-free logic for the {@link EventActionListEditor} — summaries,
 * defaults, value parsing + id generation. Kept separate from the widget
 * so it can be unit-tested without pulling `gi://Gtk` into the test
 * bundle (same split as `map-preview.geometry.ts`). It holds no gettext:
 * the sentences a row title is made of come in as a {@link SummaryText}
 * from the widget side (`event-action-summary.ts`, which owns the `_()`
 * calls); {@link ENGLISH_SUMMARY} is what specs and a caller without
 * translations get.
 */

/** The sentences of an action's row title; the widget side translates each. */
export interface SummaryText {
  showText(text: string): string
  teleport(map: string, x: number, y: number): string
  giveItem(qty: number, item: string): string
  /** A flag that is switched on or off. */
  setFlagYesNo(flag: string, on: boolean): string
  /** A flag that holds a number or a word. */
  setFlagValue(flag: string, value: string): string
  /** A number flag that goes up or down by an amount (`amount` is never 0 here). */
  changeCounter(flag: string, amount: number): string
  playSound(sound: string): string
  wait(ms: number): string
  ask(prompt: string, answers: number): string
}

export const ENGLISH_SUMMARY: SummaryText = {
  showText: (text) => `Show text: ${text}`,
  teleport: (map, x, y) => `Teleport → ${map} (${x}, ${y})`,
  giveItem: (qty, item) => `Give ${qty}× ${item}`,
  setFlagYesNo: (flag, on) => `Set “${flag}” to ${on ? 'yes' : 'no'}`,
  setFlagValue: (flag, value) => `Set “${flag}” to ${value}`,
  changeCounter: (flag, amount) => `Change “${flag}” by ${amount > 0 ? '+' : ''}${amount}`,
  playSound: (sound) => `Play sound: ${sound}`,
  wait: (ms) => `Wait ${ms} ms`,
  ask: (prompt, answers) => `Ask: ${prompt} (${answers})`,
}

/** Prefix icon per action type (Adwaita symbolic names). */
export const ACTION_ICONS: Record<ActionData['type'], string> = {
  'show-text': 'mail-unread-symbolic',
  teleport: 'go-jump-symbolic',
  'give-item': 'package-x-generic-symbolic',
  'set-flag': 'object-select-symbolic',
  'change-counter': 'list-add-symbolic',
  'play-sfx': 'audio-volume-high-symbolic',
  wait: 'alarm-symbolic',
  ask: 'dialog-question-symbolic',
}

/** Build a default action of `type` with the given (list-unique) `id`. */
export function defaultAction(type: ActionData['type'], id: string, firstMapId: string): ActionData {
  switch (type) {
    case 'show-text':
      return { id, type, text: '' }
    case 'teleport':
      return { id, type, targetMapId: firstMapId, targetTileX: 0, targetTileY: 0 }
    case 'give-item':
      return { id, type, itemId: '', qty: 1 }
    case 'set-flag':
      return { id, type, flag: '', value: true }
    case 'change-counter':
      return { id, type, flag: '', amount: 1 }
    case 'play-sfx':
      return { id, type, sound: '' }
    case 'wait':
      return { id, type, ms: 500 }
    case 'ask':
      return {
        id,
        type,
        prompt: '',
        options: [
          { id: `${id}-opt-1`, label: '', actions: [] },
          { id: `${id}-opt-2`, label: '', actions: [] },
        ],
      }
  }
}

/** The text an editor row shows: the project default language (language picker UI is T6). */
export function editableText(text: LocalizedText | undefined): string {
  return resolveText(text, DEFAULT_LANGUAGES.default, DEFAULT_LANGUAGES.default)
}

/** A short, human summary of an action for the collapsed row title. */
export function actionSummary(
  a: ActionData,
  mapLabel: (id: string) => string,
  flagLabel: (id: string) => string = (id) => id,
  text: SummaryText = ENGLISH_SUMMARY,
): string {
  switch (a.type) {
    case 'show-text': {
      const shown = editableText(a.text) || '…'
      const speaker = editableText(a.speaker)
      return speaker ? `${speaker}: ${shown}` : text.showText(shown)
    }
    case 'teleport':
      return text.teleport(mapLabel(a.targetMapId), a.targetTileX, a.targetTileY)
    case 'give-item':
      return text.giveItem(a.qty ?? 1, a.itemId || '…')
    case 'set-flag': {
      const flag = a.flag ? flagLabel(a.flag) : '…'
      return typeof a.value === 'boolean' ? text.setFlagYesNo(flag, a.value) : text.setFlagValue(flag, String(a.value))
    }
    case 'change-counter':
      return text.changeCounter(a.flag ? flagLabel(a.flag) : '…', a.amount)
    case 'play-sfx':
      return text.playSound(a.sound || '…')
    case 'wait':
      return text.wait(a.ms)
    case 'ask':
      return text.ask(editableText(a.prompt) || '…', a.options.length)
  }
}

/**
 * The value a `set-flag` should hold after its flag changed to `kind`: the
 * old value when it still fits, otherwise a sensible one ("yes" for a
 * switch, 0, an empty word) — never a leftover of the wrong type.
 */
export function flagValueForKind(value: unknown, kind: FlagKind): boolean | number | string {
  if (flagValueFitsKind(value, kind)) return value as boolean | number | string
  return kind === 'yes-no' ? true : defaultFlagInitial(kind)
}

/** The kind a `set-flag` value editor follows: the flag's own, else what the stored value looks like. */
export function valueEditorKind(flagKind: FlagKind | undefined, value: unknown): FlagKind {
  return flagKind ?? flagKindOfValue(value)
}

/** Generate a `<type>-<n>` id not already present in `taken`. */
export function makeActionId(type: ActionData['type'], taken: ReadonlySet<string>): string {
  let n = 1
  let id = `${type}-${n}`
  while (taken.has(id)) {
    n += 1
    id = `${type}-${n}`
  }
  return id
}

/** The `ask` variant of {@link ActionData}. */
export type AskAction = Extract<ActionData, { type: 'ask' }>

export function isAskAction(action: ActionData): action is AskAction {
  return action.type === 'ask'
}

/**
 * The types an "Add action" menu offers. An answer's own list is one level
 * deep: a question never sits inside another question's answer.
 */
export function pickableActionTypes(nested: boolean): ActionData['type'][] {
  return ACTION_TYPES.filter((type) => !(nested && type === 'ask'))
}

/** Every action id in a list, nested answer lists included — ids are unique per `actions` component. */
export function collectActionIds(list: readonly ActionData[], into: Set<string> = new Set()): Set<string> {
  for (const action of list) {
    into.add(action.id)
    if (isAskAction(action)) for (const option of action.options) collectActionIds(option.actions, into)
  }
  return into
}

/** A fresh answer id for `ask`: counts upward from the answer count, so a removed answer's id is not reused at once. */
export function makeOptionId(ask: AskAction): string {
  const taken = new Set(ask.options.map((o) => o.id))
  let n = ask.options.length + 1
  while (taken.has(`${ask.id}-opt-${n}`)) n += 1
  return `${ask.id}-opt-${n}`
}

/** `list` with the item at `from` moved to index `to` (clamped); a copy, never the input. */
export function moveItemTo<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from < 0 || from >= next.length) return next
  const target = Math.max(0, Math.min(next.length - 1, to))
  const [item] = next.splice(from, 1)
  next.splice(target, 0, item)
  return next
}

export function removeItem<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

export function canAddAnswer(ask: AskAction): boolean {
  return ask.options.length < ASK_MAX_OPTIONS
}

export function canRemoveAnswer(ask: AskAction): boolean {
  return ask.options.length > ASK_MIN_OPTIONS
}

/** `ask` with an empty answer appended; unchanged at the maximum. */
export function addAnswer(ask: AskAction): AskAction {
  if (!canAddAnswer(ask)) return ask
  return { ...ask, options: [...ask.options, { id: makeOptionId(ask), label: '', actions: [] }] }
}

/** `ask` without answer `index`; unchanged at the minimum. A cancel choice that pointed at it is dropped. */
export function removeAnswer(ask: AskAction, index: number): AskAction {
  const removed = ask.options[index]
  if (!removed || !canRemoveAnswer(ask)) return ask
  const options = removeItem(ask.options, index)
  if (ask.cancelOptionId !== removed.id) return { ...ask, options }
  const { cancelOptionId: _dropped, ...rest } = ask
  return { ...rest, options }
}

export function moveAnswer(ask: AskAction, from: number, to: number): AskAction {
  return { ...ask, options: moveItemTo(ask.options, from, to) }
}

/** The cancel choice: one of the answers, or none (`undefined` removes the key). */
export function setCancelOption(ask: AskAction, optionId: string | undefined): AskAction {
  if (optionId === undefined || !ask.options.some((o) => o.id === optionId)) {
    const { cancelOptionId: _dropped, ...rest } = ask
    return rest
  }
  return { ...ask, cancelOptionId: optionId }
}

function mapOption(ask: AskAction, index: number, fn: (option: AskOption) => AskOption): AskAction {
  return { ...ask, options: ask.options.map((o, i) => (i === index ? fn(o) : o)) }
}

export function setAnswerLabel(ask: AskAction, index: number, label: LocalizedText): AskAction {
  return mapOption(ask, index, (o) => ({ ...o, label }))
}

export function setAnswerActions(ask: AskAction, index: number, actions: ActionData[]): AskAction {
  return mapOption(ask, index, (o) => ({ ...o, actions }))
}

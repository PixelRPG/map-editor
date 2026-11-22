import {
  ACTION_TYPES,
  ASK_MAX_OPTIONS,
  ASK_MIN_OPTIONS,
  type ActionData,
  type AskOption,
  DEFAULT_LANGUAGES,
  type LocalizedText,
  resolveText,
} from '@pixelrpg/engine'

/**
 * GTK-free logic for the {@link EventActionListEditor} — summaries,
 * defaults, value parsing + id generation. Kept separate from the widget
 * so it can be unit-tested without pulling `gi://Gtk` into the test
 * bundle (same split as `map-preview.geometry.ts`). UI strings are
 * English by product decision (the design mocks' German is authoring
 * language only).
 */

/** Human labels for the "Add action" menu + type chips, keyed by type. */
export const ACTION_LABELS: Record<ActionData['type'], string> = {
  'show-text': 'Show text',
  teleport: 'Teleport',
  'give-item': 'Give item',
  'set-flag': 'Set flag',
  'play-sfx': 'Play sound',
  wait: 'Wait',
  ask: 'Ask a question',
}

/** Prefix icon per action type (Adwaita symbolic names). */
export const ACTION_ICONS: Record<ActionData['type'], string> = {
  'show-text': 'mail-unread-symbolic',
  teleport: 'go-jump-symbolic',
  'give-item': 'package-x-generic-symbolic',
  'set-flag': 'object-select-symbolic',
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
export function actionSummary(a: ActionData, mapLabel: (id: string) => string): string {
  switch (a.type) {
    case 'show-text': {
      const text = editableText(a.text) || '…'
      const speaker = editableText(a.speaker)
      return speaker ? `${speaker}: ${text}` : `Show text: ${text}`
    }
    case 'teleport':
      return `Teleport → ${mapLabel(a.targetMapId)} (${a.targetTileX}, ${a.targetTileY})`
    case 'give-item':
      return `Give ${a.qty ?? 1}× ${a.itemId || '…'}`
    case 'set-flag':
      return `Set flag ${a.flag || '…'} = ${String(a.value)}`
    case 'play-sfx':
      return `Play sound: ${a.sound || '…'}`
    case 'wait':
      return `Wait ${a.ms} ms`
    case 'ask':
      return `Ask: ${editableText(a.prompt) || '…'} (${a.options.length})`
  }
}

/** Parse a set-flag value string into boolean / number / string (in that order). */
export function parseFlagValue(text: string): boolean | number | string {
  if (text === 'true') return true
  if (text === 'false') return false
  const n = Number(text)
  if (text.trim() !== '' && !Number.isNaN(n)) return n
  return text
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

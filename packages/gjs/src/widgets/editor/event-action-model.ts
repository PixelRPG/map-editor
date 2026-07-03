import type { ActionData } from '@pixelrpg/engine'

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
}

/** Prefix icon per action type (Adwaita symbolic names). */
export const ACTION_ICONS: Record<ActionData['type'], string> = {
  'show-text': 'mail-unread-symbolic',
  teleport: 'go-jump-symbolic',
  'give-item': 'emblem-documents-symbolic',
  'set-flag': 'emblem-ok-symbolic',
  'play-sfx': 'audio-volume-high-symbolic',
  wait: 'alarm-symbolic',
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
  }
}

/** A short, human summary of an action for the collapsed row title. */
export function actionSummary(a: ActionData, mapLabel: (id: string) => string): string {
  switch (a.type) {
    case 'show-text':
      return a.speaker ? `${a.speaker}: ${a.text || '…'}` : `Show text: ${a.text || '…'}`
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

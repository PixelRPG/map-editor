/**
 * One entry in an event's ordered action list — the reduced RPG-Maker
 * "event page" body. Discriminated on `type`; each entry carries a stable
 * `id` so the editor can reorder / address entries and peers converge on
 * the same list (transport rule: stable ids as keys).
 *
 * Stored inside an {@link EntityDefinition} as the `actions` component's
 * data (`{ type: 'actions', actions: ActionData[] }`), paired with a
 * `trigger` component that decides WHEN the list runs. Kept intentionally
 * small + JSON-serialisable — the runtime {@link EventActionSystem} maps
 * each entry onto an engine event.
 */
export type ActionData =
  | { id: string; type: 'show-text'; text: string; speaker?: string }
  | { id: string; type: 'teleport'; targetMapId: string; targetTileX: number; targetTileY: number; facing?: string }
  | { id: string; type: 'give-item'; itemId: string; qty?: number }
  | { id: string; type: 'set-flag'; flag: string; value: boolean | number | string }
  | { id: string; type: 'play-sfx'; sound: string }
  | { id: string; type: 'wait'; ms: number }

/** All action `type` discriminants, in the order the editor's "Add action" menu lists them. */
export const ACTION_TYPES: readonly ActionData['type'][] = [
  'show-text',
  'teleport',
  'give-item',
  'set-flag',
  'play-sfx',
  'wait',
]

/** Type guard for a single {@link ActionData} entry (used by the spec validator). */
export function isActionData(value: unknown): value is ActionData {
  if (value == null || typeof value !== 'object') return false
  const a = value as Record<string, unknown>
  if (typeof a.id !== 'string' || typeof a.type !== 'string') return false
  switch (a.type) {
    case 'show-text':
      return typeof a.text === 'string'
    case 'teleport':
      return typeof a.targetMapId === 'string' && typeof a.targetTileX === 'number' && typeof a.targetTileY === 'number'
    case 'give-item':
      return typeof a.itemId === 'string'
    case 'set-flag':
      return (
        typeof a.flag === 'string' &&
        (typeof a.value === 'boolean' || typeof a.value === 'number' || typeof a.value === 'string')
      )
    case 'play-sfx':
      return typeof a.sound === 'string'
    case 'wait':
      return typeof a.ms === 'number'
    default:
      return false
  }
}

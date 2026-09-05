import { EventActionsComponent } from '../../components/index.ts'
import { type ActionData, isActionData } from '../../types/data/ActionData.ts'
import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/** The `actions` component data — an ordered {@link ActionData} list. */
interface ActionsData extends ComponentData {
  type: 'actions'
  actions: ActionData[]
}

/**
 * Actions — the ordered event body run when the entity's `trigger` fires.
 * The list is heterogeneous (a discriminated union), which the flat
 * field-DSL can't express, so it rides a single `json` field for
 * round-trip + a custom {@link ComponentSpec.validate} that deep-checks
 * every entry. The friendly per-action editor is the Objects view's
 * `EventActionListEditor`; the generated inspector falls back to the raw
 * JSON row.
 */
export const actionsSpec: ComponentSpec = {
  type: 'actions',
  system: 'core',
  editor: { label: 'Actions', icon: 'view-list-ordered-symbolic', markerColor: '#66ffcc' },
  fields: [{ key: 'actions', label: 'Actions', input: 'json', default: [] }],
  // Messages are prefixed with the component type by `validateComponentData`.
  validate: (data) => {
    const list = (data as ActionsData).actions
    if (list === undefined) return []
    if (!Array.isArray(list)) return ['must be a list']
    const errors: string[] = []
    const seen = new Set<string>()
    list.forEach((entry, i) => {
      if (!isActionData(entry)) {
        errors.push(`entry ${i} is not a valid action`)
        return
      }
      if (seen.has(entry.id)) errors.push(`duplicate action id "${entry.id}"`)
      seen.add(entry.id)
    })
    return errors
  },
  build: (data) => new EventActionsComponent(((data as ActionsData).actions ?? []).slice()),
}

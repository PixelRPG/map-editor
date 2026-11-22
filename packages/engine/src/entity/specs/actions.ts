import { EventActionsComponent } from '../../components/index.ts'
import { ASK_MAX_OPTIONS, ASK_MIN_OPTIONS, type ActionData, isActionData } from '../../types/data/ActionData.ts'
import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/** The `actions` component data — an ordered {@link ActionData} list. */
interface ActionsData extends ComponentData {
  type: 'actions'
  actions: ActionData[]
}

/**
 * Deep-check a list: every entry well-formed, ids unique across the list
 * and every nested option list (`seen` is shared, so an id never repeats
 * anywhere in one `actions` component), and each `ask`'s options sane.
 */
function validateActionList(list: readonly unknown[], seen: Set<string>): string[] {
  const errors: string[] = []
  list.forEach((entry, i) => {
    if (!isActionData(entry)) {
      errors.push(`entry ${i} is not a valid action`)
      return
    }
    if (seen.has(entry.id)) errors.push(`duplicate action id "${entry.id}"`)
    seen.add(entry.id)
    if (entry.type !== 'ask') return
    const count = entry.options.length
    if (count < ASK_MIN_OPTIONS || count > ASK_MAX_OPTIONS) {
      errors.push(`ask "${entry.id}" needs ${ASK_MIN_OPTIONS}-${ASK_MAX_OPTIONS} options, has ${count}`)
    }
    const optionIds = new Set<string>()
    for (const option of entry.options) {
      if (optionIds.has(option.id)) errors.push(`ask "${entry.id}" has duplicate option id "${option.id}"`)
      optionIds.add(option.id)
      errors.push(...validateActionList(option.actions, seen))
    }
    if (entry.cancelOptionId !== undefined && !optionIds.has(entry.cancelOptionId)) {
      errors.push(`ask "${entry.id}" cancelOptionId "${entry.cancelOptionId}" is not one of its options`)
    }
  })
  return errors
}

/**
 * Actions — the ordered event body run when the entity's `trigger` fires.
 * The list is heterogeneous (a discriminated union), which the flat
 * field-DSL can't express, so it rides a single `json` field for
 * round-trip + a custom {@link ComponentSpec.validate} that deep-checks
 * every entry. The friendly per-action editor is `EventActionListEditor`
 * (the child's tool, hence `basic`); Full view's generated inspector
 * falls back to the raw JSON row.
 */
export const actionsSpec: ComponentSpec = {
  type: 'actions',
  system: 'core',
  editor: { label: 'Actions', icon: 'view-list-ordered-symbolic', markerColor: '#66ffcc', basic: true },
  // `basic` on a `json` field means "render through the bespoke list
  // editor" — Simple view never shows raw JSON; the widget package
  // asserts every basic json field has such an editor.
  fields: [{ key: 'actions', label: 'Actions', input: 'json', basic: true, default: [] }],
  // Messages are prefixed with the component type by `validateComponentData`.
  validate: (data) => {
    const list = (data as ActionsData).actions
    if (list === undefined) return []
    if (!Array.isArray(list)) return ['must be a list']
    return validateActionList(list, new Set())
  },
  build: (data) => new EventActionsComponent(((data as ActionsData).actions ?? []).slice()),
}

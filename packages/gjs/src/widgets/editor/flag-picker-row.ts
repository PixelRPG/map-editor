import type Adw from '@girs/adw-1'
import type { FlagKind } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import { comboRow } from '../common/preference-rows.ts'
import type { ComponentRefOptions } from './component-inspector.ts'
import { cleanNewFlagName, existingFlagId, flagPickerOptions, isNewFlagChoice } from './flag-picker.model.ts'
import { promptNewFlag } from './new-flag-dialog.ts'

/**
 * The flag picker row both the action list and the condition editor use:
 * the project's flags by name, "New…" last. Picking "New…" asks for a name,
 * a kind and a scope, creates the flag through the host and picks it; the
 * value handed to `onPick` is always the flag's id, never its name.
 *
 * `onlyKind` narrows the list (and fixes the kind a new flag gets); the
 * currently held flag stays listed so a row never silently changes it.
 * `onPick(id, created)` runs for a pick from the list (`created` false) and
 * for a flag made through "New…" (`created` true) — the latter is when the
 * host is about to re-send the options, so the caller rebuilds then.
 */
export function flagPickerRow(
  refOptions: ComponentRefOptions,
  current: string,
  onlyKind: FlagKind | undefined,
  onPick: (flagId: string, created: boolean) => void,
): Adw.ComboRow {
  const flags = (refOptions.flags ?? []).filter((f) => !onlyKind || f.kind === onlyKind || f.value === current)
  const options = flagPickerOptions(flags, current, {
    none: _('(None)'),
    create: _('New…'),
    missing: _('Missing flag'),
  })
  let settled = current
  let reverting = false
  const row = comboRow(_('Flag'), options, current, (value) => {
    if (reverting) return
    if (!isNewFlagChoice(value)) {
      settled = value
      onPick(value, false)
      return
    }
    // Hand the row back to what it held while the name is asked for.
    reverting = true
    row.set_selected(
      Math.max(
        0,
        options.findIndex((o) => o.value === settled),
      ),
    )
    reverting = false
    void createFlagFor(row, refOptions, flags, onlyKind, (id) => {
      settled = id
      onPick(id, true)
    })
  })
  return row
}

async function createFlagFor(
  row: Adw.ComboRow,
  refOptions: ComponentRefOptions,
  flags: ReadonlyArray<{ value: string; label: string }>,
  onlyKind: FlagKind | undefined,
  onCreated: (flagId: string) => void,
): Promise<void> {
  const create = refOptions.createFlag
  if (!create) return
  const chosen = await promptNewFlag(row, onlyKind)
  if (!chosen) return
  // A name that is already a flag picks that flag: two flags of one name would read as one.
  const id =
    existingFlagId(chosen.name, flags) ??
    (cleanNewFlagName(chosen.name, flags) ? create(chosen.name, chosen.kind, chosen.scope) : null)
  if (id) onCreated(id)
}

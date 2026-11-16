// GENERATED from cast-inspector.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgCastInspector` defines. */
export declare const GTypeName: 'PixelRpgCastInspector';

/**
 * Every id inside the template, in source order — what `registerClass` is given.
 *
 * A MUTABLE tuple, and the `readonly` is missing for a reason that is not ours: `@girs`
 * declares `GObject.MetaInfo['InternalChildren']` as `string[]`, so a `readonly` tuple is
 * refused at the call site with TS4104 and the consumer would have to spread it — the
 * boilerplate ADR 0088 exists to remove. The tuple still pins the exact ids and arity,
 * which is the property that matters. `status/open-todos/blueprint.md` carries the
 * upstream half.
 */
export declare const InternalChildren: [
    'props_group',
    'name_row',
    'sheet_row',
    'edit_appearance_row',
    'player_row',
    'speed_row',
    'sheet_group',
    'sheet_name_row',
    'duration_group',
    'selected_anim_row',
    'duration_row',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _props_group: Adw.PreferencesGroup;
    _name_row: Adw.EntryRow;
    _sheet_row: Adw.ComboRow;
    _edit_appearance_row: Adw.ActionRow;
    _player_row: Adw.SwitchRow;
    _speed_row: Adw.SpinRow;
    _sheet_group: Adw.PreferencesGroup;
    _sheet_name_row: Adw.EntryRow;
    _duration_group: Adw.PreferencesGroup;
    _selected_anim_row: Adw.ActionRow;
    _duration_row: Adw.SpinRow;
}

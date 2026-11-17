// GENERATED from together-dialog.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $TogetherDialog` defines. */
export declare const GTypeName: 'TogetherDialog';

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
    'people_group',
    'invite_group',
    'invite_stack',
    'solo_hint',
    'start_button',
    'starting_label',
    'code_label',
    'copy_button',
    'code_hint',
    'nearby_row',
    'stop_group',
    'stop_row',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _people_group: Adw.PreferencesGroup;
    _invite_group: Adw.PreferencesGroup;
    _invite_stack: Gtk.Stack;
    _solo_hint: Gtk.Label;
    _start_button: Gtk.Button;
    _starting_label: Gtk.Label;
    _code_label: Gtk.Label;
    _copy_button: Gtk.Button;
    _code_hint: Gtk.Label;
    _nearby_row: Adw.SwitchRow;
    _stop_group: Adw.PreferencesGroup;
    _stop_row: Adw.ButtonRow;
}

// GENERATED from props-tab.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgPropsTab` defines. */
export declare const GTypeName: 'PixelRpgPropsTab';

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
    'object_group',
    'object_def_row',
    'object_open_button',
    'object_position_row',
    'object_remove_row',
    'props_group',
    'name_row',
    'size_row',
    'tile_size_row',
    'music_row',
    'battle_bg_row',
    'encounters_row',
    'on_enter_row',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _object_group: Adw.PreferencesGroup;
    _object_def_row: Adw.ActionRow;
    _object_open_button: Gtk.Button;
    _object_position_row: Adw.ActionRow;
    _object_remove_row: Adw.ActionRow;
    _props_group: Adw.PreferencesGroup;
    _name_row: Adw.EntryRow;
    _size_row: Adw.ActionRow;
    _tile_size_row: Adw.ActionRow;
    _music_row: Adw.EntryRow;
    _battle_bg_row: Adw.EntryRow;
    _encounters_row: Adw.ActionRow;
    _on_enter_row: Adw.ActionRow;
}

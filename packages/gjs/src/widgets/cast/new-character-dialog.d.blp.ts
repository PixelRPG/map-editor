// GENERATED from new-character-dialog.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgNewCharacterDialog` defines. */
export declare const GTypeName: 'PixelRpgNewCharacterDialog';

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
    'preview_picture',
    'name_row',
    'kind_row',
    'player_row',
    'import_button',
    'spriteset_row',
    'speed_row',
    'cancel_button',
    'create_button',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _preview_picture: Gtk.Picture;
    _name_row: Adw.EntryRow;
    _kind_row: Adw.ComboRow;
    _player_row: Adw.SwitchRow;
    _import_button: Gtk.Button;
    _spriteset_row: Adw.ComboRow;
    _speed_row: Adw.SpinRow;
    _cancel_button: Gtk.Button;
    _create_button: Gtk.Button;
}

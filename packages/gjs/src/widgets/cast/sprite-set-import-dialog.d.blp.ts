// GENERATED from sprite-set-import-dialog.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type GObject from 'gi://GObject?version=2.0';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgSpriteSetImportDialog` defines. */
export declare const GTypeName: 'PixelRpgSpriteSetImportDialog';

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
    'split_box',
    'settings_column',
    'name_row',
    'file_row',
    'choose_button',
    'phone_preview_slot',
    'preview_block',
    'collision_preview',
    'size_group',
    'width_row',
    'height_row',
    'grid_row',
    'collision_group',
    'collision_row',
    'collider_x_row',
    'collider_y_row',
    'collider_w_row',
    'collider_h_row',
    'picker_column',
    'desktop_preview_slot',
    'palette',
    'desktop_breakpoint',
    'cancel_button',
    'import_button',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _split_box: Gtk.Box;
    _settings_column: Gtk.Box;
    _name_row: Adw.EntryRow;
    _file_row: Adw.ActionRow;
    _choose_button: Gtk.Button;
    _phone_preview_slot: Gtk.Box;
    _preview_block: Gtk.Box;
    _collision_preview: GObject.Object;
    _size_group: Adw.PreferencesGroup;
    _width_row: Adw.SpinRow;
    _height_row: Adw.SpinRow;
    _grid_row: Adw.ActionRow;
    _collision_group: Adw.PreferencesGroup;
    _collision_row: Adw.SwitchRow;
    _collider_x_row: Adw.SpinRow;
    _collider_y_row: Adw.SpinRow;
    _collider_w_row: Adw.SpinRow;
    _collider_h_row: Adw.SpinRow;
    _picker_column: Gtk.Box;
    _desktop_preview_slot: Gtk.Box;
    _palette: GObject.Object;
    _desktop_breakpoint: Adw.Breakpoint;
    _cancel_button: Gtk.Button;
    _import_button: Gtk.Button;
}

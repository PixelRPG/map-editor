// GENERATED from terrain-define-dialog.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type GObject from 'gi://GObject?version=2.0';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgTerrainDefineDialog` defines. */
export declare const GTypeName: 'PixelRpgTerrainDefineDialog';

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
    'nav',
    'brush_list',
    'new_row',
    'preset_list',
    'place_box',
    'form_column',
    'sample',
    'hint_label',
    'part_group',
    'name_row',
    'walk_row',
    'fixup_row',
    'sheet_scroller',
    'sheet',
    'create_button',
    'fixup_page',
    'fixup_box',
    'fixup_column',
    'fixup_sample',
    'fixup_hint',
    'fixup_mode',
    'fixup_name_list',
    'fixup_name_row',
    'fixup_scroller',
    'fixup_sheet',
    'fixup_create_button',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _nav: Adw.NavigationView;
    _brush_list: Gtk.ListBox;
    _new_row: Adw.ButtonRow;
    _preset_list: Gtk.ListBox;
    _place_box: Gtk.Box;
    _form_column: Gtk.Box;
    _sample: GObject.Object;
    _hint_label: Gtk.Label;
    _part_group: Adw.ToggleGroup;
    _name_row: Adw.EntryRow;
    _walk_row: Adw.SwitchRow;
    _fixup_row: Adw.ActionRow;
    _sheet_scroller: Gtk.ScrolledWindow;
    _sheet: GObject.Object;
    _create_button: Gtk.Button;
    _fixup_page: Adw.NavigationPage;
    _fixup_box: Gtk.Box;
    _fixup_column: Gtk.Box;
    _fixup_sample: GObject.Object;
    _fixup_hint: Gtk.Label;
    _fixup_mode: Adw.ToggleGroup;
    _fixup_name_list: Gtk.ListBox;
    _fixup_name_row: Adw.EntryRow;
    _fixup_scroller: Gtk.ScrolledWindow;
    _fixup_sheet: GObject.Object;
    _fixup_create_button: Gtk.Button;
}

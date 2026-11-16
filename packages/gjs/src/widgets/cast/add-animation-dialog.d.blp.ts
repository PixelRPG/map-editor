// GENERATED from add-animation-dialog.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type GObject from 'gi://GObject?version=2.0';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgAddAnimationDialog` defines. */
export declare const GTypeName: 'PixelRpgAddAnimationDialog';

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
    'duration_row',
    'preview_box',
    'preview_frame',
    'onion_preview',
    'onion_toggle',
    'sequence_section',
    'apply_all_button',
    'add_frame_button',
    'frame_picker',
    'sequence_stack',
    'sequence_strip',
    'play_toggle',
    'timeline',
    'time_label',
    'picker_column',
    'palette',
    'zoom_out_button',
    'zoom_reset_button',
    'zoom_label',
    'zoom_in_button',
    'cancel_button',
    'save_button',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _split_box: Gtk.Box;
    _settings_column: Gtk.Box;
    _name_row: Adw.EntryRow;
    _duration_row: Adw.SpinRow;
    _preview_box: Gtk.Box;
    _preview_frame: Gtk.Frame;
    _onion_preview: GObject.Object;
    _onion_toggle: Gtk.ToggleButton;
    _sequence_section: Gtk.Box;
    _apply_all_button: Gtk.Button;
    _add_frame_button: Gtk.MenuButton;
    _frame_picker: GObject.Object;
    _sequence_stack: Gtk.Stack;
    _sequence_strip: GObject.Object;
    _play_toggle: Gtk.ToggleButton;
    _timeline: GObject.Object;
    _time_label: Gtk.Label;
    _picker_column: Gtk.Box;
    _palette: GObject.Object;
    _zoom_out_button: Gtk.Button;
    _zoom_reset_button: Gtk.Button;
    _zoom_label: Gtk.Inscription;
    _zoom_in_button: Gtk.Button;
    _cancel_button: Gtk.Button;
    _save_button: Gtk.Button;
}

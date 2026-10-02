// GENERATED from scene-inspector.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgSceneInspector` defines. */
export declare const GTypeName: 'PixelRpgSceneInspector';

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
    'body',
    'preview_frame',
    'preview_slot',
    'name_label',
    'subtitle_label',
    'stats_grid',
    'lock_group',
    'lock_row',
    'teleports_group',
    'open_button',
    'empty_state',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _body: Gtk.Box;
    _preview_frame: Gtk.Frame;
    _preview_slot: Adw.Bin;
    _name_label: Gtk.Label;
    _subtitle_label: Gtk.Label;
    _stats_grid: Gtk.Grid;
    _lock_group: Adw.PreferencesGroup;
    _lock_row: Adw.SwitchRow;
    _teleports_group: Adw.PreferencesGroup;
    _open_button: Gtk.Button;
    _empty_state: Adw.StatusPage;
}

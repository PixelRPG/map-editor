// GENERATED from tile-inspector.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgTileInspector` defines. */
export declare const GTypeName: 'PixelRpgTileInspector';

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
    'preview_frame',
    'preview',
    'title_label',
    'collision_group',
    'solid_row',
    'properties_group',
    'surface_row',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _preview_frame: Gtk.Frame;
    _preview: Gtk.Picture;
    _title_label: Gtk.Label;
    _collision_group: Adw.PreferencesGroup;
    _solid_row: Adw.SwitchRow;
    _properties_group: Adw.PreferencesGroup;
    _surface_row: Adw.ComboRow;
}

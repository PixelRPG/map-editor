// GENERATED from atlas-view.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type GObject from 'gi://GObject?version=2.0';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $AtlasView` defines. */
export declare const GTypeName: 'AtlasView';

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
    'outer_split',
    'mode_rail',
    'inner_split',
    'inspector',
    'atlas',
    'overview_frame',
    'atlas_overview',
    'new_scene_fab',
    'legend_chip',
    'preview_zoom',
    'library_toggle',
    'inspector_toggle',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _outer_split: Adw.OverlaySplitView;
    _mode_rail: GObject.Object;
    _inner_split: Adw.OverlaySplitView;
    _inspector: GObject.Object;
    _atlas: GObject.Object;
    _overview_frame: Adw.Bin;
    _atlas_overview: GObject.Object;
    _new_scene_fab: GObject.Object;
    _legend_chip: Gtk.Box;
    _preview_zoom: GObject.Object;
    _library_toggle: Gtk.ToggleButton;
    _inspector_toggle: Gtk.ToggleButton;
}

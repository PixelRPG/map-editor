// GENERATED from library-view.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type GObject from 'gi://GObject?version=2.0';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgLibraryView` defines. */
export declare const GTypeName: 'PixelRpgLibraryView';

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
    'hidden_banner',
    'pages',
    'cast_view',
    'objects_view',
    'tiles_view',
    'chips',
    'graphics_toggle',
    'library_toggle',
    'header_end',
    'new_thing_button',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _outer_split: Adw.OverlaySplitView;
    _mode_rail: GObject.Object;
    _hidden_banner: Adw.Banner;
    _pages: Gtk.Stack;
    _cast_view: GObject.Object;
    _objects_view: GObject.Object;
    _tiles_view: GObject.Object;
    _chips: Adw.ToggleGroup;
    _graphics_toggle: Adw.Toggle;
    _library_toggle: Gtk.ToggleButton;
    _header_end: Gtk.Stack;
    _new_thing_button: Gtk.Button;
}

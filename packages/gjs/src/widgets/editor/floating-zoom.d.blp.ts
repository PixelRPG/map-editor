// GENERATED from floating-zoom.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgFloatingZoom` defines. */
export declare const GTypeName: 'PixelRpgFloatingZoom';

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
    'zoom_out_button',
    'zoom_reset_button',
    'zoom_label',
    'zoom_in_button',
    'fit_separator',
    'fit_button',
    'cursor_label',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _zoom_out_button: Gtk.Button;
    _zoom_reset_button: Gtk.Button;
    _zoom_label: Gtk.Inscription;
    _zoom_in_button: Gtk.Button;
    _fit_separator: Gtk.Separator;
    _fit_button: Gtk.Button;
    _cursor_label: Gtk.Inscription;
}

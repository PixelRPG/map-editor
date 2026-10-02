// GENERATED from mode-rail.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type GObject from 'gi://GObject?version=2.0';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgModeRail` defines. */
export declare const GTypeName: 'PixelRpgModeRail';

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
    'hero_header',
    'share_button',
    'menu_button',
    'hero',
    'hero_icon',
    'project_name',
    'project_tagline',
    'mode_group',
    'row_world',
    'row_library',
    'row_game',
    'footer',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _hero_header: Gtk.Box;
    _share_button: Gtk.Button;
    _menu_button: Gtk.MenuButton;
    _hero: Gtk.Box;
    _hero_icon: GObject.Object;
    _project_name: Gtk.Label;
    _project_tagline: Gtk.Label;
    _mode_group: Adw.PreferencesGroup;
    _row_world: Adw.ActionRow;
    _row_library: Adw.ActionRow;
    _row_game: Adw.ActionRow;
    _footer: Gtk.Box;
}

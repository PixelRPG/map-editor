// GENERATED from game-view.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type GObject from 'gi://GObject?version=2.0';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgGameView` defines. */
export declare const GTypeName: 'PixelRpgGameView';

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
        'layouts',
        'cover',
        'name_row',
        'play_button',
        'share_button',
        'checkup_list',
        'start_map_row',
        'hero_row',
        'game_rules',
        'always_on',
        'built_in_row',
        'author_row',
        'description_row',
        'version_row',
        'tilesize_row',
        'folder_row',
        'view_switcher',
        'project_menu',
        'roster_chip',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
        _layouts: Adw.MultiLayoutView;
        _cover: Adw.Bin;
        _name_row: Adw.EntryRow;
        _play_button: Gtk.Button;
        _share_button: Gtk.Button;
        _checkup_list: Gtk.ListBox;
        _start_map_row: Adw.ActionRow;
        _hero_row: Adw.ActionRow;
        _game_rules: Adw.PreferencesGroup;
        _always_on: Adw.PreferencesGroup;
        _built_in_row: Adw.ExpanderRow;
        _author_row: Adw.EntryRow;
        _description_row: Adw.EntryRow;
        _version_row: Adw.EntryRow;
        _tilesize_row: Adw.SpinRow;
        _folder_row: Adw.ActionRow;
        _view_switcher: Adw.ViewSwitcher;
        _project_menu: GObject.Object;
        _roster_chip: GObject.Object;
}

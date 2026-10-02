// GENERATED from tiles-view.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type GObject from 'gi://GObject?version=2.0';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $TilesView` defines. */
export declare const GTypeName: 'TilesView';

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
    'gallery_split',
    'quick_view',
    'header_label',
    'search_entry',
    'sort_dropdown',
    'gallery_header',
    'new_tileset_button',
    'gallery_description',
    'tilesets_gallery',
    'appearance_header',
    'new_appearance_button',
    'appearances_gallery',
    'detail_page',
    'tile_split',
    'side_slot',
    'inspector',
    'palette_scroller',
    'palette',
    'tile_sheet',
    'sheet_close',
    'sheet_slot',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _nav: Adw.NavigationView;
    _gallery_split: Adw.OverlaySplitView;
    _quick_view: GObject.Object;
    _header_label: Gtk.Label;
    _search_entry: Gtk.SearchEntry;
    _sort_dropdown: Gtk.DropDown;
    _gallery_header: Gtk.Box;
    _new_tileset_button: Gtk.Button;
    _gallery_description: Gtk.Label;
    _tilesets_gallery: GObject.Object;
    _appearance_header: Gtk.Box;
    _new_appearance_button: Gtk.Button;
    _appearances_gallery: GObject.Object;
    _detail_page: Adw.NavigationPage;
    _tile_split: Adw.OverlaySplitView;
    _side_slot: Gtk.Box;
    _inspector: GObject.Object;
    _palette_scroller: Gtk.ScrolledWindow;
    _palette: GObject.Object;
    _tile_sheet: Gtk.Revealer;
    _sheet_close: Gtk.Button;
    _sheet_slot: Gtk.Box;
}

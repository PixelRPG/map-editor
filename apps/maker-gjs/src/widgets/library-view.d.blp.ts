// GENERATED from library-view.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from "gi://Adw?version=1";
import type GObject from "gi://GObject?version=2.0";
import type Gtk from "gi://Gtk?version=4.0";

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgLibraryView` defines. */
export declare const GTypeName: "PixelRpgLibraryView";

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
  "split",
  "hidden_banner",
  "chips",
  "pages",
  "cast_view",
  "objects_view",
  "graphics_page",
  "tiles_view",
  "sidebar_header",
  "view_switcher",
  "project_menu",
  "roster_chip",
  "new_stack",
  "new_thing_row",
  "detail_page",
  "detail_stack",
  "cast_detail",
  "object_detail",
  "tiles_detail",
  "detail_header",
  "detail_end",
  "character_menu_button",
  "thing_menu_button",
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
  _split: Adw.NavigationSplitView;
  _hidden_banner: Adw.Banner;
  _chips: Adw.InlineViewSwitcher;
  _pages: Adw.ViewStack;
  _cast_view: GObject.Object;
  _objects_view: GObject.Object;
  _graphics_page: Adw.ViewStackPage;
  _tiles_view: GObject.Object;
  _sidebar_header: Adw.HeaderBar;
  _view_switcher: Adw.ViewSwitcher;
  _project_menu: GObject.Object;
  _roster_chip: GObject.Object;
  _new_stack: Gtk.Stack;
  _new_thing_row: Adw.ButtonRow;
  _detail_page: Adw.NavigationPage;
  _detail_stack: Gtk.Stack;
  _cast_detail: GObject.Object;
  _object_detail: GObject.Object;
  _tiles_detail: GObject.Object;
  _detail_header: Adw.HeaderBar;
  _detail_end: Gtk.Stack;
  _character_menu_button: Gtk.MenuButton;
  _thing_menu_button: Gtk.MenuButton;
}

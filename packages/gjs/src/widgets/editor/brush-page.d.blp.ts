// GENERATED from brush-page.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from "gi://Adw?version=1";
import type GObject from "gi://GObject?version=2.0";
import type Gtk from "gi://Gtk?version=4.0";

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgBrushPage` defines. */
export declare const GTypeName: "PixelRpgBrushPage";

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
  "plane_chips",
  "layer_row",
  "layer_label",
  "layers_button",
  "mode_toggle",
  "mode_stack",
  "tiles_pane",
  "tileset_row",
  "tileset_scroller",
  "tileset_chips",
  "walls_toggle",
  "sheet_scroller",
  "sheet",
  "empty_state",
  "things_scroller",
  "object_palette",
  "objects_empty",
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
  _plane_chips: Adw.ToggleGroup;
  _layer_row: Gtk.Box;
  _layer_label: Gtk.Label;
  _layers_button: Gtk.Button;
  _mode_toggle: Adw.ToggleGroup;
  _mode_stack: Gtk.Stack;
  _tiles_pane: Gtk.Box;
  _tileset_row: Gtk.Box;
  _tileset_scroller: Gtk.ScrolledWindow;
  _tileset_chips: Adw.ToggleGroup;
  _walls_toggle: Gtk.ToggleButton;
  _sheet_scroller: Gtk.ScrolledWindow;
  _sheet: GObject.Object;
  _empty_state: Adw.StatusPage;
  _things_scroller: Gtk.ScrolledWindow;
  _object_palette: GObject.Object;
  _objects_empty: Gtk.Label;
}

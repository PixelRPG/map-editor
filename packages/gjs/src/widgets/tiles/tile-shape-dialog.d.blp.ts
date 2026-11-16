// GENERATED from tile-shape-dialog.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from "gi://Adw?version=1";
import type GObject from "gi://GObject?version=2.0";
import type Gtk from "gi://Gtk?version=4.0";

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgTileShapeDialog` defines. */
export declare const GTypeName: "PixelRpgTileShapeDialog";

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
  "split_box",
  "canvas_scroller",
  "canvas",
  "side_column",
  "tool_group",
  "hint_label",
  "shape_stack",
  "shape_list",
  "clear_button",
  "cancel_button",
  "save_button",
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
  _split_box: Gtk.Box;
  _canvas_scroller: Gtk.ScrolledWindow;
  _canvas: GObject.Object;
  _side_column: Gtk.Box;
  _tool_group: Adw.ToggleGroup;
  _hint_label: Gtk.Label;
  _shape_stack: Gtk.Stack;
  _shape_list: Gtk.ListBox;
  _clear_button: Gtk.Button;
  _cancel_button: Gtk.Button;
  _save_button: Gtk.Button;
}

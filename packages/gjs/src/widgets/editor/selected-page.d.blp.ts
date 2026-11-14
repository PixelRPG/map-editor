// GENERATED from selected-page.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from "gi://Adw?version=1";
import type Gtk from "gi://Gtk?version=4.0";

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgSelectedPage` defines. */
export declare const GTypeName: "PixelRpgSelectedPage";

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
  "stack",
  "name_row",
  "sprite_image",
  "kind_row",
  "position_row",
  "library_row",
  "components_slot",
  "duplicate_row",
  "delete_row",
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
  _stack: Gtk.Stack;
  _name_row: Adw.EntryRow;
  _sprite_image: Gtk.Image;
  _kind_row: Adw.ActionRow;
  _position_row: Adw.ActionRow;
  _library_row: Adw.ActionRow;
  _components_slot: Adw.Bin;
  _duplicate_row: Adw.ButtonRow;
  _delete_row: Adw.ButtonRow;
}

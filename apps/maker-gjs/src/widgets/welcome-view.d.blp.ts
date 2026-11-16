// GENERATED from welcome-view.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from "gi://Adw?version=1";
import type Gtk from "gi://Gtk?version=4.0";

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $WelcomeView` defines. */
export declare const GTypeName: "WelcomeView";

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
  "continue_slot",
  "templates_wrap",
  "open_button",
  "recents_section",
  "recents_list",
  "sessions_list",
  "join_row",
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
  _continue_slot: Adw.Bin;
  _templates_wrap: Adw.WrapBox;
  _open_button: Gtk.Button;
  _recents_section: Gtk.Box;
  _recents_list: Gtk.ListBox;
  _sessions_list: Gtk.ListBox;
  _join_row: Adw.ButtonRow;
}

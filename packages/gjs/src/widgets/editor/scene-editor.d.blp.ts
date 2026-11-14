// GENERATED from scene-editor.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from "gi://Adw?version=1";
import type GObject from "gi://GObject?version=2.0";
import type Gtk from "gi://Gtk?version=4.0";

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $PixelRpgSceneEditor` defines. */
export declare const GTypeName: "PixelRpgSceneEditor";

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
  "ladder",
  "bottom_sheet",
  "overlay",
  "backdrop",
  "engine_holder",
  "editing_handle",
  "editing_pill",
  "back_button",
  "back_label",
  "undo_button",
  "redo_button",
  "tools_slot_top",
  "badge_button",
  "badge_slot_top",
  "badge_label",
  "back_circle",
  "back_circle_label",
  "context_handle",
  "context_pill",
  "roster_slot",
  "stop_button",
  "restart_button",
  "overflow_button",
  "inspector_toggle",
  "window_controls",
  "history_pill",
  "phone_undo",
  "phone_redo",
  "zoom_osd",
  "cursor_caption",
  "cursor_label",
  "floating_play",
  "phone_bar",
  "bar_row_a",
  "tools_slot_bar",
  "badge_slot_bar",
  "recent_tiles",
  "sheet_view",
  "sheet_grabber",
  "sheet_switcher",
  "sheet_scroller",
  "sheet_stack",
  "brush_slot_sheet",
  "layers_slot_sheet",
  "selected_slot_sheet",
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
  _ladder: Adw.BreakpointBin;
  _bottom_sheet: Adw.BottomSheet;
  _overlay: Gtk.Overlay;
  _backdrop: Adw.Bin;
  _engine_holder: Gtk.Box;
  _editing_handle: Gtk.WindowHandle;
  _editing_pill: Gtk.Box;
  _back_button: Gtk.Button;
  _back_label: Gtk.Label;
  _undo_button: Gtk.Button;
  _redo_button: Gtk.Button;
  _tools_slot_top: Adw.Bin;
  _badge_button: Gtk.Button;
  _badge_slot_top: Adw.Bin;
  _badge_label: Gtk.Label;
  _back_circle: Gtk.Button;
  _back_circle_label: Gtk.Label;
  _context_handle: Gtk.WindowHandle;
  _context_pill: Gtk.Box;
  _roster_slot: Adw.Bin;
  _stop_button: Gtk.Button;
  _restart_button: Gtk.Button;
  _overflow_button: Gtk.MenuButton;
  _inspector_toggle: Gtk.ToggleButton;
  _window_controls: Gtk.WindowControls;
  _history_pill: Gtk.Box;
  _phone_undo: Gtk.Button;
  _phone_redo: Gtk.Button;
  _zoom_osd: GObject.Object;
  _cursor_caption: Gtk.Box;
  _cursor_label: Gtk.Inscription;
  _floating_play: GObject.Object;
  _phone_bar: Gtk.Box;
  _bar_row_a: Gtk.Box;
  _tools_slot_bar: Adw.Bin;
  _badge_slot_bar: Adw.Bin;
  _recent_tiles: GObject.Object;
  _sheet_view: Gtk.Box;
  _sheet_grabber: Gtk.Box;
  _sheet_switcher: Adw.InlineViewSwitcher;
  _sheet_scroller: Gtk.ScrolledWindow;
  _sheet_stack: Adw.ViewStack;
  _brush_slot_sheet: Adw.Bin;
  _layers_slot_sheet: Adw.Bin;
  _selected_slot_sheet: Adw.Bin;
}

// GENERATED from welcome-view.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type GObject from 'gi://GObject?version=2.0';
import type Gtk from 'gi://Gtk?version=4.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $WelcomeView` defines. */
export declare const GTypeName: 'WelcomeView';

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
    'outer_split',
    'sidebar_recents_slot',
    'recents_column',
    'recents_header',
    'browse_button',
    'recents_list',
    'empty_recents_row',
    'sessions_header',
    'sessions_list',
    'empty_sessions_row',
    'join_link_group',
    'join_link_row',
    'join_link_button',
    'hero_column',
    'hero_icon',
    'welcome_title',
    'welcome_subtitle',
    'cta_box',
    'create_button',
    'open_button',
    'inline_recents_slot',
    'templates_header',
    'templates_heading',
    'template_filter',
    'templates_grid',
    'sidebar_toggle',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _outer_split: Adw.OverlaySplitView;
    _sidebar_recents_slot: Adw.Bin;
    _recents_column: Gtk.Box;
    _recents_header: Gtk.Box;
    _browse_button: Gtk.Button;
    _recents_list: Gtk.ListBox;
    _empty_recents_row: Adw.ActionRow;
    _sessions_header: Gtk.Box;
    _sessions_list: Gtk.ListBox;
    _empty_sessions_row: Adw.ActionRow;
    _join_link_group: Adw.PreferencesGroup;
    _join_link_row: Adw.EntryRow;
    _join_link_button: Gtk.Button;
    _hero_column: Gtk.Box;
    _hero_icon: GObject.Object;
    _welcome_title: Gtk.Label;
    _welcome_subtitle: Gtk.Label;
    _cta_box: Gtk.FlowBox;
    _create_button: Gtk.Button;
    _open_button: Gtk.Button;
    _inline_recents_slot: Adw.Bin;
    _templates_header: Gtk.Box;
    _templates_heading: Gtk.Label;
    _template_filter: Gtk.SearchEntry;
    _templates_grid: Gtk.FlowBox;
    _sidebar_toggle: Gtk.ToggleButton;
}

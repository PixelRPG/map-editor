// GENERATED from application-window.blp — do not edit. ADR 0088 says what these exports mean.
// Regenerate with `gjsify blueprint types`; `scripts/check-blueprint-sidecars.mjs` holds it.

import type Adw from 'gi://Adw?version=1';
import type GObject from 'gi://GObject?version=2.0';

/** The GtkBuilder XML this `.blp` compiles to. */
declare const xml: string;
export default xml;

/** The class `template $ApplicationWindow` defines. */
export declare const GTypeName: 'ApplicationWindow';

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
    'toast_overlay',
    'stack',
    'welcome_view',
    'atlas_view',
    'library_view',
    'scene_editor_view',
    'game_view',
];

/** The `_`-prefixed members GJS installs for them. Merge it into the class interface. */
export interface Children {
    _toast_overlay: Adw.ToastOverlay;
    _stack: Adw.ViewStack;
    _welcome_view: GObject.Object;
    _atlas_view: GObject.Object;
    _library_view: GObject.Object;
    _scene_editor_view: GObject.Object;
    _game_view: GObject.Object;
}

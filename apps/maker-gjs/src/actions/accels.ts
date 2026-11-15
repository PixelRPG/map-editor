import type Gtk from '@girs/gtk-4.0'

/**
 * Keyboard accelerators for the window actions. `win.atlas-fit` is bound
 * to a bare `0`; the action itself guards to the atlas, and text entries
 * still eat the key before it reaches the window.
 */
export const WINDOW_ACCELS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['win.undo', ['<Primary>z']],
  ['win.redo', ['<Primary><Shift>z', '<Primary>y']],
  ['win.toggle-grid', ['<Primary>g']],
  ['win.toggle-transparency', ['<Primary>t']],
  ['win.play', ['F5']],
  ['win.atlas-fit', ['0']],
  ['win.map-list', ['<Primary>l']],
  ['win.share-session', ['<Primary><Shift>s']],
  // Tool keys. The tool group carries verbs only at the widest rung and
  // is not shown at all at the narrowest (`STAGE_MIN_CANVAS_PX` in
  // `@pixelrpg/gjs`'s `chrome-stages.ts` owns those widths — do not
  // restate them here, they move), so a key is an expert's fastest route
  // to a verb at most sizes. Each toggle's tooltip names its key.
  ['win.set-tool::select', ['v']],
  ['win.set-tool::pencil', ['b']],
  ['win.set-tool::fill', ['g']],
  ['win.set-tool::eraser', ['e']],
  ['win.set-tool::eyedropper', ['i']],
  ['win.set-tool::object', ['o']],
  // Zoom, now that the readout is transient and the +/- buttons are gone.
  ['win.zoom-in', ['plus', 'equal', '<Primary>plus']],
  ['win.zoom-out', ['minus', '<Primary>minus']],
  ['win.zoom-reset', ['<Primary>0']],
]

/**
 * Keys bound on the WINDOW, not on the application.
 *
 * `Gtk.Application.set_accels_for_action` installs a global accelerator:
 * it fires in the capture phase, before the focused widget is asked, so
 * `Escape` there would be taken away from every popover, dialog and
 * entry in the app — a person typing a map name could not abandon the
 * entry, and the brush popover could not be dismissed. These live on a
 * bubble-phase `Gtk.ShortcutController` instead, which the focused
 * widget gets to refuse first, and whose handler reports back whether it
 * did anything, so an unused `Escape` still travels on.
 *
 * The controller is built in `ApplicationWindow` rather than here: this
 * module is in the node test graph, which has no gi stack to construct a
 * `Gtk.ShortcutController` with — `@girs/gtk-4.0` must stay a type-only
 * import.
 *
 * They are declared here all the same, so the shortcut dialog can list
 * them and `accels.spec.ts` can hold them to the same two invariants as
 * {@link WINDOW_ACCELS}.
 */
export const WINDOW_SHORTCUTS: ReadonlyArray<readonly [string, readonly string[]]> = [
  // One back, five gestures (REDESIGN.md § 3.4). The mouse back button
  // is not an accelerator at all — it is a `Gtk.GestureClick` on button
  // 8, wired next to this controller.
  ['win.back', ['Escape', '<Alt>Left']],
]

/**
 * The shortcut reference, grouped the way a person looks one up — by
 * task, not by the module the action happens to live in.
 *
 * Titles live here, accelerators do NOT: each row names an action and
 * {@link acceleratorFor} reads the keys back out of {@link WINDOW_ACCELS},
 * so the dialog cannot tell the user a key the window does not bind.
 * A hand-written mirror is exactly the drift `check-blp-actions.mjs`
 * exists for — the "Keyboard Shortcuts" menu item shipped greyed out in
 * every build ever made because nothing held it to a real action.
 */
export interface ShortcutSection {
  title: string
  items: ReadonlyArray<{ action: string; title: string }>
}

export const SHORTCUT_SECTIONS: ReadonlyArray<ShortcutSection> = [
  {
    title: 'Navigation',
    items: [{ action: 'win.back', title: 'Back' }],
  },
  {
    title: 'Tools',
    items: [
      { action: 'win.set-tool::select', title: 'Select' },
      { action: 'win.set-tool::pencil', title: 'Paint' },
      { action: 'win.set-tool::fill', title: 'Fill' },
      { action: 'win.set-tool::eraser', title: 'Erase' },
      { action: 'win.set-tool::eyedropper', title: 'Pick' },
      { action: 'win.set-tool::object', title: 'Place object' },
    ],
  },
  {
    title: 'History',
    items: [
      { action: 'win.undo', title: 'Undo' },
      { action: 'win.redo', title: 'Redo' },
    ],
  },
  {
    title: 'View',
    items: [
      { action: 'win.toggle-grid', title: 'Show grid' },
      { action: 'win.toggle-transparency', title: 'Dim other layers' },
      { action: 'win.map-list', title: 'Show maps as a list' },
    ],
  },
  {
    title: 'Zoom',
    items: [
      { action: 'win.zoom-in', title: 'Zoom in' },
      { action: 'win.zoom-out', title: 'Zoom out' },
      { action: 'win.zoom-reset', title: 'Reset zoom' },
      { action: 'win.atlas-fit', title: 'Fit all maps in view' },
    ],
  },
  {
    title: 'Play',
    items: [
      { action: 'win.play', title: 'Play or stop' },
      { action: 'win.share-session', title: 'Share this session' },
    ],
  },
]

/**
 * The first accelerator bound to `action`, or `null` when it has none.
 * Searches both tables: where a key is installed is an implementation
 * detail of the key, and the shortcut dialog has to list either kind.
 */
export function acceleratorFor(action: string): string | null {
  const row = WINDOW_ACCELS.find(([name]) => name === action) ?? WINDOW_SHORTCUTS.find(([name]) => name === action)
  return row?.[1][0] ?? null
}

/** Bind {@link WINDOW_ACCELS}; a no-op before the window has an application. */
export function installWindowAccels(app: Gtk.Application | null): void {
  if (!app) return
  for (const [action, accels] of WINDOW_ACCELS) app.set_accels_for_action(action, [...accels])
}

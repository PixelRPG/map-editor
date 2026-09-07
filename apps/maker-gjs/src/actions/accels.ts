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
  ['win.share-session', ['<Primary><Shift>s']],
  // Tool keys. The tool group is icon-only below a 1124 px canvas, so
  // an expert's fastest route to a verb is the key, and the tooltip on
  // each toggle names it.
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

/** The first accelerator bound to `action`, or `null` when it has none. */
export function acceleratorFor(action: string): string | null {
  return WINDOW_ACCELS.find(([name]) => name === action)?.[1][0] ?? null
}

/** Bind {@link WINDOW_ACCELS}; a no-op before the window has an application. */
export function installWindowAccels(app: Gtk.Application | null): void {
  if (!app) return
  for (const [action, accels] of WINDOW_ACCELS) app.set_accels_for_action(action, [...accels])
}

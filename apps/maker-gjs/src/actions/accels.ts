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
]

/** Bind {@link WINDOW_ACCELS}; a no-op before the window has an application. */
export function installWindowAccels(app: Gtk.Application | null): void {
  if (!app) return
  for (const [action, accels] of WINDOW_ACCELS) app.set_accels_for_action(action, [...accels])
}

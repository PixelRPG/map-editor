import GLib from '@girs/glib-2.0'

/** Resolve after `ms`, letting the (single-threaded) GLib main loop run meanwhile. */
export function delay(ms: number): Promise<void> {
  return new Promise((res) => {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      res()
      return GLib.SOURCE_REMOVE
    })
  })
}

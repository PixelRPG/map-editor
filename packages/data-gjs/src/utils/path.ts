import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'

export const resolve = (
  dir: string | Gio.File,
  ...filenames: string[]
): Gio.File => {
  let file = typeof dir === 'string' ? Gio.File.new_for_path(dir) : dir
  for (const filename of filenames) {
    file = file.resolve_relative_path(filename)
  }
  return file
}

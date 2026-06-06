import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'

/**
 * Write `contents` to an absolute filesystem path via
 * `Gio.File.replace_contents`. Creates parent directories on demand
 * (mirrors `mkdir -p`). Returns `true` on success.
 *
 * Best-effort: failures are logged via `console.warn` and surface as
 * `false`; callers decide whether to toast / retry. The error policy
 * is "the in-memory state is authoritative — disk is a write-through
 * cache" everywhere this helper is used today.
 */
export function writeTextFile(path: string, contents: string): boolean {
  try {
    const dir = GLib.path_get_dirname(path)
    const dirFile = Gio.File.new_for_path(dir)
    if (!dirFile.query_exists(null)) {
      dirFile.make_directory_with_parents(null)
    }
    const file = Gio.File.new_for_path(path)
    const [ok] = file.replace_contents(new TextEncoder().encode(contents), null, false, Gio.FileCreateFlags.NONE, null)
    return ok
  } catch (error) {
    console.warn(`[file-io] write failed for ${path}:`, error)
    return false
  }
}

/**
 * Pretty-print `value` as JSON (2-space indent, trailing newline) and
 * write it to `path`. See {@link writeTextFile} for error semantics.
 */
export function writeJsonFile(path: string, value: unknown): boolean {
  return writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * Write raw binary bytes to an absolute filesystem path via
 * `Gio.File.replace_contents`. Creates parent directories on
 * demand. Returns `true` on success.
 *
 * Companion to {@link writeTextFile} — used by the snapshot
 * sandbox path to land sprite-set PNGs alongside their JSON
 * descriptors when the host bundles them into the wire snapshot.
 *
 * Failures are logged via `console.warn` and surface as `false`
 * (same policy as text writes); callers decide whether to toast
 * / retry.
 */
export function writeBinaryFile(path: string, bytes: Uint8Array): boolean {
  try {
    const dir = GLib.path_get_dirname(path)
    const dirFile = Gio.File.new_for_path(dir)
    if (!dirFile.query_exists(null)) {
      dirFile.make_directory_with_parents(null)
    }
    const file = Gio.File.new_for_path(path)
    const [ok] = file.replace_contents(bytes, null, false, Gio.FileCreateFlags.NONE, null)
    return ok
  } catch (error) {
    console.warn(`[file-io] binary write failed for ${path}:`, error)
    return false
  }
}

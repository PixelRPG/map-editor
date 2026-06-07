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

/**
 * Copy a file from `srcPath` to `destPath`, creating the destination's
 * parent directories on demand and overwriting any existing file.
 * Returns `true` on success.
 *
 * Used by the sprite-set import path to land the user-picked image
 * inside the project's `spritesets/` directory. Same best-effort error
 * policy as {@link writeTextFile}.
 */
export function copyFile(srcPath: string, destPath: string): boolean {
  try {
    const dirFile = Gio.File.new_for_path(GLib.path_get_dirname(destPath))
    if (!dirFile.query_exists(null)) {
      dirFile.make_directory_with_parents(null)
    }
    const src = Gio.File.new_for_path(srcPath)
    const dest = Gio.File.new_for_path(destPath)
    return src.copy(dest, Gio.FileCopyFlags.OVERWRITE, null, null)
  } catch (error) {
    console.warn(`[file-io] copy failed ${srcPath} → ${destPath}:`, error)
    return false
  }
}

/**
 * Read a file's raw bytes via `Gio.File.load_contents`. Returns the
 * `Uint8Array` on success, or `null` on failure (logged). Used by the
 * collab sprite-set-import broadcast to base64-encode an image for the
 * wire. Companion to {@link writeBinaryFile}.
 */
export function readBinaryFile(path: string): Uint8Array | null {
  try {
    const [ok, bytes] = Gio.File.new_for_path(path).load_contents(null)
    return ok ? bytes : null
  } catch (error) {
    console.warn(`[file-io] read failed for ${path}:`, error)
    return null
  }
}

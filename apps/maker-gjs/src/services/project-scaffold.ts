import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'

/**
 * Recursively copy a starter-template project directory into a new,
 * user-chosen target directory — the "New Project" scaffold. Kept
 * separate from the window so the (headless-testable) file logic doesn't
 * pull the widget in.
 *
 * Before this, "New Project" opened the `blank-starter` template *in
 * place*, so painting on a fresh project silently overwrote the repo's
 * template files. Scaffolding a fresh copy first is the fix.
 */

/** Whether `dir` already holds a project (so we don't scaffold over one). */
export function hasProjectFile(dir: string): boolean {
  return Gio.File.new_for_path(GLib.build_filenamev([dir, 'game-project.json'])).query_exists(null)
}

/**
 * Copy every file + subdirectory of `templateDir` into `targetDir`
 * (created if missing). Returns `false` on any I/O failure. The caller
 * should have confirmed `targetDir` doesn't already contain a project
 * (see {@link hasProjectFile}).
 */
export function scaffoldProjectFrom(templateDir: string, targetDir: string): boolean {
  try {
    copyTree(Gio.File.new_for_path(templateDir), Gio.File.new_for_path(targetDir))
    return true
  } catch (error) {
    console.warn(`[ProjectScaffold] Failed to scaffold ${targetDir} from ${templateDir}:`, error)
    return false
  }
}

function copyTree(src: Gio.File, dest: Gio.File): void {
  ensureDir(dest)
  const enumerator = src.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null)
  try {
    let info = enumerator.next_file(null)
    while (info !== null) {
      const child = src.get_child(info.get_name())
      const destChild = dest.get_child(info.get_name())
      if (info.get_file_type() === Gio.FileType.DIRECTORY) {
        copyTree(child, destChild)
      } else {
        child.copy(destChild, Gio.FileCopyFlags.NONE, null, null)
      }
      info = enumerator.next_file(null)
    }
  } finally {
    enumerator.close(null)
  }
}

/** Create `dir` (with parents), treating "already exists" as success. */
function ensureDir(dir: Gio.File): void {
  try {
    dir.make_directory_with_parents(null)
  } catch (error) {
    if (error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) return
    throw error
  }
}

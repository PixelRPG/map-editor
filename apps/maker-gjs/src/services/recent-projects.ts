import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { writeJsonFile } from './file-io.ts'

/**
 * One entry in the recent-projects list — minimum needed to identify
 * + label a project without re-loading the whole `GameProjectResource`.
 */
export interface RecentProject {
  /** Absolute path to `game-project.json`. */
  path: string
  /** Display name from `game-project.json#/name` at the time of opening. */
  name: string
  /** Caption (project's `properties.description`, truncated). */
  caption: string
  /** Unix ms timestamp when the project was last opened by the user. */
  openedAt: number
}

const STORE_DIR_NAME = 'pixelrpg'
const STORE_FILE_NAME = 'recent-projects.json'
const MAX_RECENTS = 8

function storePath(): string {
  return GLib.build_filenamev([GLib.get_user_data_dir(), STORE_DIR_NAME, STORE_FILE_NAME])
}

/**
 * Read the recent-projects list from `$XDG_DATA_HOME/pixelrpg/recent-projects.json`.
 * Returns an empty list if the file is missing or malformed — the
 * welcome view shows its empty-state row in that case.
 */
export function loadRecentProjects(): RecentProject[] {
  try {
    const file = Gio.File.new_for_path(storePath())
    if (!file.query_exists(null)) return []
    const [ok, bytes] = file.load_contents(null)
    if (!ok) return []
    const text = new TextDecoder().decode(bytes)
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (entry): entry is RecentProject =>
          typeof entry === 'object' &&
          entry != null &&
          typeof (entry as RecentProject).path === 'string' &&
          typeof (entry as RecentProject).name === 'string',
      )
      .slice(0, MAX_RECENTS)
  } catch (error) {
    console.warn('[RecentProjects] Failed to read:', error)
    return []
  }
}

/**
 * Promote the project at `path` to the top of the list. De-dupes by
 * path and truncates to {@link MAX_RECENTS}. Best-effort — errors are
 * logged but never thrown back at the caller (a failed bookmarks
 * persist shouldn't break opening a project).
 */
export function recordRecentProject(entry: Omit<RecentProject, 'openedAt'>): void {
  const current = loadRecentProjects().filter((r) => r.path !== entry.path)
  const updated: RecentProject[] = [{ ...entry, openedAt: Date.now() }, ...current].slice(0, MAX_RECENTS)
  writeJsonFile(storePath(), updated)
}

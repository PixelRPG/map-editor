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
  /**
   * Scene (map) count at the time of opening — feeds the welcome row's
   * "N scenes" meta. Optional: entries written before this field existed
   * simply omit it from the label.
   */
  sceneCount?: number
  /** Unix ms timestamp when the project was last opened by the user. */
  openedAt: number
}

/**
 * A recent entry plus whether its `game-project.json` is reachable
 * right now. Derived, never persisted: a project on an unmounted drive
 * is missing today and back tomorrow, so dropping it from the file
 * would throw away a working bookmark.
 */
export interface RecentProjectEntry extends RecentProject {
  /** `true` when `path` does not currently exist. */
  missing: boolean
}

const STORE_DIR_NAME = 'pixelrpg'
const STORE_FILE_NAME = 'recent-projects.json'
const MAX_RECENTS = 8

function storePath(): string {
  return GLib.build_filenamev([GLib.get_user_data_dir(), STORE_DIR_NAME, STORE_FILE_NAME])
}

/**
 * Parse the stored JSON into well-formed entries, capped at
 * {@link MAX_RECENTS}. Anything unparseable or not array-shaped yields
 * an empty list — the welcome view shows its empty-state row then.
 * Pure (no Gio) so the shape rules are unit-testable.
 */
export function parseRecentProjects(text: string): RecentProject[] {
  try {
    const parsed: unknown = JSON.parse(text)
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
    console.warn('[RecentProjects] Failed to parse:', error)
    return []
  }
}

/**
 * Flag every entry whose project file is gone.
 *
 * This is the ONE place the list crosses from "what we recorded" to
 * "what is openable now", and it is why {@link loadRecentProjects}
 * returns {@link RecentProjectEntry} rather than the stored shape: a
 * caller cannot render a recents row without having been handed the
 * answer. Before, nothing checked, so every vanished entry got a
 * thumbnail load attempt that failed with a full stack trace — five of
 * them for a moved checkout, on every visit to the welcome view.
 *
 * `exists` is injected so the rule is testable without a filesystem.
 */
export function markMissingRecents(
  recents: readonly RecentProject[],
  exists: (path: string) => boolean,
): RecentProjectEntry[] {
  return recents.map((recent) => ({ ...recent, missing: !exists(recent.path) }))
}

/** Whether a path exists on disk right now. */
function pathExists(path: string): boolean {
  return Gio.File.new_for_path(path).query_exists(null)
}

/** Read the stored list, or `[]` when the file is missing/unreadable. */
function readStoredRecents(): RecentProject[] {
  try {
    const file = Gio.File.new_for_path(storePath())
    if (!file.query_exists(null)) return []
    const [ok, bytes] = file.load_contents(null)
    if (!ok) return []
    return parseRecentProjects(new TextDecoder().decode(bytes))
  } catch (error) {
    console.warn('[RecentProjects] Failed to read:', error)
    return []
  }
}

/**
 * Read the recent-projects list from
 * `$XDG_DATA_HOME/pixelrpg/recent-projects.json`, each entry flagged
 * with whether its project file still exists.
 */
export function loadRecentProjects(): RecentProjectEntry[] {
  return markMissingRecents(readStoredRecents(), pathExists)
}

/**
 * Promote the project at `path` to the top of the list. De-dupes by
 * path and truncates to {@link MAX_RECENTS}. Best-effort — errors are
 * logged but never thrown back at the caller (a failed bookmarks
 * persist shouldn't break opening a project).
 */
export function recordRecentProject(entry: Omit<RecentProject, 'openedAt'>): void {
  const current = readStoredRecents().filter((r) => r.path !== entry.path)
  const updated: RecentProject[] = [{ ...entry, openedAt: Date.now() }, ...current].slice(0, MAX_RECENTS)
  writeJsonFile(storePath(), updated)
}

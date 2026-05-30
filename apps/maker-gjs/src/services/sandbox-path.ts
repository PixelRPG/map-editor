/**
 * Sandbox-directory helpers for the Pair-Editing joiner flow.
 *
 * When a joiner accepts a session it does NOT need a local project
 * loaded — the host's snapshot lands in a sandboxed per-room
 * directory which the maker then opens as the active project. The
 * user's original projects on disk are never touched.
 *
 * Layout:
 *
 *   $XDG_DATA_HOME/pixelrpg-maker/shared/<roomId>/
 *     game-project.json
 *     maps/dungeon.json
 *     maps/town.json
 *     ...
 *
 * `XDG_DATA_HOME` defaults to `~/.local/share` on most desktops;
 * `GLib.get_user_data_dir()` is the GIO-portable resolver and
 * works the same inside a Flatpak sandbox (where it points at
 * the app's `~/.var/app/<app-id>/data/`).
 *
 * RoomId sanitisation: the wire-side `roomId` is base-36 generated
 * by `generateRoomId` and matches `/^[a-z0-9]{1,64}$/`, so a
 * paranoid receiver-side sanitiser is mostly belt-and-braces. We
 * still apply it (allowlist of `[A-Za-z0-9_-]`) so a malicious or
 * accidentally-broken host can't produce a path that resolves
 * outside the sandbox root.
 */

import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { applyProjectSnapshot, type ProjectSnapshot } from '@pixelrpg/engine'

import { writeTextFile } from './file-io.ts'

/** Subdirectory under `XDG_DATA_HOME` where every shared-session sandbox lives. */
export const SANDBOX_ROOT_SEGMENTS = ['pixelrpg-maker', 'shared'] as const

/**
 * Resolve the absolute path of the sandbox directory for a given
 * room. Does NOT create the directory — that happens implicitly
 * on first `writeTextFile` (which uses `make_directory_with_parents`).
 */
export function resolveSandboxDir(roomId: string): string {
  const safe = sanitiseRoomId(roomId)
  return GLib.build_filenamev([GLib.get_user_data_dir(), ...SANDBOX_ROOT_SEGMENTS, safe])
}

/**
 * Replace every character that isn't `[A-Za-z0-9_-]` with `_`.
 * The wire format already restricts roomId to that alphabet, but
 * we don't trust the host to enforce it. Exported for unit tests
 * that don't want to drag GLib in.
 */
export function sanitiseRoomId(roomId: string): string {
  if (typeof roomId !== 'string' || roomId.length === 0) return 'unnamed'
  return roomId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'unnamed'
}

/**
 * Write `snapshot` to the sandbox directory for `roomId`. Returns
 * the absolute path of the project entry file the engine should
 * load (`${sandboxDir}/${snapshot.projectFilename}`).
 *
 * Uses the engine's `applyProjectSnapshot` so we inherit the same
 * path-traversal defences (#100) — file paths in the snapshot are
 * re-validated on the wire side AND just before the actual
 * `writeFile` call.
 */
export async function writeSnapshotToSandbox(
  snapshot: ProjectSnapshot,
  roomId: string,
): Promise<string> {
  const dir = resolveSandboxDir(roomId)
  await applyProjectSnapshot(
    snapshot,
    dir,
    async (absolutePath, contents) => {
      const ok = writeTextFile(absolutePath, contents)
      if (!ok) throw new Error(`writeSnapshotToSandbox: failed to write ${absolutePath}`)
    },
    (...segments) => GLib.build_filenamev(segments),
  )
  return GLib.build_filenamev([dir, snapshot.projectFilename])
}

/**
 * Delete a sandbox directory + all its contents. Used by future
 * "leave session and discard the copy" cleanup. Idempotent — a
 * non-existent directory is a no-op success.
 *
 * Safety: refuses to operate on a path that isn't under the
 * sandbox root. The roomId-sanitiser already guarantees the
 * resolved path can't escape, but this re-checks defence-in-depth
 * (mirroring the engine's `applyProjectSnapshot` containment
 * check).
 */
export async function cleanupSandboxDir(roomId: string): Promise<void> {
  const dir = resolveSandboxDir(roomId)
  const sandboxRoot =
    GLib.build_filenamev([GLib.get_user_data_dir(), ...SANDBOX_ROOT_SEGMENTS]) + '/'
  if (!dir.startsWith(sandboxRoot)) {
    throw new Error(`cleanupSandboxDir: refusing to delete outside sandbox root (got "${dir}")`)
  }
  const file = Gio.File.new_for_path(dir)
  if (!file.query_exists(null)) return
  try {
    // Walk the directory tree and delete children before deleting
    // the directory itself — Gio.File.delete_recursive doesn't
    // exist as a single call.
    deleteRecursive(file)
  } catch (error) {
    console.warn(`[sandbox-path] cleanup failed for ${dir}:`, error)
  }
}

function deleteRecursive(file: Gio.File): void {
  const info = file.query_info('standard::*', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null)
  if (info.get_file_type() === Gio.FileType.DIRECTORY) {
    const enumerator = file.enumerate_children(
      'standard::name',
      Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
      null,
    )
    let childInfo: Gio.FileInfo | null
    while ((childInfo = enumerator.next_file(null)) !== null) {
      const child = file.get_child(childInfo.get_name())
      deleteRecursive(child)
    }
    enumerator.close(null)
  }
  file.delete(null)
}

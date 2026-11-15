import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import type { AtlasCamera } from '@pixelrpg/gjs'

import { writeJsonFile } from './file-io.ts'

/**
 * Where each project's last atlas camera is remembered, keyed by the
 * absolute path of its `game-project.json`.
 *
 * Deliberately NOT part of `MapEditorData` / the project file: the
 * camera is this user's view of the world on this machine, not project
 * content, so it must not show up as a diff in a shared repo or ride
 * the `__project/map.editor-data` op to a collaborator who is looking
 * somewhere else entirely. Same reasoning as the scene editor's
 * viewport inset (REDESIGN.md step 3.2).
 */
export type AtlasCameraMap = Record<string, AtlasCamera>

const STORE_DIR_NAME = 'pixelrpg'
const STORE_FILE_NAME = 'atlas-cameras.json'

/**
 * How many projects keep a remembered camera. The entries are tiny, but
 * the file would otherwise grow for every project ever opened, including
 * ones long deleted. Eviction is by insertion order, so the project
 * saved least recently goes first.
 */
const MAX_PROJECTS = 32

function storePath(): string {
  return GLib.build_filenamev([GLib.get_user_data_dir(), STORE_DIR_NAME, STORE_FILE_NAME])
}

/** Whether `value` is a complete, finite camera triple. */
function isAtlasCamera(value: unknown): value is AtlasCamera {
  if (typeof value !== 'object' || value == null) return false
  const camera = value as AtlasCamera
  return Number.isFinite(camera.zoom) && Number.isFinite(camera.scrollX) && Number.isFinite(camera.scrollY)
}

/**
 * Parse the stored JSON into well-formed entries. Anything unparseable,
 * not object-shaped, or carrying a partial camera is dropped — a bad
 * entry means the atlas opens at Fit, which is the same as never having
 * saved one. Pure (no Gio) so the shape rules are unit-testable.
 */
export function parseAtlasCameras(text: string): AtlasCameraMap {
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) return {}
    const cameras: AtlasCameraMap = {}
    for (const [path, camera] of Object.entries(parsed)) {
      if (isAtlasCamera(camera)) {
        cameras[path] = { zoom: camera.zoom, scrollX: camera.scrollX, scrollY: camera.scrollY }
      }
    }
    return cameras
  } catch (error) {
    console.warn('[AtlasCameraStore] Failed to parse:', error)
    return {}
  }
}

/**
 * Record `camera` for `path`, evicting the oldest entries past
 * {@link MAX_PROJECTS}. Re-saving a project moves it to the end, so the
 * cap drops projects by how long ago they were last looked at rather
 * than when they were first opened.
 */
export function withAtlasCamera(cameras: AtlasCameraMap, path: string, camera: AtlasCamera): AtlasCameraMap {
  const entries = Object.entries(cameras).filter(([key]) => key !== path)
  entries.push([path, camera])
  return Object.fromEntries(entries.slice(-MAX_PROJECTS))
}

/** Read the stored map, or `{}` when the file is missing/unreadable. */
function readStoredCameras(): AtlasCameraMap {
  try {
    const file = Gio.File.new_for_path(storePath())
    if (!file.query_exists(null)) return {}
    const [ok, bytes] = file.load_contents(null)
    if (!ok) return {}
    return parseAtlasCameras(new TextDecoder().decode(bytes))
  } catch (error) {
    console.warn('[AtlasCameraStore] Failed to read:', error)
    return {}
  }
}

/**
 * The remembered camera for the project at `path`, or `null` when none
 * was saved — the atlas opens at Fit then.
 */
export function loadAtlasCamera(path: string): AtlasCamera | null {
  return readStoredCameras()[path] ?? null
}

/**
 * Remember where the user left the atlas for the project at `path`.
 * Best-effort: a failed write is logged by the file layer and otherwise
 * ignored, since losing a camera costs one Fit.
 */
export function saveAtlasCamera(path: string, camera: AtlasCamera): void {
  writeJsonFile(storePath(), withAtlasCamera(readStoredCameras(), path, camera))
}

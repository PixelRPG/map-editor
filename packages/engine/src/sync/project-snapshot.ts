/**
 * Project-snapshot wire shape — what the host transmits to a joiner
 * so it can edit the same project without having a local copy.
 *
 * The snapshot is **schema-only**: it carries the JSON describing
 * the project + each map, but NOT the binary assets (sprite-set
 * PNGs, audio, etc.). v1 assumes both peers have the same baseline
 * asset bundle available (the built-in scientist sprite + any
 * standard assets shipped with the maker). When the joiner opens
 * the snapshot and a referenced asset is missing, the engine logs
 * a warning + falls back to placeholder graphics — the edit
 * session still works, only the visuals degrade.
 *
 * Why a separate snapshot type instead of "open the project's
 * folder over the wire"? The wire shape is a plain object with
 * exactly the fields the joiner needs to re-create the project on
 * disk, with no I/O ordering questions (which file does the maker
 * load first? what's the relative path layout?). The joiner just
 * iterates and writes.
 *
 * Wire-protocol compatibility: every breaking change bumps
 * `version`. Receivers reject snapshots with an unknown version
 * so a future v2 host doesn't silently corrupt a v1 joiner.
 */

import type { Engine } from '../engine.ts'
import { GameProjectFormat } from '../format/GameProjectFormat.ts'
import { MapFormat } from '../format/MapFormat.ts'
import type { GameProjectData, MapData } from '../types/index.ts'

export const PROJECT_SNAPSHOT_VERSION = 1

export interface ProjectSnapshot {
  /** Schema version. Receivers reject mismatched versions. */
  version: typeof PROJECT_SNAPSHOT_VERSION
  /**
   * Filename the joiner should write the GameProjectData under
   * (relative to the sandbox target directory). Carried explicitly
   * so the joiner doesn't have to derive it from project metadata.
   * Defaults to `game-project.json` on the host.
   */
  projectFilename: string
  /** Top-level project descriptor. */
  project: GameProjectData
  /**
   * Per-map JSON payload keyed by the `path` field of the matching
   * `MapReference` inside `project.maps[]`. Caller writes each
   * `data` to `${targetDir}/${path}`.
   */
  maps: Array<{ path: string; data: MapData }>
}

/**
 * Capture the current project state as a {@link ProjectSnapshot}.
 *
 * Returns `null` when no project is loaded — caller should refuse
 * to host a session in that case (there is nothing to share).
 *
 * Pure read-only operation; safe to call mid-edit. The returned
 * object holds references to the engine's in-memory data — copy
 * before mutating (or `JSON.parse(JSON.stringify(...))` if a true
 * snapshot semantics is needed).
 */
export function captureProjectSnapshot(engine: Engine): ProjectSnapshot | null {
  const resource = engine.gameProjectResource
  if (!resource) return null
  const project = resource.data
  if (!project) return null

  const maps: ProjectSnapshot['maps'] = []
  for (const ref of project.maps) {
    const mapResource = resource.getMapResource(ref.id)
    if (!mapResource) {
      // Map is referenced by the project but hasn't been loaded.
      // Snapshot would be incomplete — refuse to capture rather
      // than ship a half-state.
      throw new Error(
        `captureProjectSnapshot: map "${ref.id}" referenced by project but not loaded — ` +
          `call engine.loadMap(id) first or check the project file for stale references.`,
      )
    }
    maps.push({ path: ref.path, data: mapResource.mapData })
  }

  return {
    version: PROJECT_SNAPSHOT_VERSION,
    projectFilename: 'game-project.json',
    project,
    maps,
  }
}

/**
 * Serialize a snapshot for the wire. Uses the project's normal
 * Format classes so the same JSON dialect ships over the wire as
 * lands on disk.
 */
export function serializeProjectSnapshot(snapshot: ProjectSnapshot): string {
  return JSON.stringify({
    version: snapshot.version,
    projectFilename: snapshot.projectFilename,
    project: snapshot.project,
    maps: snapshot.maps,
  })
}

/**
 * Parse + validate a snapshot received from the wire. Throws on
 * malformed shape or unknown version.
 */
export function parseProjectSnapshot(raw: string): ProjectSnapshot {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`parseProjectSnapshot: invalid JSON (${(err as Error).message})`)
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('parseProjectSnapshot: not an object')
  }
  const obj = parsed as Partial<ProjectSnapshot>
  if (obj.version !== PROJECT_SNAPSHOT_VERSION) {
    throw new Error(
      `parseProjectSnapshot: unsupported version ${String(obj.version)} (expected ${PROJECT_SNAPSHOT_VERSION})`,
    )
  }
  if (typeof obj.projectFilename !== 'string' || obj.projectFilename.length === 0) {
    throw new Error('parseProjectSnapshot: missing projectFilename')
  }
  if (!obj.project || typeof obj.project !== 'object') {
    throw new Error('parseProjectSnapshot: missing project')
  }
  if (!Array.isArray(obj.maps)) {
    throw new Error('parseProjectSnapshot: maps must be an array')
  }
  for (const m of obj.maps) {
    if (!m || typeof m !== 'object' || typeof m.path !== 'string' || !m.data) {
      throw new Error('parseProjectSnapshot: malformed maps entry')
    }
  }
  return obj as ProjectSnapshot
}

/**
 * Function the caller supplies for writing a file. Async + path-
 * relative — `applyProjectSnapshot` resolves all paths against the
 * target sandbox directory before calling.
 */
export type SnapshotWriteFile = (absolutePath: string, contents: string) => Promise<void>

/**
 * Path-joiner the caller supplies. Decoupled from a specific I/O
 * binding so this module stays platform-agnostic — the maker (GJS)
 * passes `Gio.File`-based composition; tests pass a POSIX
 * stringifier.
 */
export type SnapshotPathJoin = (...segments: string[]) => string

/**
 * Write every file in the snapshot to `targetDir`. Mutates nothing
 * in memory — the only side effect is the `writeFile` invocations.
 *
 * After this resolves, the caller can hand `targetDir` to
 * `engine.loadProject(targetDir/projectFilename)` to actually load
 * the sandbox project.
 */
export async function applyProjectSnapshot(
  snapshot: ProjectSnapshot,
  targetDir: string,
  writeFile: SnapshotWriteFile,
  joinPath: SnapshotPathJoin,
): Promise<void> {
  // Project descriptor first — it's the entry point the engine
  // loads, and writing it last would leave a half-state if a map
  // write fails mid-loop.
  const projectPath = joinPath(targetDir, snapshot.projectFilename)
  await writeFile(projectPath, GameProjectFormat.serialize(snapshot.project))

  for (const entry of snapshot.maps) {
    const mapPath = joinPath(targetDir, entry.path)
    await writeFile(mapPath, MapFormat.serialize(entry.data))
  }
}

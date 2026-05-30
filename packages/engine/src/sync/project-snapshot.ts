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
 * Reject path strings that could escape a sandbox directory or
 * smuggle filesystem control characters.
 *
 * The snapshot wire format carries paths supplied by a REMOTE peer
 * over WebRTC — a malicious / compromised peer must not be able to
 * make the receiver write to `../../etc/passwd`,
 * `C:\Windows\system32\foo`, or `/dev/null`. All path attacks here
 * are filesystem-write attacks; there's no read leakage to worry
 * about because the only operation the snapshot drives is
 * `writeFile`.
 *
 * Rules:
 *
 *  - Reject empty paths.
 *  - Reject absolute paths: POSIX leading `/`, Windows leading
 *    `\\` (UNC), or `<drive>:` prefixes.
 *  - Reject any `..` segment after splitting on `/` or `\` — this
 *    is the simple parent-directory escape.
 *  - Reject any NUL byte (`\0`) — some filesystem APIs truncate at
 *    NUL, so a string like `"safe.json\0/etc/passwd"` could land
 *    in the wrong place depending on the writer.
 *  - Reject backslashes entirely. We always emit `/` separators
 *    on the wire (POSIX-style), so a `\` is either an attempt to
 *    smuggle a Windows path or a parser quirk we don't want to
 *    inherit.
 *
 *  Throws on rejection with a path-tagged message so callers can
 *  surface "snapshot rejected: unsafe path …" cleanly.
 */
function assertSafeRelativePath(path: string, field: string): void {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error(`parseProjectSnapshot: ${field} must be a non-empty string`)
  }
  if (path.includes('\0')) {
    throw new Error(`parseProjectSnapshot: ${field} contains a NUL byte`)
  }
  if (path.includes('\\')) {
    throw new Error(`parseProjectSnapshot: ${field} contains a backslash`)
  }
  if (path.startsWith('/')) {
    throw new Error(`parseProjectSnapshot: ${field} must be relative, got absolute "${path}"`)
  }
  if (/^[A-Za-z]:/.test(path)) {
    throw new Error(`parseProjectSnapshot: ${field} must be relative, got drive-letter "${path}"`)
  }
  const segments = path.split('/')
  for (const segment of segments) {
    if (segment === '..') {
      throw new Error(`parseProjectSnapshot: ${field} contains a parent-directory segment ("${path}")`)
    }
  }
}

/**
 * `projectFilename` carries the entry point — it MUST be a single
 * path component, no separators at all. The docstring on
 * `ProjectSnapshot.projectFilename` already says "filename"; this
 * enforces that contract instead of trusting the wire.
 */
function assertProjectFilename(filename: string): void {
  assertSafeRelativePath(filename, 'projectFilename')
  if (filename.includes('/')) {
    throw new Error(`parseProjectSnapshot: projectFilename must be a single segment, got "${filename}"`)
  }
}

/**
 * Parse + validate a snapshot received from the wire. Throws on
 * malformed shape, unknown version, or path-traversal attempts.
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
  if (typeof obj.projectFilename !== 'string') {
    throw new Error('parseProjectSnapshot: missing projectFilename')
  }
  assertProjectFilename(obj.projectFilename)
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
    assertSafeRelativePath(m.path, `maps[].path`)
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
 *
 * Defence-in-depth: `parseProjectSnapshot` already rejected unsafe
 * paths on the wire, but the snapshot may also be constructed in-
 * process (caller passes a literal). Re-validate here so EVERY
 * `writeFile` call is guaranteed safe regardless of how the
 * snapshot reached us. The caller-supplied `joinPath` is also re-
 * inspected with the same rules in case it returns something that
 * normalises to outside `targetDir` (e.g. naive `${a}/${b}` with
 * `b = "../etc/passwd"`).
 */
export async function applyProjectSnapshot(
  snapshot: ProjectSnapshot,
  targetDir: string,
  writeFile: SnapshotWriteFile,
  joinPath: SnapshotPathJoin,
): Promise<void> {
  // Pre-flight: the snapshot may have been constructed locally
  // (parseProjectSnapshot wouldn't have run), so re-assert every
  // path is sandbox-safe BEFORE any I/O.
  assertProjectFilename(snapshot.projectFilename)
  for (const entry of snapshot.maps) {
    assertSafeRelativePath(entry.path, 'maps[].path')
  }

  // Project descriptor first — it's the entry point the engine
  // loads, and writing it last would leave a half-state if a map
  // write fails mid-loop.
  const projectPath = joinPath(targetDir, snapshot.projectFilename)
  assertStaysInside(targetDir, projectPath, 'projectFilename')
  await writeFile(projectPath, GameProjectFormat.serialize(snapshot.project))

  for (const entry of snapshot.maps) {
    const mapPath = joinPath(targetDir, entry.path)
    assertStaysInside(targetDir, mapPath, `maps[${entry.path}]`)
    await writeFile(mapPath, MapFormat.serialize(entry.data))
  }
}

/**
 * Verify `joinedPath` is still under `targetDir`. Catches a buggy
 * or hostile `joinPath` callback that produces a path-traversal
 * even from a sandbox-safe relative input.
 *
 * Comparison is **string-prefix** with a trailing-separator
 * guard — both inputs are normalised to use `/` separators and
 * the targetDir gets a trailing `/` appended if missing. This is
 * weaker than a fully-resolved-on-disk check but matches what we
 * can do in a platform-agnostic engine layer (no `realpath`, no
 * `Gio.File`). The CALLER is expected to use a sensible joinPath
 * — this is the last-ditch tripwire for the case where they don't.
 */
function assertStaysInside(targetDir: string, joinedPath: string, field: string): void {
  const normTarget = targetDir.replace(/\\/g, '/').replace(/\/+$/, '') + '/'
  const normJoined = joinedPath.replace(/\\/g, '/')
  if (!normJoined.startsWith(normTarget)) {
    throw new Error(
      `applyProjectSnapshot: ${field} resolved outside targetDir (target="${targetDir}", got="${joinedPath}")`,
    )
  }
}

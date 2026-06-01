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
import { SpriteSetFormat } from '../format/SpriteSetFormat.ts'
import type { GameProjectData, MapData, SpriteSetData } from '../types/index.ts'

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
  /**
   * Per-sprite-set JSON payload keyed by the `path` field of the
   * matching `SpriteSetReference` inside `project.spriteSets[]`.
   * Caller writes each `data` to `${targetDir}/${path}`.
   *
   * Optional for wire-format backwards compatibility — older hosts
   * (pre-2026-06-01) didn't include sprite-sets in the snapshot,
   * which left the joiner's sandbox project broken because every
   * map references sprite-sets that the joiner couldn't load
   * (`/spritesets/<id>.json` 404 on disk). 2026-06-01 hand-test:
   *
   *   [Error]: Failed to load sprite set: FetchError: request to
   *            file:///…/shared/<roomId>/spritesets/<id>.json failed,
   *            reason: GLib.FileError: … nicht gefunden
   *
   * The receiver path treats missing `spriteSets` as `[]` for
   * old-host compatibility; the writer path always emits it.
   */
  spriteSets: Array<{ path: string; data: SpriteSetData }>
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

  // Per-spriteset JSON. Every entry from `project.spriteSets[]`
  // MUST resolve through the resource map — a missing entry means
  // the host hasn't loaded its own project yet (sprite-sets are
  // loaded eagerly at project-open time) and shipping the snapshot
  // would leave the joiner with broken sandbox references. The
  // 2026-06-01 hand-test failed exactly here: snapshot arrived
  // without sprite-sets, joiner's `loadProject` choked on a
  // `FetchError: spritesets/<id>.json … nicht gefunden`.
  //
  // `engine.gameProjectResource.spriteSets` is the in-memory
  // Map<id, SpriteSetResource> populated by `loadProject`. Use
  // its sync access (the `getSpriteSet(id)` async wrapper exists
  // for callers that want a Promise — we already have the Map).
  const spriteSets: ProjectSnapshot['spriteSets'] = []
  for (const ref of project.spriteSets) {
    const spriteSetResource = resource.spriteSets.get(ref.id)
    if (!spriteSetResource) {
      throw new Error(
        `captureProjectSnapshot: sprite-set "${ref.id}" referenced by project but not loaded — ` +
          `call engine.loadProject(...) first or check the project file for stale references.`,
      )
    }
    spriteSets.push({ path: ref.path, data: spriteSetResource.data })
  }

  return {
    version: PROJECT_SNAPSHOT_VERSION,
    projectFilename: 'game-project.json',
    project,
    maps,
    spriteSets,
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
    spriteSets: snapshot.spriteSets,
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
  // `spriteSets` is required on the wire format from 2026-06-01
  // onward, but missing on older snapshots — treat as an empty
  // array to stay backwards-compatible with hosts running a
  // pre-fix engine. A new host always emits it.
  if (obj.spriteSets === undefined) {
    obj.spriteSets = []
  } else if (!Array.isArray(obj.spriteSets)) {
    throw new Error('parseProjectSnapshot: spriteSets must be an array (or omitted)')
  } else {
    for (const s of obj.spriteSets) {
      if (!s || typeof s !== 'object' || typeof s.path !== 'string' || !s.data) {
        throw new Error('parseProjectSnapshot: malformed spriteSets entry')
      }
      assertSafeRelativePath(s.path, `spriteSets[].path`)
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
  for (const entry of snapshot.spriteSets ?? []) {
    assertSafeRelativePath(entry.path, 'spriteSets[].path')
  }

  // Project descriptor first — it's the entry point the engine
  // loads, and writing it last would leave a half-state if a map
  // write fails mid-loop. The caller is responsible for not
  // initiating the engine load until this function's promise
  // resolves — at that point sprite-sets + maps are on disk too.
  const projectPath = joinPath(targetDir, snapshot.projectFilename)
  assertStaysInside(targetDir, projectPath, 'projectFilename')
  await writeFile(projectPath, GameProjectFormat.serialize(snapshot.project))

  for (const entry of snapshot.maps) {
    const mapPath = joinPath(targetDir, entry.path)
    assertStaysInside(targetDir, mapPath, `maps[${entry.path}]`)
    await writeFile(mapPath, MapFormat.serialize(entry.data))
  }

  // Sprite-sets after maps. Without these, every map's tile
  // graphics fail to resolve at engine-load time (2026-06-01
  // hand-test: `FetchError: spritesets/<id>.json … nicht
  // gefunden`). Pre-fix the snapshot only included maps;
  // post-fix the host emits the full set + the receiver writes
  // them alongside.
  for (const entry of snapshot.spriteSets ?? []) {
    const spriteSetPath = joinPath(targetDir, entry.path)
    assertStaysInside(targetDir, spriteSetPath, `spriteSets[${entry.path}]`)
    await writeFile(spriteSetPath, SpriteSetFormat.serialize(entry.data))
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

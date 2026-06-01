/**
 * Project-snapshot wire shape — what the host transmits to a joiner
 * so it can edit the same project without having a local copy.
 *
 * The snapshot carries the JSON describing the project + each map
 * + each sprite-set, AND the binary sprite-set images (PNGs) the
 * sprite-sets reference, base64-encoded inline in the JSON wire
 * frame. `data:` / `http(s)://` / `file://` URL refs (e.g. the
 * engine-bundled scientist starter, which uses an inline data
 * URL) skip the on-disk read — both peers already have the value
 * via the bundled JSON itself.
 *
 * Pre-2026-06-01 the snapshot was schema-only and assumed both
 * peers shared a baseline asset bundle. For LAN Pair-Editing the
 * assumption is wrong — the joiner has no local copy of the host's
 * project — so the missing PNGs surfaced as: (a) silent fetch
 * failures inside Excalibur's `ImageSource`, (b) libxml2
 * `Entity: line 14: parser error : Extra content at the end of the
 * document` noise on stderr (GdkPixbuf's format-detector retried
 * the 404 body as SVG, librsvg parsed it as XML, found JSON), and
 * (c) a hung joiner UI with no visible toast.
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
import { base64ToBytes, bytesToBase64 } from '../utils/base64.ts'
import { loadBinaryFile } from '../utils/file.ts'
import { isAbsoluteOrUrl, joinPaths } from '../utils/url.ts'

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
   * Per-sprite-set entry: the JSON descriptor plus any binary
   * images the descriptor references (typically the single PNG
   * pointed at by `data.image.path`).
   *
   * `path` — the sprite-set JSON's location relative to the
   * project root, matching the `SpriteSetReference.path` field
   * inside `project.spriteSets[]`. Caller writes `data` to
   * `${targetDir}/${path}`.
   *
   * `images` — base64-encoded binaries. Each entry's `path` is
   * the on-disk path RELATIVE TO THE SPRITE-SET JSON's directory
   * (matching `data.image.path` verbatim) so the receiver can
   * reconstruct the same on-disk layout. Empty / absent for
   * sprite-sets whose `data.image.path` is a `data:`/URL ref —
   * those carry the bytes inline in the JSON itself and don't
   * need a separate transfer.
   *
   * Optional for wire-format backwards compatibility — older hosts
   * (pre-2026-06-01) didn't include sprite-sets at all, then
   * didn't include images. A new receiver treats both missing
   * fields as empty arrays.
   */
  spriteSets: Array<{
    path: string
    data: SpriteSetData
    images?: Array<{ path: string; base64: string }>
  }>
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
export async function captureProjectSnapshot(engine: Engine): Promise<ProjectSnapshot | null> {
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

  // Per-spriteset JSON + binary images. Every entry from
  // `project.spriteSets[]` MUST resolve through the resource map
  // — a missing entry means the host hasn't loaded its own
  // project yet (sprite-sets are loaded eagerly at project-open
  // time) and shipping the snapshot would leave the joiner with
  // broken sandbox references.
  //
  // For each loaded sprite-set we ALSO read the referenced PNG
  // off disk and base64-encode it inline. Without the binary the
  // joiner's sandbox has the JSON descriptor but no pixels — the
  // 2026-06-01 hand-test surfaced this as a hang on the joiner
  // (Excalibur's `ImageSource.load()` plus GdkPixbuf's SVG-fallback
  // path on the 404 body).
  //
  // `data:`/`http(s)://`/`file://` URLs in `data.image.path` are
  // skipped — the bytes are already inside the JSON (engine-
  // bundled scientist sprite via data URL) or reachable over the
  // network from any peer.
  //
  // `engine.gameProjectResource.spriteSets` is the in-memory
  // Map<id, SpriteSetResource> populated by `loadProject`.
  const spriteSets: ProjectSnapshot['spriteSets'] = []
  for (const ref of project.spriteSets) {
    const spriteSetResource = resource.spriteSets.get(ref.id)
    if (!spriteSetResource) {
      throw new Error(
        `captureProjectSnapshot: sprite-set "${ref.id}" referenced by project but not loaded — ` +
          `call engine.loadProject(...) first or check the project file for stale references.`,
      )
    }
    const data = spriteSetResource.data
    const images: Array<{ path: string; base64: string }> = []
    if (data.image && !isAbsoluteOrUrl(data.image.path)) {
      const imageDiskPath = joinPaths(spriteSetResource.imageBasePath, data.image.path)
      try {
        const bytes = await loadBinaryFile(imageDiskPath)
        images.push({ path: data.image.path, base64: bytesToBase64(bytes) })
      } catch (err) {
        // Failure here is fatal for the snapshot — the joiner cannot
        // render this sprite-set without the bytes. Surface a typed
        // error so the host-side `respondToRequest` can decline the
        // request cleanly (timeout on the joiner) rather than ship
        // a half-state snapshot.
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(
          `captureProjectSnapshot: failed to read sprite-set image "${imageDiskPath}" ` +
            `for sprite-set "${ref.id}": ${msg}`,
        )
      }
    }
    spriteSets.push({ path: ref.path, data, images })
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
      // Binary images: optional. Validate shape + path safety + that
      // base64 looks like base64 (cheap surface check — full decode
      // happens at apply time). Receiver-side strictness keeps a
      // malicious or buggy host from smuggling absolute paths or
      // non-base64 garbage through.
      if (s.images === undefined) {
        s.images = []
      } else if (!Array.isArray(s.images)) {
        throw new Error('parseProjectSnapshot: spriteSets[].images must be an array (or omitted)')
      } else {
        for (const img of s.images) {
          if (!img || typeof img !== 'object' || typeof img.path !== 'string' || typeof img.base64 !== 'string') {
            throw new Error('parseProjectSnapshot: malformed spriteSets[].images entry')
          }
          assertSafeRelativePath(img.path, `spriteSets[].images[].path`)
          // base64 alphabet check — RFC 4648 standard `[A-Za-z0-9+/=]`.
          // An empty string is allowed (corner case: a zero-byte
          // image), but any other invalid character fails fast.
          if (img.base64.length > 0 && !/^[A-Za-z0-9+/=]+$/.test(img.base64)) {
            throw new Error(
              `parseProjectSnapshot: spriteSets[].images[].base64 contains non-base64 characters`,
            )
          }
        }
      }
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
 * Function the caller supplies for writing a binary file. Used by
 * the sprite-set image transfer path — applyProjectSnapshot
 * decodes the base64 payload and hands the raw bytes here. Caller
 * is responsible for creating parent directories.
 *
 * Optional on {@link applyProjectSnapshot}: a snapshot with no
 * `images` entries (older host, or all sprite-sets use
 * `data:`/URL refs) can be applied with text-only writers. When
 * `images` ARE present and `writeBinaryFile` is omitted,
 * applyProjectSnapshot throws — silent skip would leave the
 * joiner with the same missing-PNG state that motivated this
 * field in the first place.
 */
export type SnapshotWriteBinaryFile = (absolutePath: string, bytes: Uint8Array) => Promise<void>

/**
 * Path-joiner the caller supplies. Decoupled from a specific I/O
 * binding so this module stays platform-agnostic — the maker (GJS)
 * passes `Gio.File`-based composition; tests pass a POSIX
 * stringifier.
 */
export type SnapshotPathJoin = (...segments: string[]) => string

/**
 * Path-dirname the caller supplies. Used to resolve a sprite-set
 * image's on-disk location: the image's `path` field is relative
 * to the sprite-set JSON's directory, so we need `dirname(spriteSetPath)`
 * plus `image.path` to get the absolute target. Default
 * implementation strips the last `/`-separated segment — sufficient
 * for the snapshot's normalised wire paths (always `/`).
 */
export type SnapshotPathDirname = (path: string) => string

function defaultDirname(path: string): string {
  const idx = path.replace(/\\/g, '/').lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx)
}

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
  writeBinaryFile?: SnapshotWriteBinaryFile,
  dirname: SnapshotPathDirname = defaultDirname,
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
    for (const img of entry.images ?? []) {
      assertSafeRelativePath(img.path, 'spriteSets[].images[].path')
    }
  }
  // Fail fast if the snapshot carries binary payloads but no
  // binary writer was provided — silently skipping would
  // reproduce the pre-fix "joiner has JSON but no PNG" bug.
  const needsBinary = (snapshot.spriteSets ?? []).some((s) => (s.images ?? []).length > 0)
  if (needsBinary && !writeBinaryFile) {
    throw new Error(
      'applyProjectSnapshot: snapshot has binary images but no writeBinaryFile callback was supplied',
    )
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

    // Binary images sit alongside the sprite-set JSON; the path
    // recorded in `images[].path` is RELATIVE to the JSON's
    // directory (mirrors `data.image.path`), so join with the
    // JSON's dirname rather than `targetDir` directly.
    const spriteSetDir = dirname(spriteSetPath)
    for (const img of entry.images ?? []) {
      const imagePath = joinPath(spriteSetDir, img.path)
      assertStaysInside(targetDir, imagePath, `spriteSets[${entry.path}].images[${img.path}]`)
      // base64 decode happens at apply time; parseProjectSnapshot
      // already validated the alphabet, but a base64 with the
      // right characters can still mis-decode (e.g. wrong padding)
      // — let any throw bubble up so the joiner aborts the open.
      const bytes = base64ToBytes(img.base64)
      // The needsBinary precheck above guarantees writeBinaryFile
      // is defined when images.length > 0.
      await writeBinaryFile!(imagePath, bytes)
    }
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

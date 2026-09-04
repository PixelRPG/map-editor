/**
 * Path safety for the project-snapshot transfer.
 *
 * Every path in a snapshot was supplied by a REMOTE peer over WebRTC and
 * is used for exactly one operation on the receiving side: `writeFile`.
 * So all attacks here are filesystem-WRITE attacks — a malicious or
 * compromised peer must not be able to make the joiner write to
 * `../../etc/passwd`, `C:\Windows\system32\foo`, or `/dev/null`. There
 * is no read-leak surface to defend.
 *
 * Two layers, both needed: {@link assertSafeRelativePath} rejects the
 * wire value, and {@link assertStaysInside} re-checks the path the
 * caller's own `joinPath` produced from it — a snapshot can also be
 * constructed in-process (never passing through `parseProjectSnapshot`),
 * and a naive `${a}/${b}` join can escape even from a safe relative
 * input.
 */

/**
 * Reject path strings that could escape a sandbox directory or smuggle
 * filesystem control characters.
 *
 * Rules:
 *
 *  - Reject empty paths.
 *  - Reject absolute paths: POSIX leading `/`, Windows leading `\\`
 *    (UNC), or `<drive>:` prefixes.
 *  - Reject any `..` segment after splitting on `/` — the simple
 *    parent-directory escape.
 *  - Reject any NUL byte (`\0`) — some filesystem APIs truncate at NUL,
 *    so `"safe.json\0/etc/passwd"` could land in the wrong place
 *    depending on the writer.
 *  - Reject backslashes entirely. The wire always carries `/`
 *    separators, so a `\` is either a smuggled Windows path or a parser
 *    quirk we don't want to inherit.
 *
 * Throws with a path-tagged message so callers can surface "snapshot
 * rejected: unsafe path …" cleanly.
 */
export function assertSafeRelativePath(path: string, field: string): void {
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
  for (const segment of path.split('/')) {
    if (segment === '..') {
      throw new Error(`parseProjectSnapshot: ${field} contains a parent-directory segment ("${path}")`)
    }
  }
}

/**
 * `projectFilename` carries the entry point — it MUST be a single path
 * component, no separators at all. The docstring on
 * `ProjectSnapshot.projectFilename` already says "filename"; this
 * enforces that contract instead of trusting the wire.
 */
export function assertProjectFilename(filename: string): void {
  assertSafeRelativePath(filename, 'projectFilename')
  if (filename.includes('/')) {
    throw new Error(`parseProjectSnapshot: projectFilename must be a single segment, got "${filename}"`)
  }
}

/**
 * Verify `joinedPath` is still under `targetDir`. Catches a buggy or
 * hostile `joinPath` callback that produces a path-traversal even from a
 * sandbox-safe relative input.
 *
 * Comparison is **string-prefix** with a trailing-separator guard — both
 * inputs are normalised to `/` separators and `targetDir` gets a
 * trailing `/` if missing. Weaker than a fully-resolved on-disk check,
 * but it is what a platform-agnostic engine layer can do (no `realpath`,
 * no `Gio.File`). The CALLER is expected to use a sensible `joinPath`;
 * this is the last-ditch tripwire for when they don't.
 */
export function assertStaysInside(targetDir: string, joinedPath: string, field: string): void {
  const normTarget = `${targetDir.replace(/\\/g, '/').replace(/\/+$/, '')}/`
  const normJoined = joinedPath.replace(/\\/g, '/')
  if (!normJoined.startsWith(normTarget)) {
    throw new Error(
      `applyProjectSnapshot: ${field} resolved outside targetDir (target="${targetDir}", got="${joinedPath}")`,
    )
  }
}

/**
 * Strip the last `/`-separated segment. Default `dirname` for the
 * snapshot's normalised wire paths, which always use `/`.
 */
export function snapshotDirname(path: string): string {
  const idx = path.replace(/\\/g, '/').lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx)
}

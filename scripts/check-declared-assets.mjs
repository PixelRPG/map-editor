#!/usr/bin/env node
/**
 * Declared-asset guard.
 *
 * `package.json#gjsify` blocks (`flatpak`, `ship`, `storybook`) declare
 * SOURCE files by path — an icon, a gschema, a licence file, a directory of
 * fonts. Nothing ever checked that those paths resolve. This bit for real:
 * `apps/maker-gjs/package.json#gjsify.flatpak.icon` pointed at
 * `data/icons/hicolor/scalable/apps/org.pixelrpg.maker.svg`, which never
 * existed — `data/icons/` only ever held three symbolic action icons. Every
 * packaged build, the Flatpak included, installed with no application icon,
 * and nothing reported it; a human found it by reading the file.
 *
 * This guard fails (exit 1) if a declared asset path — see
 * `CHECKED_ASSET_FIELDS` below — does not resolve to a real file or
 * directory relative to the package that declares it.
 *
 * What it deliberately does NOT check (a wrong answer here is worse than no
 * check, because a check that flags build output as "missing" gets disabled
 * within a week — see `DELIBERATELY_SKIPPED` below for the full list and the
 * reasoning behind each entry):
 *  - fields that are identifiers, URLs or glob patterns applied inside a
 *    build sandbox, not local filesystem paths (`appId`, `command`,
 *    `iconRemote`, `homepageUrl`, `*.cleanup`, …) — these are excluded by
 *    simply not being in `CHECKED_ASSET_FIELDS`, not by heuristics on the
 *    string value (a heuristic like "contains a slash" would also flag a
 *    reverse-DNS-ish path segment or misfire on a Windows-style value; an
 *    explicit field allowlist can't be fooled that way).
 *  - `gjsify.ship.bundle` / `outDir` / `localeDir` — these name a BUILD
 *    OUTPUT (the bundled entry point, the packaging output root, the
 *    compiled `.mo` catalogue directory) that a clean checkout never has;
 *    requiring them to pre-exist would make the guard fail right after
 *    `git clone`.
 *  - `gjsify.ship.bundledTypelibs` — paths into `node_modules/@gjsify/*`
 *    prebuilds; existence depends on install state, not the committed
 *    source tree.
 *
 * Runs in CI (Node is already provisioned for the gjsify CLI bootstrap) and
 * locally via `node scripts/check-declared-assets.mjs` at the workspace
 * root.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Dot-path patterns (relative to a package's `gjsify` block) whose STRING
 * VALUE is a project-relative path to a source file/directory that must
 * exist. `'*'` matches any single object key (used for `extraFiles`, a
 * `Record<destination, source>` — the destination prefixes are arbitrary,
 * only the source values are paths).
 *
 * Grounded in `@gjsify/cli`'s `ConfigDataFlatpak` / `ConfigDataShip` /
 * `AppMetadata` types (`node_modules/@gjsify/cli/lib/types/config-data.d.ts`)
 * plus the storybook command's own config read
 * (`node_modules/@gjsify/cli/lib/commands/storybook.js`), not guessed:
 *  - `flatpak.icon` / `ship.icon` — scalable SVG icon (AppMetadata; "when
 *    set, init verifies the file exists").
 *  - `flatpak.lockfile` — "Source-of-truth lockfile for `gjsify flatpak
 *    deps` — `yarn.lock` or `package-lock.json`".
 *  - `ship.schemas` — "A `*.gschema.xml` file, or a directory of them."
 *  - `ship.licenseFile` — "Licence file."
 *  - `ship.fonts` — "A font file, or a directory of them, the application
 *    SHIPS" (committed source, unlike the compiled `localeDir` output).
 *  - `ship.extraFiles.*` — "prefix-relative destination → project-relative
 *    source"; the VALUES are the source paths.
 *  - `storybook.stories` — directory scanned for `*.story.ts` (default
 *    `'src'`, which always exists, so this only fires when explicitly set).
 */
const CHECKED_ASSET_FIELDS = [
  ['flatpak', 'icon'],
  ['flatpak', 'lockfile'],
  ['ship', 'icon'],
  ['ship', 'schemas'],
  ['ship', 'licenseFile'],
  ['ship', 'fonts'],
  ['ship', 'extraFiles', '*'],
  ['storybook', 'stories'],
]

/** Glob metacharacters — a value containing one is matched, not required verbatim. */
const GLOB_CHARS = /[*?[]/

/** Convert a single glob segment (`*`/`?` only) to a RegExp. */
function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

/**
 * A declared path may legitimately be a glob (none of today's fields are,
 * but `CHECKED_ASSET_FIELDS` is a field-name allowlist, not a value-shape
 * guess, so a future field carrying one is handled rather than false-failed).
 * Only the FINAL path segment is treated as a pattern — matches this
 * repo's fields, which never nest globs mid-path.
 */
function assetExists(pkgDir, relPath) {
  const abs = join(pkgDir, relPath)
  if (existsSync(abs)) return true
  if (!GLOB_CHARS.test(relPath)) return false

  const lastSlash = relPath.lastIndexOf('/')
  const dirPart = lastSlash === -1 ? '.' : relPath.slice(0, lastSlash)
  const basePattern = lastSlash === -1 ? relPath : relPath.slice(lastSlash + 1)
  const dirAbs = join(pkgDir, dirPart)
  if (!existsSync(dirAbs)) return false
  const re = globToRegExp(basePattern)
  return readdirSync(dirAbs).some((entry) => re.test(entry))
}

/** Walk `node` along `pattern`, expanding `'*'` segments, collecting string leaves. */
function resolveMatches(node, pattern, pathAcc, out) {
  if (pattern.length === 0) {
    if (typeof node === 'string') out.push({ dotPath: pathAcc.join('.'), value: node })
    return
  }
  if (node === null || typeof node !== 'object') return
  const [head, ...rest] = pattern
  if (head === '*') {
    for (const key of Object.keys(node)) resolveMatches(node[key], rest, [...pathAcc, key], out)
    return
  }
  if (Object.hasOwn(node, head)) resolveMatches(node[head], rest, [...pathAcc, head], out)
}

/** Expand the root `package.json#workspaces` globs (one level of `dir/*` only — matches this repo). */
function listWorkspacePackageDirs(root) {
  const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const dirs = ['.']
  for (const pattern of rootPkg.workspaces ?? []) {
    const m = pattern.match(/^(.*)\/\*$/)
    if (!m) {
      dirs.push(pattern)
      continue
    }
    const base = join(root, m[1])
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(join(m[1], entry.name))
    }
  }
  return dirs
}

let failures = 0

for (const dir of listWorkspacePackageDirs(ROOT)) {
  const pkgDir = join(ROOT, dir)
  const pkgJsonPath = join(pkgDir, 'package.json')
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
  } catch {
    continue
  }
  const gjsifyBlock = pkg.gjsify
  if (!gjsifyBlock || typeof gjsifyBlock !== 'object') continue

  const pkgName = pkg.name ?? relative(ROOT, pkgDir) ?? '.'
  const matches = []
  for (const pattern of CHECKED_ASSET_FIELDS) resolveMatches(gjsifyBlock, pattern, [], matches)

  for (const { dotPath, value } of matches) {
    if (!value || !assetExists(pkgDir, value)) {
      console.error(
        `✗ [${pkgName}] gjsify.${dotPath} → "${value}" does not exist (resolved from ${relative(ROOT, pkgDir) || '.'})`,
      )
      failures++
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} declared gjsify asset path(s) missing. Fix the path or the file.`)
  process.exit(1)
}
console.log('✓ Every declared gjsify asset path resolves to a real file or directory')

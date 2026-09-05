#!/usr/bin/env node
/**
 * Phantom-dependency guard.
 *
 * `@pixelrpg/mcp-bridge`'s specs import `@gjsify/unit` but its `package.json`
 * never declares it — the import only resolves because `gjsify install`
 * hoists `@gjsify/unit` to the root `node_modules/` for the packages that DO
 * declare it. CI runs `gjsify install --immutable`; hoisting is an
 * implementation detail of how the current dependency graph happens to
 * resolve, not a contract, so this is one hoisting change away from a build
 * that goes red on a commit that touched neither `mcp-bridge` nor
 * `@gjsify/unit`.
 *
 * This guard fails (exit 1) if a package's `src/**` imports a bare module
 * specifier that package's own `package.json` does not declare in
 * `dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies`.
 *
 * Deliberate scope decisions:
 *  - Workspace packages (`@pixelrpg/engine`, `@pixelrpg/gjs`, …) are checked
 *    IDENTICALLY to any external package — every consumer already declares
 *    them explicitly with a `workspace:^`/`workspace:*` specifier (see any
 *    app's `package.json`), so there is no separate rule to write; a
 *    workspace import that skipped that declaration is exactly the same bug
 *    this guard exists to catch, just with a different hoisting mechanism
 *    (symlinked, not npm-registry-resolved).
 *  - A package importing its OWN name (rare; a barrel self-import) is not a
 *    phantom dependency and is not flagged.
 *  - Relative/absolute specifiers (`./x`, `../x`, `/x`), Node builtins (with
 *    or without the `node:` prefix), and non-`file:` URI specifiers
 *    (`gi://Gtk?version=4.0`, `resource://…`) are not npm packages and are
 *    skipped — this repo's GObject bindings are actually imported by their
 *    `@girs/*` npm name (e.g. `import Gtk from '@girs/gtk-4.0'`, resolved to
 *    `gi://` at bundle time), so `@girs/*` specifiers are NOT skipped: they
 *    are ordinary scoped packages and must be declared like any other.
 *
 * Import forms recognised (regex-based, not a real parser — see
 * `IMPORT_PATTERNS` below for why each alternative is anchored to the real
 * grammar instead of a generic lazy match): static `import … from '…'`
 * (incl. `import type` and per-specifier `{ type X }`), side-effect
 * `import '…'`, `export … from '…'` (incl. `export type`, `export * from`,
 * `export * as ns from`), and dynamic `import('…')` (incl. the TS
 * type-position form `import('pkg').Type` and a specifier split across
 * lines).
 *
 * Runs in CI (Node is already provisioned for the gjsify CLI bootstrap) and
 * locally via `node scripts/check-phantom-deps.mjs` at the workspace root.
 */
import { builtinModules } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NODE_BUILTINS = new Set(builtinModules)

/**
 * GJS's own bare-specifier built-ins — not npm packages, so a package
 * importing one needs no `package.json` entry, exactly like a Node builtin.
 * NOT a guess: this is the literal `exactExternal` list `@gjsify/cli`'s own
 * bundler treats as external-by-name for `--app gjs`
 * (`node_modules/@gjsify/rolldown-plugin-gjsify/lib/app/gjs.js`,
 * `createGjsExternalsPredicate`) — `gi://*` is handled separately, by prefix,
 * in `isBarePackageSpecifier` below.
 */
const GJS_BUILTINS = new Set(['cairo', 'gettext', 'system'])

/**
 * Each pattern captures ONE specifier per match, using the actual import/
 * export GRAMMAR (identifier | `{ ... }` | `* as name`) rather than a
 * generic lazy "anything before from" — a generic lazy match bridges past a
 * declaration that never has a `from` clause at all (`export class Foo {
 * … }`, `export const x = …`) all the way into some unrelated LATER `from`
 * in a comment or string, and silently reports its neighbouring quoted text
 * as an imported specifier. Caught in practice: `export class
 * AddAnimationDialog extends Adw.Dialog { … }` (200+ lines, no `from`
 * anywhere in it) bridged straight into a JSDoc line reading `title swaps
 * from "New animation" to …` several methods later, and was reported as an
 * import of "New animation". Anchoring each alternative to the real grammar
 * means a statement either matches its own `from` clause on the spot or does
 * not match at all — it can never borrow one belonging to unrelated later
 * text.
 */
const IMPORT_PATTERNS = [
  // import Foo from 'pkg' | import Foo, { type Bar } from 'pkg' | import Foo, * as ns from 'pkg'
  // import { ... } from 'pkg' | import * as ns from 'pkg' | the `type` variant of each
  /^[ \t]*import\s+(?:type\s+)?(?:\*\s+as\s+\w+|\{[^}]*\}|\w+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+))?)\s+from\s+['"]([^'"]+)['"]/gm,
  // import 'pkg' (side-effect only — no `from` clause, and the bare form above doesn't apply)
  /^[ \t]*import\s+['"]([^'"]+)['"]/gm,
  // export { X } from 'pkg' | export * from 'pkg' | export * as ns from 'pkg' | the `type` variant of each
  /^[ \t]*export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s+['"]([^'"]+)['"]/gm,
  // import('pkg') — dynamic import or the TS type-position `import('pkg').Foo`
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
]

/** Recursively collect `*.ts`/`*.mts` files under `dir` (skips node_modules/dist). */
function collectSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collectSourceFiles(full, acc)
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.mts')) acc.push(full)
  }
  return acc
}

/** Every bare specifier a file imports, via any of `IMPORT_PATTERNS`. */
function collectSpecifiers(source) {
  const specifiers = new Set()
  for (const pattern of IMPORT_PATTERNS) {
    for (const m of source.matchAll(pattern)) specifiers.add(m[1])
  }
  return specifiers
}

/** `false` for anything that is not an installable npm package specifier. */
function isBarePackageSpecifier(spec) {
  if (spec.startsWith('.') || spec.startsWith('/')) return false // relative/absolute path
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(spec)) return false // gi://, resource://, etc.
  const bare = spec.startsWith('node:') ? spec.slice('node:'.length) : spec
  if (NODE_BUILTINS.has(bare)) return false
  if (GJS_BUILTINS.has(spec)) return false
  return true
}

/** Scoped names (`@scope/name`) are two segments; unscoped are one — either way, strip any subpath. */
function packageNameFromSpecifier(spec) {
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/** Expand the root `package.json#workspaces` globs (one level of `dir/*` only — matches this repo). */
function listWorkspacePackageDirs(root) {
  const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const dirs = []
  for (const pattern of rootPkg.workspaces ?? []) {
    const m = pattern.match(/^(.*)\/\*$/)
    if (!m) {
      dirs.push(pattern)
      continue
    }
    const base = join(root, m[1])
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(join(m[1], entry.name))
    }
  }
  return dirs
}

let failures = 0

for (const dir of listWorkspacePackageDirs(ROOT)) {
  const pkgDir = join(ROOT, dir)
  const srcDir = join(pkgDir, 'src')
  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  } catch {
    continue
  }

  let sourceFiles
  try {
    sourceFiles = collectSourceFiles(srcDir)
  } catch {
    continue // no src/ directory (e.g. games/* data-only packages)
  }

  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ])

  /** @type {Map<string, Set<string>>} missing dep name -> offending file paths (relative to pkgDir) */
  const missing = new Map()

  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8')
    for (const specifier of collectSpecifiers(source)) {
      if (!isBarePackageSpecifier(specifier)) continue
      const depName = packageNameFromSpecifier(specifier)
      if (depName === pkg.name || declared.has(depName)) continue
      const rel = relative(pkgDir, file)
      if (!missing.has(depName)) missing.set(depName, new Set())
      missing.get(depName).add(rel)
    }
  }

  for (const [depName, files] of missing) {
    const [first, ...rest] = [...files].sort()
    const suffix = rest.length > 0 ? ` (+${rest.length} more file(s))` : ''
    console.error(
      `✗ [${pkg.name}] imports "${depName}" (e.g. ${first}${suffix}) but does not declare it in dependencies/devDependencies/peerDependencies/optionalDependencies`,
    )
    failures++
  }
}

if (failures > 0) {
  console.error(`\n${failures} phantom dependency violation(s) found. Declare each in its package's package.json.`)
  process.exit(1)
}
console.log('✓ Every bare specifier imported under src/** is declared in its own package.json')

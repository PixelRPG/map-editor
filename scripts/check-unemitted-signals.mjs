#!/usr/bin/env node
/**
 * Unemitted-signal guard.
 *
 * A GObject signal declared in `GObject.registerClass({ Signals: … })`
 * that the owning class never emits is a promise the widget cannot
 * keep. It costs nothing at runtime, so nothing reports it — but every
 * reader of the class believes the notification exists, and a host that
 * connects to it waits forever. `CastView`'s `character-changed` and
 * `TilesView`'s `tile-changed` were both in that state: declared,
 * documented by their position next to real signals, emitted by nobody.
 *
 * **Why this check and not "declared but never CONNECTED".** The
 * connected-side variant looks strictly better and is not: a widget in
 * `packages/gjs` is public API of that package, so a host OUTSIDE this
 * repo may legitimately connect a signal nothing in-tree connects
 * (`pixelrpg-intent` is exactly that, by design). Emission is the
 * opposite: only the class that owns the signal can emit it, and that
 * class is in this repo. So "never emitted" is **fully decidable from
 * the tree** — it needs no exemption list, no marker vocabulary and no
 * judgement call, and it cannot be wrong about a public-API class.
 *
 * This guard fails (exit 1) if a signal name declared in any `Signals:`
 * block under a workspace package's `src/**` is emitted nowhere in that
 * same tree.
 *
 * Deliberate scope decisions:
 *  - Emitters are collected from ALL `.emit('name'` call sites, whatever
 *    the receiver. Excalibur's `EventEmitter` uses the same method name,
 *    so an engine event that happens to share a widget signal's name
 *    would suppress a report. That is the safe direction: this guard
 *    only ever under-reports, never accuses a live signal.
 *  - Because that promise has to hold, `emit(CONSTANT)` is resolved too,
 *    not only `emit('literal')`. AGENTS.md § Events asks for typed event
 *    maps over raw string literals, so the constant form is the one the
 *    repo is heading towards — and a gate that reported a genuinely
 *    emitted signal as dead, telling the author to "drop the
 *    declaration", would be worse than no gate. Resolution is by NAME
 *    across the whole tree (the constant and its `emit` are often in
 *    different files); over-collecting there can only suppress a report,
 *    never invent one.
 *  - `*.spec.ts` and `*.story.ts` are scanned as emitters too. A signal
 *    emitted only by a story is still emitted — whether that is ENOUGH
 *    is a review question, not something a scanner can decide.
 *  - Detailed emission (`emit('name::detail')`) counts for `name`.
 *
 * Runs in CI (Node is already provisioned for the gjsify CLI bootstrap)
 * and locally via `gjsify run check:signals` at the workspace root.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Lower bounds on what a healthy parse finds, so a regex that stopped
 * matching cannot report "0 violations" and look like a clean tree.
 */
const MIN_DECLARED_SIGNALS = 50
const MIN_EMITTED_NAMES = 50

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

/**
 * Signal names declared in the `Signals: { … }` blocks of `source`, with
 * the line each was declared on.
 *
 * Only keys at the block's TOP level count. A signal's own value is an
 * object (`{ param_types: [...] }`), so a naive "every quoted string in
 * the block" scan would also pick up whatever a nested value contains.
 * Depth is tracked line by line — this repo writes one signal per line
 * (Biome enforces it), so per-line granularity is exact here and cannot
 * loop on an unterminated quote the way a character scanner can.
 */
function declaredSignals(source) {
  const found = []
  const blockStart = /\bSignals\s*:\s*\{/g
  for (let m = blockStart.exec(source); m; m = blockStart.exec(source)) {
    const open = m.index + m[0].length - 1
    let depth = 0
    let end = open
    for (; end < source.length; end++) {
      if (source[end] === '{') depth++
      else if (source[end] === '}' && --depth === 0) break
    }
    const firstLine = source.slice(0, open).split('\n').length
    const body = source.slice(open + 1, end)
    let nesting = 0
    for (const [index, line] of body.split('\n').entries()) {
      const key = nesting === 0 ? line.match(/^\s*['"]([^'"]+)['"]\s*:/) : null
      if (key) found.push({ name: key[1], line: firstLine + index })
      for (const ch of line) {
        if (ch === '{' || ch === '[') nesting++
        else if (ch === '}' || ch === ']') nesting--
      }
    }
    blockStart.lastIndex = end
  }
  return found
}

/** Every name passed to a `.emit('…')` call in `source` (detail suffix stripped). */
function emittedNames(source) {
  return [...source.matchAll(/\.emit\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1].split('::')[0])
}

/**
 * String literals bound to a `const NAME = '…'` or an `as const` object
 * member, indexed by their binding name.
 *
 * Needed because a signal may be emitted through a constant rather than a
 * literal (`this.emit(CHARACTER_CHANGED)`) — a pattern this repo's own
 * AGENTS.md pushes towards for event names. Resolving those keeps the
 * guard's central promise true: it must never accuse a signal that is
 * really emitted.
 */
function stringConstants(source) {
  return [...source.matchAll(/(?:^|[\s{,])([A-Z_][A-Z0-9_]*|[a-z][\w$]*)\s*[:=]\s*'([^']+)'/g)].map((m) => [m[1], m[2]])
}

/** Names passed to a `.emit(IDENTIFIER)` call — resolved via {@link stringConstants}. */
function emittedIdentifiers(source) {
  return [...source.matchAll(/\.emit\(\s*([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*[,)]/g)].map((m) =>
    // `Signals.CHARACTER_CHANGED` resolves on its last segment.
    m[1].split('.').pop(),
  )
}

/** @type {Map<string, {file: string, line: number}[]>} signal name → declaration sites */
const declarations = new Map()
const emitted = new Set()
/** @type {Map<string, string[]>} constant name → every string literal bound to it, tree-wide */
const constants = new Map()
/** @type {string[]} identifiers seen as the sole argument of a `.emit(…)` */
const emittedVia = []
let scanned = 0

for (const dir of listWorkspacePackageDirs(ROOT)) {
  let sourceFiles
  try {
    sourceFiles = collectSourceFiles(join(ROOT, dir, 'src'))
  } catch {
    continue // no src/ directory (e.g. games/* data-only packages)
  }
  for (const file of sourceFiles) {
    scanned++
    const rel = relative(ROOT, file).split('\\').join('/')
    const source = readFileSync(file, 'utf8')
    for (const { name, line } of declaredSignals(source)) {
      if (!declarations.has(name)) declarations.set(name, [])
      declarations.get(name).push({ file: rel, line })
    }
    for (const name of emittedNames(source)) emitted.add(name)
    for (const [name, value] of stringConstants(source)) {
      if (!constants.has(name)) constants.set(name, [])
      constants.get(name).push(value)
    }
    emittedVia.push(...emittedIdentifiers(source))
  }
}

// Resolved after the whole tree is read: the constant and the `emit` that
// uses it are regularly in different files. Matching by NAME across the
// tree over-collects, which is the safe direction here — an extra name in
// `emitted` can only ever suppress a report, never create one.
for (const identifier of emittedVia) {
  for (const value of constants.get(identifier) ?? []) emitted.add(value.split('::')[0])
}

let failures = 0

if (declarations.size < MIN_DECLARED_SIGNALS) {
  console.error(
    `✗ parsed only ${declarations.size} declared signal(s) from ${scanned} file(s) — the matcher is broken, not the tree`,
  )
  failures++
}
if (emitted.size < MIN_EMITTED_NAMES) {
  console.error(`✗ parsed only ${emitted.size} emitted name(s) — the matcher is broken, not the tree`)
  failures++
}

for (const [name, sites] of [...declarations].sort(([a], [b]) => a.localeCompare(b))) {
  if (emitted.has(name)) continue
  for (const { file, line } of sites) {
    console.error(`✗ ${file}:${line} declares the signal "${name}", which nothing in the tree ever emits`)
    failures++
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} unemitted signal declaration(s). Emit it where the state actually changes, or drop the ` +
      'declaration — only the owning class can emit a signal, so an unemitted one can never fire for anyone.',
  )
  process.exit(1)
}
console.log(
  `✓ All ${declarations.size} declared GObject signals are emitted somewhere (${scanned} source files scanned)`,
)

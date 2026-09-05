#!/usr/bin/env node
/**
 * Blueprint-action guard.
 *
 * `action-name: "win.…"` in a `.blp` is a NAME LOOKUP at map time, not a
 * link the compiler can check. A row bound to an action nobody
 * registered does not error, does not warn and does not log: GTK renders
 * it permanently insensitive and the user reads that as "not available
 * right now". The primary menu shipped exactly that — a *"Keyboard
 * Shortcuts"* item bound to `win.show-help-overlay`, a name that
 * appeared nowhere else in the tree (no `set_help_overlay`, no
 * `help-overlay.ui`, no `Gtk.ShortcutsWindow`). It was greyed out in
 * every build for as long as it existed.
 *
 * The exposure is structural, not a one-off: the `.blp` files live in
 * `packages/gjs`, the action registry lives in `apps/maker-gjs`, and
 * neither package's type-check can see the other side of the string.
 *
 * This guard fails (exit 1) if a `.blp` under a workspace package's
 * `src/**` references an action name that is neither in
 * `WINDOW_ACTION_NAMES_BY_MODULE` (`apps/maker-gjs/src/actions/action-registry.ts`,
 * the hand-maintained declaration of the whole `win.*` set) nor
 * constructed as an `app.*` action in `apps/maker-gjs/src/application.ts`.
 *
 * Deliberate scope decisions:
 *  - **The reverse direction is NOT checked.** 15 of the 40 declared
 *    `win.*` actions are referenced by no `.blp` at all — they are
 *    driven from TypeScript (`activate_action`), from the MCP bridge or
 *    from devtools. "Declared but not in a `.blp`" is normal here and
 *    arming it would produce 15 standing false positives, which is how a
 *    guard gets switched off.
 *  - `action-target` values are not checked. They are GVariant literals
 *    whose MEANING depends on the action (a mode id for `win.mode`, a
 *    template id for `win.new-object`); `check-mode-routes.mjs` owns the
 *    mode vocabulary, and the rest is not decidable from the string.
 *  - `WINDOW_ACTION_NAMES_BY_MODULE` is read as the declared set rather
 *    than the installed actions themselves, because it is already
 *    reconciled against a really-installed action group by
 *    `window-actions.gjs.spec.ts`. Chaining onto that reconciliation
 *    keeps this guard free of GTK.
 *  - A BOUND action name (`action-name: bind template.action-name;`,
 *    `floating-fab.blp`) carries no literal and is skipped. That is the
 *    one blind spot, and it costs nothing today: `FloatingFab` forwards
 *    a property to its inner button, and every consumer sets the real
 *    name as a literal in its own `.blp` (`win.play`, `win.new-scene`),
 *    where this guard does see it.
 *
 * Runs in CI (Node is already provisioned for the gjsify CLI bootstrap)
 * and locally via `gjsify run check:blp-actions` at the workspace root.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const ACTION_REGISTRY_TS = 'apps/maker-gjs/src/actions/action-registry.ts'
const APPLICATION_TS = 'apps/maker-gjs/src/application.ts'

/**
 * Action names installed by the TOOLKIT rather than by this app — a
 * `.blp` may reference one without any registration of ours. Empty
 * today because no template uses one; GTK does ship some (GtkWindow's
 * `window.*` family, for instance). When a template starts using one,
 * add the exact name here with a one-line source rather than loosening
 * the prefix rule — a prefix rule would also swallow a typo.
 */
const TOOLKIT_ACTIONS = new Set()

/**
 * Lower bounds on what a healthy parse finds, so a regex that stopped
 * matching cannot report "0 violations" and look like a clean tree.
 */
const MIN_DECLARED_WIN_ACTIONS = 30
const MIN_DECLARED_APP_ACTIONS = 3
const MIN_BLP_FILES = 20

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

/** Recursively collect `*.blp` files under `dir` (skips node_modules/dist). */
function collectBlueprints(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collectBlueprints(full, acc)
    else if (entry.name.endsWith('.blp')) acc.push(full)
  }
  return acc
}

/**
 * The declared `win.*` set: every string in the
 * `WINDOW_ACTION_NAMES_BY_MODULE` object literal, brace-matched from its
 * `const` so a later literal in the file cannot leak in.
 */
function declaredWindowActions(source) {
  const start = source.search(/export const WINDOW_ACTION_NAMES_BY_MODULE\b/)
  if (start === -1) return []
  const open = source.indexOf('{', start)
  let depth = 0
  let end = open
  for (; end < source.length; end++) {
    if (source[end] === '{') depth++
    else if (source[end] === '}' && --depth === 0) break
  }
  const body = source.slice(open + 1, end)
  return [...body.matchAll(/'([^']+)'/g)].map((m) => `win.${m[1]}`)
}

/**
 * The declared `app.*` set: every action CONSTRUCTED in `application.ts`.
 * All four construction forms are matched — the property-bag
 * (`new Gio.SimpleAction({ name: … })` / `Gio.PropertyAction`) and the
 * positional factories (`Gio.SimpleAction.new` / `.new_stateful`), the
 * latter of which this repo writes across several lines.
 */
function declaredAppActions(source) {
  const pattern =
    /new\s+Gio\.(?:Simple|Property)Action\s*\(\s*\{[\s\S]*?\bname:\s*'([^']+)'|Gio\.SimpleAction\.new(?:_stateful)?\s*\(\s*'([^']+)'/g
  return [...source.matchAll(pattern)].map((m) => `app.${m[1] ?? m[2]}`)
}

const declared = new Set([
  ...declaredWindowActions(readFileSync(join(ROOT, ACTION_REGISTRY_TS), 'utf8')),
  ...declaredAppActions(readFileSync(join(ROOT, APPLICATION_TS), 'utf8')),
  ...TOOLKIT_ACTIONS,
])

const winCount = [...declared].filter((n) => n.startsWith('win.')).length
const appCount = [...declared].filter((n) => n.startsWith('app.')).length

/** `action-name: "…"` (widgets) and `action: "…"` (menu items). */
const ACTION_REFERENCE = /\baction(?:-name)?\s*:\s*["']([^"']+)["']/

const failures = []
let references = 0
let blueprintFiles = 0

for (const dir of listWorkspacePackageDirs(ROOT)) {
  let blueprints
  try {
    blueprints = collectBlueprints(join(ROOT, dir, 'src'))
  } catch {
    continue // no src/ directory (e.g. games/* data-only packages)
  }

  for (const file of blueprints) {
    blueprintFiles++
    const rel = relative(ROOT, file).split('\\').join('/')
    const lines = readFileSync(file, 'utf8').split('\n')
    for (const [index, raw] of lines.entries()) {
      // Blueprint's line comment. Stripped before matching so a
      // commented-out row does not report.
      const line = raw.replace(/\/\/.*$/, '')
      const match = line.match(ACTION_REFERENCE)
      if (!match) continue
      references++
      const name = match[1]
      if (declared.has(name)) continue
      failures.push({ file: rel, line: index + 1, name, text: raw.trim() })
    }
  }
}

let failed = 0

if (winCount < MIN_DECLARED_WIN_ACTIONS) {
  console.error(
    `✗ parsed only ${winCount} win.* action(s) from ${ACTION_REGISTRY_TS} — the matcher is broken, not the tree`,
  )
  failed++
}
if (appCount < MIN_DECLARED_APP_ACTIONS) {
  console.error(
    `✗ parsed only ${appCount} app.* action(s) from ${APPLICATION_TS} — the matcher is broken, not the tree`,
  )
  failed++
}
if (blueprintFiles < MIN_BLP_FILES) {
  console.error(
    `✗ scanned only ${blueprintFiles} .blp file(s), expected at least ${MIN_BLP_FILES} — the walk is broken, not the tree`,
  )
  failed++
}

for (const { file, line, name, text } of failures) {
  console.error(`✗ ${file}:${line} binds "${name}", which no module registers (${text})`)
  failed++
}

if (failed > 0) {
  console.error(
    `\n${failed} unregistered .blp action reference(s). Register the action (and declare it in ` +
      `WINDOW_ACTION_NAMES_BY_MODULE, ${ACTION_REGISTRY_TS}), or remove the widget — GTK renders a ` +
      'widget bound to a missing action permanently insensitive, silently.\n' +
      'If the action is installed by GTK/libadwaita itself rather than by this app ' +
      '(`navigation.push` on an Adw.NavigationView, `clipboard.copy` on a Gtk.Text, …), it is not ours ' +
      'to register: add the exact name to TOOLKIT_ACTIONS in this script instead, with a one-line source.',
  )
  process.exit(1)
}
console.log(
  `✓ All ${references} .blp action references resolve to a registered action ` +
    `(${winCount} win.* + ${appCount} app.*, ${blueprintFiles} blueprints scanned)`,
)

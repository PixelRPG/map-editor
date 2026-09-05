#!/usr/bin/env node
/**
 * Mode-route guard.
 *
 * The mode rail is the editor's primary navigation. Every row it shows
 * is a promise: click here and you land somewhere. One row could not
 * keep it — `audio` had a rail row (`mode-rail.blp`), a member in the
 * `EditorMode` union and NO `Adw.ViewStackPage` behind it. The gap was
 * papered over rather than reported: `resolveModeNavigation` special-
 * cased the id into a `{ kind: 'unimplemented' }` outcome,
 * `view-actions.ts` turned that into a *"Coming soon"* toast and snapped
 * the rail back, and a spec PINNED the dead end as correct behaviour.
 * Three layers of code existed so that one advertised place could not be
 * reached — and nothing anywhere said "this mode has no view".
 *
 * This guard fails (exit 1) when the four declarations of a mode drift
 * apart. They live in four files, two packages and two languages, so
 * nothing but a cross-file check can hold them together:
 *
 *  1. `EditorMode` + `MODE_ORDER`  — `packages/gjs/src/widgets/editor/mode-rail.ts`
 *  2. the rail rows               — `packages/gjs/src/widgets/editor/mode-rail.blp`
 *  3. `VIEW_FOR_MODE` / `MODE_FOR_VIEW` / `ViewName`
 *                                 — `apps/maker-gjs/src/services/view-mode-map.ts`
 *  4. the `Adw.ViewStackPage`s    — `apps/maker-gjs/src/widgets/application-window.blp`
 *
 * `tsc` already covers ONE of the six edges: `VIEW_FOR_MODE` is typed
 * `Record<EditorMode, ViewName>` (exhaustive, deliberately not
 * `Partial`), so a mode with no view fails the type-check. It cannot see
 * the other five — a `ViewName` string is not proof an
 * `Adw.ViewStackPage` of that name exists, and `.blp` is invisible to it
 * entirely.
 *
 * Deliberate scope decisions:
 *  - `welcome` and `scene-editor` are views with NO rail row, on
 *    purpose: the welcome screen is pre-project and the scene editor is
 *    reached by opening a scene, not by picking a mode. So the
 *    view→mode direction is checked as "every view is classified by
 *    `MODE_FOR_VIEW`" (where `null` is a legal answer), not as "every
 *    view has a row".
 *  - Only `mode-rail.blp` is scanned for rows, and only rows bound to
 *    `win.mode`. Other `.blp` files carry `action-target` values for
 *    other actions (a template id for `win.new-object`, say); those are
 *    a different vocabulary and are `check-blp-actions.mjs`'s concern.
 *
 * Runs in CI (Node is already provisioned for the gjsify CLI bootstrap)
 * and locally via `gjsify run check:mode-routes` at the workspace root.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const MODE_RAIL_TS = 'packages/gjs/src/widgets/editor/mode-rail.ts'
const MODE_RAIL_BLP = 'packages/gjs/src/widgets/editor/mode-rail.blp'
const VIEW_MODE_MAP_TS = 'apps/maker-gjs/src/services/view-mode-map.ts'
const WINDOW_BLP = 'apps/maker-gjs/src/widgets/application-window.blp'

/**
 * Lower bounds on what a healthy parse finds. A regex that stopped
 * matching would otherwise report "0 violations" — indistinguishable
 * from a clean tree, which is the failure mode every guard in this
 * directory exists to avoid.
 */
const MIN_MODES = 3
const MIN_VIEWS = 4

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

/** Quoted members of `export type <name> = 'a' | 'b' | …` (single line). */
function unionMembers(source, name) {
  const m = source.match(new RegExp(`export type ${name}\\s*=\\s*([^\\n]+)`))
  if (!m) return []
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

/** Quoted entries of `const <name>: … = ['a', 'b']` (single line). */
function arrayLiteral(source, name) {
  const m = source.match(new RegExp(`const ${name}\\b[^=]*=\\s*\\[([^\\]]*)\\]`))
  if (!m) return []
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

/**
 * `key: 'value'` / `'key': 'value'` / `key: null` pairs of a
 * `const <name>… = { … }` object literal, brace-matched so a nested
 * object cannot end the scan early.
 */
function objectLiteral(source, name) {
  const start = source.search(new RegExp(`const ${name}\\b`))
  if (start === -1) return []
  const open = source.indexOf('{', start)
  if (open === -1) return []
  let depth = 0
  let end = open
  for (; end < source.length; end++) {
    if (source[end] === '{') depth++
    else if (source[end] === '}' && --depth === 0) break
  }
  const body = source.slice(open + 1, end)
  return [...body.matchAll(/(?:^|\n)\s*'?([\w-]+)'?\s*:\s*(?:'([^']*)'|(null))/g)].map((m) => ({
    key: m[1],
    value: m[2] ?? null,
  }))
}

/**
 * `Adw.ViewStackPage { … name: "…" }` page names. Anchored on the page
 * TYPE, not on a bare `name:` line — an unanchored scan also matches the
 * template's own `Gtk.Widget.name` (`application-window.blp:5`) and
 * reports the window itself as a stack page.
 */
function viewStackPageNames(source) {
  return [...source.matchAll(/Adw\.ViewStackPage\s*\{[\s\S]*?\bname:\s*"([^"]+)"/g)].map((m) => m[1])
}

/**
 * Rail rows: the `action-target` of every row bound to `win.mode`.
 * Blueprint writes the GVariant string target as `"'world'"` — quotes
 * inside quotes — so the inner pair is stripped.
 */
function modeRailRowTargets(source) {
  const targets = []
  let boundToMode = false
  for (const line of source.split('\n')) {
    const action = line.match(/\baction-name:\s*"([^"]+)"/)
    if (action) boundToMode = action[1] === 'win.mode'
    const target = line.match(/\baction-target:\s*"'([^']+)'"/)
    if (target && boundToMode) targets.push(target[1])
  }
  return targets
}

const railTs = read(MODE_RAIL_TS)
const railBlp = read(MODE_RAIL_BLP)
const mapTs = read(VIEW_MODE_MAP_TS)
const windowBlp = read(WINDOW_BLP)

const modes = unionMembers(railTs, 'EditorMode')
const modeOrder = arrayLiteral(railTs, 'MODE_ORDER')
const railRows = modeRailRowTargets(railBlp)
const viewNames = unionMembers(mapTs, 'ViewName')
const viewForMode = objectLiteral(mapTs, 'VIEW_FOR_MODE')
const modeForView = objectLiteral(mapTs, 'MODE_FOR_VIEW')
const stackPages = viewStackPageNames(windowBlp)

const failures = []
const fail = (message) => failures.push(message)

if (modes.length < MIN_MODES)
  fail(`parsed only ${modes.length} EditorMode member(s) from ${MODE_RAIL_TS} — the matcher is broken, not the tree`)
if (viewNames.length < MIN_VIEWS)
  fail(
    `parsed only ${viewNames.length} ViewName member(s) from ${VIEW_MODE_MAP_TS} — the matcher is broken, not the tree`,
  )
if (stackPages.length < MIN_VIEWS)
  fail(
    `parsed only ${stackPages.length} Adw.ViewStackPage name(s) from ${WINDOW_BLP} — the matcher is broken, not the tree`,
  )

const modeSet = new Set(modes)
const viewNameSet = new Set(viewNames)
const stackPageSet = new Set(stackPages)
const railRowSet = new Set(railRows)
const viewForModeKeys = new Set(viewForMode.map((e) => e.key))

// 1. Every mode resolves to a view.
for (const mode of modes) {
  if (!viewForModeKeys.has(mode)) {
    fail(
      `EditorMode "${mode}" has no VIEW_FOR_MODE entry in ${VIEW_MODE_MAP_TS} — ` +
        'the rail would advertise a place the user cannot reach. Add the view, or drop the mode.',
    )
  }
}

// 2. …and that view is a real stack page.
for (const { key, value } of viewForMode) {
  if (value && !stackPageSet.has(value)) {
    fail(`VIEW_FOR_MODE["${key}"] → "${value}" is not an Adw.ViewStackPage name in ${WINDOW_BLP}`)
  }
}

// 3. No route from a mode that does not exist.
for (const { key } of viewForMode) {
  if (!modeSet.has(key)) fail(`VIEW_FOR_MODE has a "${key}" entry but "${key}" is not an EditorMode (${MODE_RAIL_TS})`)
}

// 4. Rail rows and modes agree, both directions.
for (const mode of modes) {
  if (!railRowSet.has(mode))
    fail(`EditorMode "${mode}" has no win.mode row in ${MODE_RAIL_BLP} — it is unreachable from the rail`)
}
for (const target of railRowSet) {
  if (!modeSet.has(target))
    fail(`${MODE_RAIL_BLP} has a win.mode row targeting "${target}", which is not an EditorMode`)
}

// 5. MODE_ORDER (what the widget iterates) is exactly the union.
for (const mode of modes) {
  if (!modeOrder.includes(mode))
    fail(
      `EditorMode "${mode}" is missing from MODE_ORDER in ${MODE_RAIL_TS} — the row is never connected or highlighted`,
    )
}
for (const mode of modeOrder) {
  if (!modeSet.has(mode)) fail(`MODE_ORDER lists "${mode}", which is not an EditorMode (${MODE_RAIL_TS})`)
}

// 6. ViewName and the stack pages agree, both directions, and every
//    view is classified onto a rail row (or explicitly onto none).
for (const view of viewNames) {
  if (!stackPageSet.has(view)) fail(`ViewName "${view}" has no Adw.ViewStackPage in ${WINDOW_BLP}`)
}
for (const page of stackPages) {
  if (!viewNameSet.has(page))
    fail(`${WINDOW_BLP} has an Adw.ViewStackPage "${page}" missing from the ViewName union (${VIEW_MODE_MAP_TS})`)
}
const modeForViewKeys = new Set(modeForView.map((e) => e.key))
for (const view of viewNames) {
  if (!modeForViewKeys.has(view))
    fail(`ViewName "${view}" has no MODE_FOR_VIEW entry — the rail highlight is undefined on that page`)
}
for (const { key, value } of modeForView) {
  if (!viewNameSet.has(key)) fail(`MODE_FOR_VIEW has a "${key}" entry but "${key}" is not a ViewName`)
  if (value !== null && !modeSet.has(value)) fail(`MODE_FOR_VIEW["${key}"] → "${value}" is not an EditorMode`)
}

if (failures.length > 0) {
  for (const message of failures) console.error(`✗ ${message}`)
  console.error(
    `\n${failures.length} mode-route violation(s). Every EditorMode must have a rail row, a VIEW_FOR_MODE ` +
      'entry and a real Adw.ViewStackPage behind it — a mode with no view is a navigation dead end.',
  )
  process.exit(1)
}
console.log(
  `✓ All ${modes.length} editor modes route to a real view (${stackPages.length} stack pages, ${railRows.length} rail rows)`,
)

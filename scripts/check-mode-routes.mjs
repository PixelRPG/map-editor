#!/usr/bin/env node
/**
 * Mode-route guard.
 *
 * The view switcher is the editor's primary navigation. Every
 * destination it shows is a promise: click here and you land somewhere.
 * One could not keep it — `audio` had a mode-rail row, a member in the
 * `EditorMode` union and NO stack page behind it. The gap was papered
 * over rather than reported: `resolveModeNavigation` special-cased the id
 * into a `{ kind: 'unimplemented' }` outcome, `view-actions.ts` turned
 * that into a *"Coming soon"* toast and snapped the rail back, and a spec
 * PINNED the dead end as correct behaviour. Three layers of code existed
 * so that one advertised place could not be reached — and nothing
 * anywhere said "this mode has no view".
 *
 * The rail is gone (REDESIGN.md § 3.1) but the drift it enabled is not:
 * navigation is now declared across TWO nested stacks, so the same
 * promise is split over more places than before. This guard fails
 * (exit 1) when they disagree. They live in three files, two packages and
 * two languages, so nothing but a cross-file check can hold them
 * together:
 *
 *  1. `EditorMode` + `MODE_ORDER` — `packages/gjs/src/widgets/editor/editor-mode.ts`
 *  2. `ViewName` / `ViewRoute` / `ROUTE_FOR_VIEW` / `MODE_FOR_VIEW` / `VIEW_FOR_MODE`
 *                                 — `apps/maker-gjs/src/services/view-mode-map.ts`
 *  3. the two stacks' pages       — `apps/maker-gjs/src/widgets/application-window.blp`
 *
 * `tsc` already covers a few of the edges: `VIEW_FOR_MODE` is typed
 * `Record<EditorMode, ViewName>` and `ROUTE_FOR_VIEW` / `MODE_FOR_VIEW`
 * are `Record<ViewName, …>` (exhaustive, deliberately not `Partial`), so
 * a mode with no view or a view with no route fails the type-check. It
 * cannot see the rest — a page-name string is not proof a `Gtk.StackPage`
 * or `Adw.ViewStackPage` of that name exists, and `.blp` is invisible to
 * it entirely.
 *
 * What the two levels mean, and why the checks are asymmetric:
 *  - `root_stack` (`Gtk.Stack`) carries `welcome` / `shell` / `map`.
 *    These are NOT switcher destinations — the welcome screen is
 *    pre-project and the map editor is reached by opening a map, not by
 *    picking a destination. So `welcome` and `map` legitimately have no
 *    mode, and the view→mode direction is checked as "every view is
 *    classified by `MODE_FOR_VIEW`" (where `null` is a legal answer).
 *  - `shell_stack` (`Adw.ViewStack`) carries the three switcher
 *    destinations. Here the symmetric check DOES hold: a page the
 *    switcher renders that the router cannot name is unreachable from
 *    code, and a mode that does not route into the shell cannot be
 *    selected by a switcher at all.
 *
 * Navigation is not only the way in. Check 13 holds the way OUT — the
 * one back of REDESIGN.md § 3.4, declared across four more files (the
 * step order, the performer per step, the keys, the gesture
 * controllers). It is the same bug class seen from the other side: a
 * back step with no performer is a promise the shell cannot keep, and
 * it is quieter than a missing page, because a back that does nothing
 * looks exactly like a back with nothing left to undo.
 *
 * Runs in CI (Node is already provisioned for the gjsify CLI bootstrap)
 * and locally via `gjsify run check:mode-routes` at the workspace root.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const EDITOR_MODE_TS = 'packages/gjs/src/widgets/editor/editor-mode.ts'
const VIEW_MODE_MAP_TS = 'apps/maker-gjs/src/services/view-mode-map.ts'
const WINDOW_BLP = 'apps/maker-gjs/src/widgets/application-window.blp'
const BACK_ORDER_TS = 'apps/maker-gjs/src/services/back-order.ts'
const BACK_ACTIONS_TS = 'apps/maker-gjs/src/actions/back-actions.ts'
const ACCELS_TS = 'apps/maker-gjs/src/actions/accels.ts'
const WINDOW_TS = 'apps/maker-gjs/src/widgets/application-window.ts'

/**
 * Lower bounds on what a healthy parse finds. A regex that stopped
 * matching would otherwise report "0 violations" — indistinguishable
 * from a clean tree, which is the failure mode every guard in this
 * directory exists to avoid.
 */
const MIN_MODES = 3
const MIN_VIEWS = 5
const MIN_ROOT_PAGES = 3
const MIN_SHELL_PAGES = 3
const MIN_BACK_STEPS = 6

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

/** Body of the first `{ … }` at or after `index`, brace-matched. */
function braceBody(source, index) {
  const open = source.indexOf('{', index)
  if (open === -1) return null
  let depth = 0
  for (let end = open; end < source.length; end++) {
    if (source[end] === '{') depth++
    else if (source[end] === '}' && --depth === 0) return source.slice(open + 1, end)
  }
  return null
}

/** Drop `//` line comments so a commented-out entry is not parsed as real. */
const stripComments = (text) =>
  text
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

/**
 * Quoted members of `export type <name> = 'a' | 'b' | …`.
 *
 * Read across lines, not just the first one: Biome wraps a union one
 * member per line as soon as it passes the 120-column limit, so a
 * single-line matcher would silently see one member the day someone adds
 * a mode — which the MIN_ floors would then report as "the matcher is
 * broken" on a tree that is perfectly fine. The alias ends at the first
 * line that continues neither with `|` nor with a quoted member.
 */
function unionMembers(source, name) {
  const m = source.match(new RegExp(`export type ${name}\\s*=`))
  if (!m) return []
  const lines = source.slice(m.index + m[0].length).split('\n')
  const body = []
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    if (index > 0 && !trimmed.startsWith('|') && !trimmed.startsWith("'")) break
    body.push(line)
  }
  return [...body.join('\n').matchAll(/'([^']+)'/g)].map((x) => x[1])
}

/** Quoted entries of `const <name>: … = ['a', 'b']` (single line). */
function arrayLiteral(source, name) {
  const m = source.match(new RegExp(`const ${name}\\b[^=]*=\\s*\\[([^\\]]*)\\]`))
  if (!m) return []
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

/**
 * Quoted members of one field of `export interface <iface>`, e.g. the
 * `'welcome' | 'shell' | 'map'` of `ViewRoute['root']`. The field's own
 * union is what `routeForView` is allowed to return, so a stack page
 * missing from it is a page no route can ever name.
 */
function interfaceFieldUnion(source, iface, field) {
  const start = source.search(new RegExp(`export interface ${iface}\\b`))
  if (start === -1) return { members: [], nullable: false, found: false }
  const body = braceBody(source, start)
  if (body === null) return { members: [], nullable: false, found: false }
  const m = stripComments(body).match(new RegExp(`\\b${field}:\\s*([^\\n;]+)`))
  if (!m) return { members: [], nullable: false, found: false }
  return {
    members: [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]),
    nullable: /\bnull\b/.test(m[1]),
    found: true,
  }
}

/** Split `text` on every `separator` that is not inside `{}`, `[]` or `()`. */
function splitTopLevel(text, separator) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{' || ch === '[' || ch === '(') depth++
    else if (ch === '}' || ch === ']' || ch === ')') depth--
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/** Body of `const <name>… = { … }`, brace-matched and comment-stripped. */
function literalBody(source, name) {
  const start = source.search(new RegExp(`const ${name}\\b`))
  if (start === -1) return null
  const body = braceBody(source, start)
  return body === null ? null : stripComments(body)
}

/**
 * `key: 'value'` / `'key': 'value'` / `key: null` pairs of a
 * `const <name>… = { … }` object literal, brace-matched so a nested
 * object cannot end the scan early.
 *
 * Entries are split on TOP-LEVEL commas rather than on line starts: a
 * record written on one line is the same record, and a matcher that only
 * saw the first entry of it would report every other mode as having no
 * route — a false failure on correct code, with a remedy ("add the view,
 * or drop the mode") that does not apply. Each entry must match whole, so
 * a nested value is skipped rather than half-parsed.
 */
function objectLiteral(source, name) {
  const body = literalBody(source, name)
  if (body === null) return []
  return splitTopLevel(body, ',')
    .map((chunk) => chunk.match(/^\s*'?([\w-]+)'?\s*:\s*(?:'([^']*)'|(null))\s*$/))
    .filter((m) => m !== null)
    .map((m) => ({ key: m[1], value: m[2] ?? null }))
}

/**
 * Entries of a record whose values are themselves object literals, e.g.
 * `ROUTE_FOR_VIEW`'s `welcome: { root: 'welcome', shell: null }`. Each
 * inner object is parsed with the same scalar matcher, so the two levels
 * share one notion of "a quoted value or null".
 */
function nestedObjectLiteral(source, name) {
  const body = literalBody(source, name)
  if (body === null) return []
  return splitTopLevel(body, ',')
    .map((chunk) => chunk.match(/^\s*'?([\w-]+)'?\s*:\s*\{([^{}]*)\}\s*$/))
    .filter((m) => m !== null)
    .map((m) => {
      const fields = {}
      for (const field of splitTopLevel(m[2], ',')) {
        const pair = field.match(/^\s*'?([\w-]+)'?\s*:\s*(?:'([^']*)'|(null))\s*$/)
        if (pair) fields[pair[1]] = pair[2] ?? null
      }
      return { key: m[1], fields }
    })
}

/**
 * Pages of one stack-page TYPE, brace-matched. Anchored on the page type
 * rather than on a bare `name:` line — an unanchored scan also matches
 * the template's own `Gtk.Widget.name` (`application-window.blp:5`) and
 * reports the window itself as a stack page.
 *
 * `title` / `icon` are reported per page because they are the switcher's
 * only labels: an `Adw.ViewStackPage` without them renders as a blank
 * button, which is a navigation dead end of a subtler kind — the
 * destination exists but nothing says what it is.
 */
function stackPages(source, type) {
  const pages = []
  const re = new RegExp(`\\b${type.replace(/\./g, '\\.')}\\s*\\{`, 'g')
  for (const m of source.matchAll(re)) {
    const body = braceBody(source, m.index)
    if (body === null) continue
    const clean = stripComments(body)
    pages.push({
      name: clean.match(/\bname:\s*"([^"]+)"/)?.[1] ?? null,
      hasTitle: /\btitle:\s*(?:_\()?"/.test(clean),
      hasIcon: /\bicon-name:\s*"/.test(clean),
      childId: clean.match(/\bchild:\s*\$\w+\s+(\w+)\s*\{/)?.[1] ?? null,
      childType: clean.match(/\bchild:\s*(\$\w+)/)?.[1] ?? null,
    })
  }
  return pages
}

/**
 * Rows of an accelerator table — `export const <name> … = [['win.x',
 * ['<Primary>x']], …]`. Parsed as whole rows rather than by harvesting
 * every quoted string: the two levels hold different things, and a
 * matcher that flattened them would check action names against keys.
 * The table ends at the first `]` in column 1, which is how Biome
 * formats it.
 */
function accelTable(source, name) {
  const m = source.match(new RegExp(`export const ${name}\\b[^=]*=\\s*\\[`))
  if (!m) return []
  const rest = source.slice(m.index + m[0].length)
  const end = rest.search(/\n\]/)
  const body = end === -1 ? rest : rest.slice(0, end)
  return [...body.matchAll(/\[\s*'([^']+)'\s*,\s*\[([^\]]*)\]/g)].map((row) => ({
    action: row[1],
    keys: [...row[2].matchAll(/'([^']+)'/g)].map((x) => x[1]),
  }))
}

/** `stop-run` → `stopRun`: a back step's name and its performer's. */
const camel = (kebab) => kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase())

/** Setter targets of every `Adw.Breakpoint { … setters { … } }` block. */
function breakpointSetters(source) {
  const setters = []
  for (const m of stripComments(source).matchAll(/\bsetters\s*\{/g)) {
    const body = braceBody(source, m.index)
    if (body === null) continue
    for (const pair of body.matchAll(/([\w-]+)\.([\w-]+):\s*([^;]+);/g)) {
      setters.push({ target: pair[1], property: pair[2], value: pair[3].trim() })
    }
  }
  return setters
}

const modeTs = read(EDITOR_MODE_TS)
const mapTs = read(VIEW_MODE_MAP_TS)
const windowBlp = read(WINDOW_BLP)
const backOrderTs = stripComments(read(BACK_ORDER_TS))
const backActionsTs = stripComments(read(BACK_ACTIONS_TS))
const accelsTs = stripComments(read(ACCELS_TS))
const windowTs = stripComments(read(WINDOW_TS))

const modes = unionMembers(modeTs, 'EditorMode')
const modeOrder = arrayLiteral(modeTs, 'MODE_ORDER')
const viewNames = unionMembers(mapTs, 'ViewName')
const routeForView = nestedObjectLiteral(mapTs, 'ROUTE_FOR_VIEW')
const modeForView = objectLiteral(mapTs, 'MODE_FOR_VIEW')
const viewForMode = objectLiteral(mapTs, 'VIEW_FOR_MODE')
const rootUnion = interfaceFieldUnion(mapTs, 'ViewRoute', 'root')
const shellUnion = interfaceFieldUnion(mapTs, 'ViewRoute', 'shell')
const rootPages = stackPages(windowBlp, 'Gtk.StackPage')
const shellPages = stackPages(windowBlp, 'Adw.ViewStackPage')
const setters = breakpointSetters(windowBlp)
const backSteps = arrayLiteral(backOrderTs, 'BACK_STEPS')
const windowShortcuts = accelTable(accelsTs, 'WINDOW_SHORTCUTS')

const failures = []
const fail = (message) => failures.push(message)

if (modes.length < MIN_MODES)
  fail(`parsed only ${modes.length} EditorMode member(s) from ${EDITOR_MODE_TS} — the matcher is broken, not the tree`)
if (viewNames.length < MIN_VIEWS)
  fail(
    `parsed only ${viewNames.length} ViewName member(s) from ${VIEW_MODE_MAP_TS} — the matcher is broken, not the tree`,
  )
if (rootPages.length < MIN_ROOT_PAGES)
  fail(`parsed only ${rootPages.length} Gtk.StackPage(s) from ${WINDOW_BLP} — the matcher is broken, not the tree`)
if (shellPages.length < MIN_SHELL_PAGES)
  fail(`parsed only ${shellPages.length} Adw.ViewStackPage(s) from ${WINDOW_BLP} — the matcher is broken, not the tree`)
if (routeForView.length < MIN_VIEWS)
  fail(`parsed only ${routeForView.length} ROUTE_FOR_VIEW entr(ies) — the matcher is broken, not the tree`)
if (!rootUnion.found || !shellUnion.found)
  fail(`could not parse ViewRoute's root/shell field unions from ${VIEW_MODE_MAP_TS} — the matcher is broken`)
if (backSteps.length < MIN_BACK_STEPS)
  fail(`parsed only ${backSteps.length} BACK_STEPS member(s) from ${BACK_ORDER_TS} — the matcher is broken`)
if (windowShortcuts.length < 1)
  fail(`parsed no WINDOW_SHORTCUTS row from ${ACCELS_TS} — the matcher is broken, not the tree`)

const modeSet = new Set(modes)
const viewNameSet = new Set(viewNames)
const rootPageSet = new Set(rootPages.map((p) => p.name))
const shellPageSet = new Set(shellPages.map((p) => p.name))
const routeMap = new Map(routeForView.map((e) => [e.key, e.fields]))
const modeForViewMap = new Map(modeForView.map((e) => [e.key, e.value]))

// 1. Every mode resolves to a view.
for (const mode of modes) {
  if (!viewForMode.some((e) => e.key === mode)) {
    fail(
      `EditorMode "${mode}" has no VIEW_FOR_MODE entry in ${VIEW_MODE_MAP_TS} — ` +
        'the switcher would advertise a place the user cannot reach. Add the view, or drop the mode.',
    )
  }
}

// 2. No route from a mode that does not exist, and the view it names is real.
for (const { key, value } of viewForMode) {
  if (!modeSet.has(key))
    fail(`VIEW_FOR_MODE has a "${key}" entry but "${key}" is not an EditorMode (${EDITOR_MODE_TS})`)
  if (value && !viewNameSet.has(value)) fail(`VIEW_FOR_MODE["${key}"] → "${value}" is not a ViewName`)
}

// 3. MODE_ORDER (what every mode-indexed iteration walks) is exactly the union.
for (const mode of modes) {
  if (!modeOrder.includes(mode))
    fail(`EditorMode "${mode}" is missing from MODE_ORDER in ${EDITOR_MODE_TS} — mode-indexed iteration skips it`)
}
for (const mode of modeOrder) {
  if (!modeSet.has(mode)) fail(`MODE_ORDER lists "${mode}", which is not an EditorMode (${EDITOR_MODE_TS})`)
}

// 4. Every view has a route, and nothing routes a view that does not exist.
for (const view of viewNames) {
  if (!routeMap.has(view)) fail(`ViewName "${view}" has no ROUTE_FOR_VIEW entry — the router cannot show it`)
}
for (const { key } of routeForView) {
  if (!viewNameSet.has(key)) fail(`ROUTE_FOR_VIEW has a "${key}" entry but "${key}" is not a ViewName`)
}

// 5. Both levels of every route land on a real page, and the two levels
//    agree: a shell page is reachable only through the `shell` root page,
//    and the root pages outside the shell must not name one.
for (const { key, fields } of routeForView) {
  const { root, shell } = fields
  if (root === undefined) {
    fail(`ROUTE_FOR_VIEW["${key}"] has no \`root\` — every view must name a ${WINDOW_BLP} root_stack page`)
  } else if (!rootPageSet.has(root)) {
    fail(`ROUTE_FOR_VIEW["${key}"].root → "${root}" is not a Gtk.StackPage name in ${WINDOW_BLP}`)
  }
  if (shell === undefined) {
    fail(`ROUTE_FOR_VIEW["${key}"] has no \`shell\` — write \`shell: null\` for a view outside the project shell`)
  } else if (shell !== null && !shellPageSet.has(shell)) {
    fail(`ROUTE_FOR_VIEW["${key}"].shell → "${shell}" is not an Adw.ViewStackPage name in ${WINDOW_BLP}`)
  } else if (shell !== null && root !== 'shell') {
    fail(`ROUTE_FOR_VIEW["${key}"] selects shell page "${shell}" but root page "${root}" — the shell is not shown`)
  } else if (shell === null && root === 'shell') {
    fail(`ROUTE_FOR_VIEW["${key}"] shows the shell but selects no page in it — the switcher would keep the last one`)
  }
}

// 6. The ViewRoute field unions cover every page in their stack, both
//    directions. A page missing from the union is a page no route can
//    name; a union member with no page is a route that cannot resolve.
for (const page of rootPageSet) {
  if (!rootUnion.members.includes(page))
    fail(`Gtk.StackPage "${page}" is missing from ViewRoute['root'] in ${VIEW_MODE_MAP_TS} — no route can name it`)
}
for (const member of rootUnion.members) {
  if (!rootPageSet.has(member))
    fail(`ViewRoute['root'] lists "${member}", which is not a Gtk.StackPage in ${WINDOW_BLP}`)
}
for (const page of shellPageSet) {
  if (!shellUnion.members.includes(page))
    fail(
      `Adw.ViewStackPage "${page}" is missing from ViewRoute['shell'] in ${VIEW_MODE_MAP_TS} — no route can select it`,
    )
}
for (const member of shellUnion.members) {
  if (!shellPageSet.has(member))
    fail(`ViewRoute['shell'] lists "${member}", which is not an Adw.ViewStackPage in ${WINDOW_BLP}`)
}
if (shellUnion.found && !shellUnion.nullable)
  fail(`ViewRoute['shell'] must admit \`null\` — \`welcome\` and \`map\` live outside the project shell`)

// 7. The shell's pages ARE the switcher's destinations, so here the
//    symmetric check holds: every shell page is a mode, every mode's
//    view is that shell page.
for (const page of shellPageSet) {
  if (!modeSet.has(page))
    fail(
      `Adw.ViewStackPage "${page}" is not an EditorMode (${EDITOR_MODE_TS}) — ` +
        'the view switcher would show a destination `win.mode` cannot select.',
    )
}
for (const { key, value } of viewForMode) {
  const route = routeMap.get(value)
  if (route && route.shell !== key)
    fail(
      `EditorMode "${key}" routes to view "${value}", which selects shell page "${route.shell}" — ` +
        'picking the destination would move the switcher somewhere else.',
    )
}

// 8. Every view is classified onto a shell destination (or explicitly
//    onto none), and that classification is exactly the shell page the
//    route selects — the switcher highlight and the shown page are the
//    same fact written twice.
for (const view of viewNames) {
  if (!modeForViewMap.has(view))
    fail(`ViewName "${view}" has no MODE_FOR_VIEW entry — the switcher highlight is undefined on that page`)
}
for (const { key, value } of modeForView) {
  if (!viewNameSet.has(key)) fail(`MODE_FOR_VIEW has a "${key}" entry but "${key}" is not a ViewName`)
  if (value !== null && !modeSet.has(value)) fail(`MODE_FOR_VIEW["${key}"] → "${value}" is not an EditorMode`)
  const route = routeMap.get(key)
  if (route && route.shell !== undefined && route.shell !== value)
    fail(
      `MODE_FOR_VIEW["${key}"] → ${value === null ? 'null' : `"${value}"`} but ` +
        `ROUTE_FOR_VIEW["${key}"].shell → ${route.shell === null ? 'null' : `"${route.shell}"`} — ` +
        'the highlighted destination and the shown page disagree.',
    )
}

// 9. A switcher destination needs a label and an icon: `Adw.ViewSwitcher`
//    and `Adw.ViewSwitcherBar` render nothing else, so a page without
//    them is a blank button.
for (const page of shellPages) {
  if (page.name === null) fail(`an Adw.ViewStackPage in ${WINDOW_BLP} has no \`name\` — the router cannot select it`)
  if (!page.hasTitle)
    fail(`Adw.ViewStackPage "${page.name}" has no \`title\` — the switcher renders an unlabelled button`)
  if (!page.hasIcon)
    fail(`Adw.ViewStackPage "${page.name}" has no \`icon-name\` — the phone switcher bar shows no icon`)
}

// 10. The phone navigation: the bottom bar must point at the shell stack
//     and be revealed by the breakpoint, and every shell page must hand
//     its wide-screen switcher over to it by going compact. Miss either
//     half and a phone loses all top-level navigation — the failure the
//     screenshot pass at 360 px exists to catch, caught here instead.
if (!/Adw\.ViewSwitcherBar\s+view_switcher_bar\s*\{[^}]*\bstack:\s*shell_stack\s*;/.test(stripComments(windowBlp)))
  fail(`${WINDOW_BLP}: \`Adw.ViewSwitcherBar view_switcher_bar\` does not bind \`stack: shell_stack\``)
if (!setters.some((s) => s.target === 'view_switcher_bar' && s.property === 'reveal' && s.value === 'true'))
  fail(`${WINDOW_BLP}: no breakpoint sets \`view_switcher_bar.reveal: true\` — the phone has no navigation`)
for (const page of shellPages) {
  if (page.childId === null) {
    fail(`Adw.ViewStackPage "${page.name}" declares no \`child: $Type id {}\` — cannot check its compact setter`)
    continue
  }
  if (!setters.some((s) => s.target === page.childId && s.property === 'compact' && s.value === 'true'))
    fail(
      `${WINDOW_BLP}: no breakpoint sets \`${page.childId}.compact: true\` — ` +
        `the "${page.name}" page would keep its wide switcher next to the phone switcher bar.`,
    )
}

// 11. The map editor is a permanent `root_stack` child. The engine tears
//     its Excalibur instance down in `vfunc_unroot`, so moving the view
//     between stacks — or nesting it where a parent can be replaced —
//     kills the loop for good (REDESIGN.md § 10, risk 4).
const mapPage = rootPages.find((p) => p.name === 'map')
if (!mapPage) {
  fail(`${WINDOW_BLP}: no Gtk.StackPage named "map" — the scene editor must be a direct root_stack page`)
} else if (mapPage.childType !== '$SceneEditorView') {
  fail(
    `${WINDOW_BLP}: root_stack page "map" has child ${mapPage.childType ?? '(none)'} rather than $SceneEditorView — ` +
      "the scene editor must be rooted there for the app's lifetime, never reparented.",
  )
}

// 12. Every shell destination carries the roster chip at its header end.
//     "Who else is here" is a property of the session, not of the map, so
//     all four destinations show it (REDESIGN.md § 3.3) — but the chip
//     hides itself on an empty roster, which made the omission invisible:
//     it was present only in the map editor's context pill, and no solo
//     screenshot or smoke run could show the other three were missing it.
//     Two halves are needed and each is useless alone: the `.blp`
//     declaration builds the widget, the `InternalChildren` entry is what
//     binds it to `_roster_chip` so `ResponsiveEditorView` can push the
//     roster into it. The map editor's chip lives in the pill, not a
//     header, so it is covered by `DebugStatus.rosterChipViews` instead.
const ROSTER_CHIP_TYPE = '$PixelRpgRosterChip'
for (const page of shellPages) {
  if (page.childId === null) continue // already reported by check 10
  const widget = page.childId.replace(/_/g, '-')
  for (const ext of ['blp', 'ts']) {
    const path = `apps/maker-gjs/src/widgets/${widget}.${ext}`
    let source
    try {
      source = stripComments(readFileSync(join(ROOT, path), 'utf8'))
    } catch {
      fail(`${WINDOW_BLP}: shell page "${page.name}" has child \`${page.childId}\` but ${path} does not exist`)
      continue
    }
    if (ext === 'blp') {
      const declared = new RegExp(`\\[end\\]\\s*\\${ROSTER_CHIP_TYPE}\\s+roster_chip\\s*\\{`).test(source)
      if (!declared)
        fail(
          `${path}: no \`[end] ${ROSTER_CHIP_TYPE} roster_chip {}\` in the header — ` +
            `the "${page.name}" destination would not show who else is in the session.`,
        )
    } else if (!/InternalChildren:[\s\S]*?\]/.exec(source)?.[0]?.includes("'roster_chip'")) {
      fail(
        `${path}: \`roster_chip\` is missing from \`InternalChildren\` — ` +
          'the chip is built but never bound, so setCollaborators() silently does nothing.',
      )
    }
  }
}

// 13. Back is navigation too, and it is declared across four files
//     (REDESIGN.md § 3.4): the step order in `back-order.ts`, the
//     performer per step in `back-actions.ts`, the keys in `accels.ts`
//     and the gesture controllers in `application-window.ts`. None of
//     the three seams `tsc` cannot see is loud when it breaks — a back
//     that does nothing looks exactly like a back with nothing to undo:
//      - the `switch` in `installBackActions` has no `never` arm, so a
//        new `BackStep` falls through it and the step is silently a
//        no-op;
//      - `_installBackGestures` looks its handler up in a
//        `Record<string, …>`, so a key declared with no handler is dead
//        and only warns at runtime, where nobody is reading;
//      - the controllers must stay in the BUBBLE phase. In the capture
//        phase `Escape` is taken from every popover, dialog and entry
//        before the focused widget is asked.
//     That `WINDOW_SHORTCUTS` and `WINDOW_ACCELS` share no key is
//     checked in `accels.spec.ts` instead — both tables are plain data
//     a spec can import.
const backStepNames = new Set(backSteps)
for (const step of backSteps) {
  const body = backActionsTs.match(new RegExp(`case '${step}':([\\s\\S]*?)\\bbreak\\b`))?.[1]
  if (body === undefined) {
    fail(
      `${BACK_ACTIONS_TS}: BackStep "${step}" has no \`case '${step}':\` in installBackActions — ` +
        'the step resolves and then nothing happens. Add the arm, or drop the step.',
    )
    continue
  }
  if (step === 'none') continue
  const performer = camel(step)
  if (!body.includes(`ctx.${performer}(`))
    fail(
      `${BACK_ACTIONS_TS}: \`case '${step}':\` does not call \`ctx.${performer}()\` — ` +
        'a back step and its performer are named the same thing on purpose.',
    )
  if (!new RegExp(`\\b${performer}\\(\\):`).test(backActionsTs))
    fail(`${BACK_ACTIONS_TS}: BackActionsContext declares no \`${performer}()\` for BackStep "${step}"`)
}
if (!backStepNames.has('none'))
  fail(`${BACK_ORDER_TS}: BACK_STEPS has no "none" member — the gestures cannot tell "handled" from "nothing to undo"`)

// Anchored on the DEFINITION, not the call: the call comes first in the
// file, and a body read from there would be the next unrelated literal.
const backGesturesAt = windowTs.search(/private\s+_installBackGestures\s*\(/)
const backGestures = backGesturesAt === -1 ? null : braceBody(windowTs, backGesturesAt)
if (!/\bthis\._installBackGestures\(performBack\)/.test(windowTs) || backGestures === null) {
  fail(
    `${WINDOW_TS}: no \`this._installBackGestures(performBack)\` with a body — ` +
      '`Esc`, `Alt+←` and the mouse back button would not be bound at all.',
  )
} else {
  for (const { action } of windowShortcuts) {
    if (!backGestures.includes(`'${action}':`))
      fail(
        `${WINDOW_TS}: _installBackGestures has no handler for the window shortcut "${action}" — ` +
          `its ${ACCELS_TS} keys are dead, and only a runtime console.warn says so.`,
      )
  }
  const bubbles = [...backGestures.matchAll(/set_propagation_phase\(Gtk\.PropagationPhase\.(\w+)\)/g)]
  if (bubbles.length < 2)
    fail(
      `${WINDOW_TS}: _installBackGestures sets a propagation phase on ${bubbles.length} of its 2 controllers — ` +
        'an unset phase is BUBBLE by default, but the keyboard and mouse backs must say so together.',
    )
  for (const [, phase] of bubbles) {
    if (phase !== 'BUBBLE')
      fail(
        `${WINDOW_TS}: _installBackGestures puts a controller in the ${phase} phase — ` +
          'only BUBBLE lets the focused widget answer first, which is why these keys are not application accels.',
      )
  }
}

if (failures.length > 0) {
  for (const message of failures) console.error(`✗ ${message}`)
  console.error(
    `\n${failures.length} mode-route violation(s). Every EditorMode must be an Adw.ViewStackPage of the shell ` +
      'with a VIEW_FOR_MODE entry and a ROUTE_FOR_VIEW route behind it — a destination with no page is a ' +
      'navigation dead end. Back is held to the same bar: every BackStep needs a performer and every back ' +
      'key a handler, or the way out is the dead end instead.',
  )
  process.exit(1)
}
console.log(
  `✓ All ${modes.length} shell destinations route to a real view ` +
    `(${rootPages.length} root pages, ${shellPages.length} shell pages, ${viewNames.length} views)`,
)

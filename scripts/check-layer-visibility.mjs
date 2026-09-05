#!/usr/bin/env node
/**
 * Layer-visibility guard.
 *
 * `LayerData.visible` has ONE meaning and it is not the obvious one: an
 * ABSENT key means visible. Only an explicit `false` hides a layer. That
 * default lives in exactly one place — `isLayerDataVisible` in
 * `packages/engine/src/services/layer-visibility.ts` — and every reader
 * is supposed to call it.
 *
 * Readers kept not calling it. The 2026-09-04 sweep found FIVE direct
 * reads across two packages, three of them plain truthiness tests, all
 * disagreeing with the renderer about the same layer:
 *  - `MapResource.getAvailableLayerIds()` — such a layer rendered on
 *    screen and toggled correctly but never appeared in the picker.
 *  - `services/agent-map-data.ts` — dropped from the agent's walkability
 *    fold entirely: its solid tiles read as walkable, its tiles as void.
 *  - `systems/walk-on-tile.system.ts` — its `tileProperties` were never
 *    read at runtime while the very same layer was visibly painted.
 *  - `packages/gjs`'s `map-preview.ops.ts` / `map-preview.geometry.ts` —
 *    missing from every welcome-view and atlas card preview. A spec in
 *    that package even PINNED the wrong behaviour rather than fixing it
 *    ("treats an absent `visible` flag as hidden (the layer picker
 *    disagrees)"), which is how a defect survives a test suite.
 *
 * Fixing five call sites fixes nothing structurally — the sixth reader
 * writes the same bug. So this guard fails (exit 1) on any `.visible`
 * access under a workspace package's `src/**` whose receiver is a LAYER
 * (see `LAYER_RECEIVER` / `INDEXED_LAYER_ACCESS`), unless its line, or
 * the comment block directly above it, carries the
 * `layer-visibility-ok:` marker AND its file is listed in
 * `EXPECTED_EXEMPTIONS` below.
 *
 * The marker alone is not enough: pinning the exempt FILES here means a
 * new exemption cannot appear without editing this script, so a
 * deliberate exception stays distinguishable from a comment someone
 * added to silence the guard.
 *
 * The pinning counts a file only when a marker actually SUPPRESSED a
 * would-be violation — not merely because the file mentions the marker
 * string. `packages/gjs`'s layers-tab documents its many GTK
 * `widget.visible` lines with the marker for human readers even though
 * their receivers were never matched; pinning on mere presence would
 * turn that good comment into a build failure and couple this list to
 * other packages' comment style.
 *
 * WHY IT MATCHES BY RECEIVER NAME, and what that costs. The obvious
 * design — flag every `.visible` and exempt the non-layer receivers by
 * name — was written first and MEASURED: 11 hits, of which 8 were GTK
 * widget properties (`Gtk.Widget.visible` on a row / a story's control
 * bag / a widget's construct params) and Excalibur's per-entity
 * `graphics.visible`. A 73% false-positive rate, growing with every new
 * widget, and an exemption list that would have to absorb view-layer
 * files having nothing to do with map data. A guard with a standing
 * false-positive list is one people learn to scroll past. Matching the
 * receiver instead inverts that: zero false positives on today's tree.
 *
 * The accepted residual: a `LayerData` value bound to a name outside
 * `LAYER_RECEIVER` (`for (const entry of mapData.layers)`) slips
 * through. Mitigation is cheap and local — add the name below. Indexed
 * forms (`mapData.layers[0].visible`) ARE caught, via
 * `INDEXED_LAYER_ACCESS`, because those have no binding to name.
 *
 * Deliberate scope decisions:
 *  - `*.spec.ts` is NOT scanned. A test asserting the raw persisted
 *    `LayerData.visible` field after a command ran is asserting exactly
 *    the right thing; the rule governs production readers. (The one
 *    thing a spec must not do is pin the WRONG default — that is a code
 *    review concern, not something a source scanner can judge.)
 *  - Comments and string literals are blanked before matching, so
 *    `.visible` in prose or in a message never reports. Template-literal
 *    `${…}` interpolations are NOT blanked: an expression there is real
 *    code and a read hiding inside one must still be caught.
 *  - Both reads and WRITES are matched. `layer.visible = x` outside the
 *    owning command is as much a defect as a bad read, so the guard does
 *    not try to tell them apart.
 *  - `.blp` files are not scanned: `button.visible: true;` there is a GTK
 *    widget property, a different concept with a different type.
 *
 * Runs in CI (Node is already provisioned for the gjsify CLI bootstrap)
 * and locally via `gjsify run check:layer-visibility` at the workspace
 * root.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Marker that exempts one line (or the line above it) from the rule. */
const ALLOW_MARKER = 'layer-visibility-ok'

/**
 * Identifiers this repo binds a `LayerData` to. Everything else that
 * carries a `.visible` — `graphics`, `widget`, `row`, `params`, `args`,
 * a command `payload` — is a different concept with a different type.
 * Extend this list when a new binding name appears; that is the intended
 * maintenance cost of a receiver-matched guard.
 */
const LAYER_RECEIVER = /^(?:l|layer|layerData|layerDescriptor|layerInfo|layerEntry)$/

/**
 * Indexed access straight off a layer collection —
 * `mapData.layers[0].visible`, `layers[i].visible`. Those have no
 * binding to name, so they are matched on the expression text instead.
 * Checked against the code immediately preceding the access.
 */
const INDEXED_LAYER_ACCESS = /\blayers\s*\[[^\]]*\]\s*$/

/**
 * Files allowed to SUPPRESS a layer-`.visible` access with a
 * `layer-visibility-ok` marker, and why. Pinned so a new exemption
 * cannot appear without editing this list. Keys are workspace-root-
 * relative POSIX paths.
 */
const EXPECTED_EXEMPTIONS = {
  'packages/engine/src/services/layer-visibility.ts': 'the predicate itself — it owns the absent-is-visible default',
  'packages/engine/src/commands/layer-flag.command.ts':
    'the WRITE that owns the flag; reading it back through the predicate would be circular',
}

/**
 * Minimum number of source files the scan must see. A walk that silently
 * returns nothing would report "0 violations" and look identical to a
 * clean tree — the exact failure mode this repo's guards exist to avoid.
 */
const MIN_SCANNED_FILES = 200

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

/** Recursively collect production `*.ts`/`*.mts` files under `dir` (skips node_modules/dist and specs). */
function collectSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc)
      continue
    }
    if (entry.name.endsWith('.spec.ts')) continue
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.mts')) acc.push(full)
  }
  return acc
}

/**
 * Blank out comments and string literals so a `.visible` mentioned in
 * prose or inside a message is not reported. Newlines are preserved so
 * line numbers stay accurate. Template-literal `${…}` interpolations are
 * left as code on purpose — see the module note.
 */
function blankNonCode(source) {
  const out = source.split('')
  const n = source.length
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  while (i < n) {
    const two = source.slice(i, i + 2)
    if (two === '//') {
      let end = source.indexOf('\n', i)
      if (end === -1) end = n
      blank(i, end)
      i = end
      continue
    }
    if (two === '/*') {
      let end = source.indexOf('*/', i + 2)
      end = end === -1 ? n : end + 2
      blank(i, end)
      i = end
      continue
    }
    const ch = source[i]
    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < n) {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === ch) break
        j++
      }
      blank(i + 1, Math.min(j, n))
      i = Math.min(j + 1, n)
      continue
    }
    if (ch === '`') {
      let j = i + 1
      let textStart = j
      while (j < n) {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === '`') break
        if (source[j] === '$' && source[j + 1] === '{') {
          blank(textStart, j)
          let depth = 1
          j += 2
          while (j < n && depth > 0) {
            if (source[j] === '{') depth++
            else if (source[j] === '}') depth--
            j++
          }
          textStart = j
          continue
        }
        j++
      }
      blank(textStart, Math.min(j, n))
      i = Math.min(j + 1, n)
      continue
    }
    i++
  }
  return out.join('')
}

/**
 * Whether the comment block directly above `line` (1-based) carries the
 * marker. The whole block counts, not just the line immediately above —
 * an exemption usually needs a sentence or two of reason.
 */
function markedAbove(lines, line) {
  for (let i = line - 2; i >= 0; i--) {
    const text = (lines[i] ?? '').trim()
    if (text === '') continue
    if (!text.startsWith('//') && !text.startsWith('*') && !text.startsWith('/*')) return false
    if (text.includes(ALLOW_MARKER)) return true
  }
  return false
}

const violations = []
/** Files where a marker actually suppressed a layer-`.visible` access. */
const suppressingFiles = new Set()
let scanned = 0

for (const dir of listWorkspacePackageDirs(ROOT)) {
  const srcDir = join(ROOT, dir, 'src')
  let sourceFiles
  try {
    sourceFiles = collectSourceFiles(srcDir)
  } catch {
    continue // no src/ directory (e.g. games/* data-only packages)
  }

  for (const file of sourceFiles) {
    scanned++
    const rel = relative(ROOT, file).split('\\').join('/')
    const raw = readFileSync(file, 'utf8')
    const rawLines = raw.split('\n')
    const code = blankNonCode(raw)
    const pattern = /\??\.\s*visible\b/g
    for (let match = pattern.exec(code); match !== null; match = pattern.exec(code)) {
      const preceding = code.slice(0, match.index)
      const line = preceding.split('\n').length
      const identifier = preceding.match(/([A-Za-z_$][\w$]*)\s*$/)
      const isLayerAccess = identifier ? LAYER_RECEIVER.test(identifier[1]) : INDEXED_LAYER_ACCESS.test(preceding)
      if (!isLayerAccess) continue
      const lineText = rawLines[line - 1] ?? ''
      if (lineText.includes(ALLOW_MARKER) || markedAbove(rawLines, line)) {
        suppressingFiles.add(rel)
        continue
      }
      violations.push({ file: rel, line, text: lineText.trim() })
    }
  }
}

let failures = 0

if (scanned < MIN_SCANNED_FILES) {
  console.error(
    `✗ scanned only ${scanned} source file(s), expected at least ${MIN_SCANNED_FILES} — the walk is broken, not the tree`,
  )
  failures++
}

for (const { file, line, text } of violations) {
  console.error(`✗ ${file}:${line} touches \`layer.visible\` directly — use isLayerDataVisible() (${text})`)
  failures++
}

const unexpected = [...suppressingFiles].filter((file) => !Object.hasOwn(EXPECTED_EXEMPTIONS, file)).sort()
for (const file of unexpected) {
  console.error(
    `✗ ${file} suppresses a layer \`.visible\` access with "${ALLOW_MARKER}" but is not listed in EXPECTED_EXEMPTIONS`,
  )
  failures++
}
const stale = Object.keys(EXPECTED_EXEMPTIONS)
  .filter((file) => !suppressingFiles.has(file))
  .sort()
for (const file of stale) {
  console.error(`✗ ${file} is listed in EXPECTED_EXEMPTIONS but no longer suppresses anything — drop the entry`)
  failures++
}

if (failures > 0) {
  console.error(
    `\n${failures} layer-visibility violation(s). Route every read through isLayerDataVisible() ` +
      '(packages/engine/src/services/layer-visibility.ts) — an ABSENT `visible` key means VISIBLE.',
  )
  process.exit(1)
}
console.log(
  `✓ Every layer \`.visible\` access under src/** goes through the shared predicate (${scanned} files scanned)`,
)

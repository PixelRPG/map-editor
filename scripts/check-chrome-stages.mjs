#!/usr/bin/env node
/**
 * The scene editor's disclosure ladder is declared twice and must agree.
 *
 * `packages/gjs/src/widgets/editor/scene-editor.blp` holds the
 * `Adw.BreakpointBin` conditions that decide which rung is proposed;
 * `chrome-stages.ts` holds `STAGE_MIN_CANVAS_PX`, which every rule and
 * every test reads. Nothing in TypeScript can see a Blueprint condition,
 * so a threshold changed on one side and not the other is invisible: the
 * app keeps working, the tests keep passing, and the two pills quietly
 * overlap at some window size nobody happened to try.
 *
 * That is the bug this guard covers. It surfaced while measuring the
 * redesign: the design's §2.4 thresholds (604 / 664 / 784 / 1124) were
 * all below what the pills actually measure, so the pills collided at a
 * 620 px and a 784 px canvas. The first measured set (656 / 704 / 856 /
 * 1136) was itself 8 px low below `normal-2`; the ladder is now
 * 672 / 720 / 856 / 1144, read off GTK by `phone-chrome.probe.spec.ts`.
 *
 * This guard sees ONLY the wide layout's ladder. It cannot see the phone
 * bar or the sheet: their floor is the ladder's `width-request`, and a
 * child wider than that overflows the window silently. That class is
 * covered by the display-backed probe, which CI runs under Broadway.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BLP = 'packages/gjs/src/widgets/editor/scene-editor.blp'
const TS = 'packages/gjs/src/widgets/editor/chrome-stages.ts'

/** A ladder with fewer rungs than this means the parse broke, not the tree. */
const MIN_RUNGS = 4

function fail(message) {
  console.error(`✗ ${message}`)
  process.exitCode = 1
}

/** Every `min-width: <n>sp` in a `Adw.Breakpoint` condition, in file order. */
function blueprintThresholds(source) {
  return [...source.matchAll(/condition\s*\(\s*"min-width:\s*(\d+)sp"\s*\)/g)].map((m) => Number(m[1]))
}

/** `STAGE_MIN_CANVAS_PX`'s non-zero values, in declaration order. */
function tsThresholds(source) {
  const start = source.indexOf('STAGE_MIN_CANVAS_PX')
  if (start < 0) return null
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  if (open < 0 || close < 0) return null
  return [...source.slice(open, close).matchAll(/:\s*(\d+)\s*,/g)].map((m) => Number(m[1])).filter((n) => n > 0)
}

const blp = readFileSync(join(root, BLP), 'utf8')
const ts = readFileSync(join(root, TS), 'utf8')

const fromBlp = blueprintThresholds(blp)
const fromTs = tsThresholds(ts)

if (fromTs === null) {
  fail(`could not find STAGE_MIN_CANVAS_PX in ${TS} — the parse is broken, not the tree`)
} else if (fromBlp.length < MIN_RUNGS) {
  fail(`only ${fromBlp.length} breakpoint conditions in ${BLP}, expected at least ${MIN_RUNGS}`)
} else if (fromBlp.length !== fromTs.length) {
  fail(`${BLP} declares ${fromBlp.length} rungs, ${TS} declares ${fromTs.length}`)
} else {
  const drifted = fromBlp.map((v, i) => [v, fromTs[i]]).filter(([a, b]) => a !== b)
  if (drifted.length) {
    fail(
      `the ladder disagrees with itself: ${BLP} says [${fromBlp}], ${TS} says [${fromTs}].\n` +
        '  A rung whose Blueprint condition and STAGE_MIN_CANVAS_PX differ is proposed at one\n' +
        '  width and reasoned about at another, which is how the pills came to overlap.',
    )
  }
}

const ascending = fromBlp.every((v, i) => i === 0 || v > fromBlp[i - 1])
if (!ascending) {
  fail(
    `the breakpoint conditions in ${BLP} are not in ascending order: [${fromBlp}].\n` +
      '  Adw.BreakpointBin iterates in reverse and breaks on the first match, so the\n' +
      '  widest matching rung has to come last or a narrow one wins on a wide canvas.',
  )
}

if (!process.exitCode) {
  console.log(`✓ chrome ladder agrees across ${fromBlp.length} rungs: [${fromBlp}]`)
}

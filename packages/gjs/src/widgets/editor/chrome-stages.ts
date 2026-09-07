// The scene editor's disclosure ladder, as data.
//
// `Adw.BreakpointBin` activates exactly ONE breakpoint at a time
// (adw-breakpoint-bin.c iterates in reverse and breaks on the first
// match), so setters do not stack: every stage has to declare its full
// visible set. Writing that out five times as `visible:` setters is how
// the bar this replaces ended up with two complete button hierarchies
// and a menu rebuilt from button visibility.
//
// Instead the ladder sets ONE property — the stage name — and this
// module turns (stage, layout, playing) into the flags. GTK-free, so
// "undo is visible at every stage" is a unit test rather than five
// blocks of Blueprint a reader has to diff by eye.

/** The five widths the wide layout distinguishes, narrowest first. */
export type ChromeStage = 'tight' | 'compact' | 'normal-1' | 'normal-2' | 'roomy'

export const CHROME_STAGES: readonly ChromeStage[] = ['tight', 'compact', 'normal-1', 'normal-2', 'roomy'] as const

/** The two chrome layouts. `phone` is what the window's <768sp breakpoint selects. */
export type ChromeLayout = 'wide' | 'phone'

/**
 * Canvas width, in px, at which each rung starts: `STAGE_EDITING_PILL_PX`
 * plus a context pill WITH a roster in it (150 px) plus 32 px of margin
 * and gap, rounded up to a multiple of 8.
 *
 * The with-roster case is the threshold rather than the solo one on
 * purpose. A solo session then reaches each rung ~42 px later than it
 * strictly must, which nobody can see; keying on the solo width instead
 * means the pills overlap the moment anyone joins — and the AI assistant
 * joins whenever the editor is driven by an agent, so that is the common
 * case, not the corner one. `effectiveStage` still demotes on top of
 * this for a roster wider than one avatar.
 *
 * These are NOT the design's numbers. Its §2.4 table derives them from
 * per-button arithmetic and lands low at every rung (604 vs 672, 664 vs
 * 720, 784 vs 856, 1124 vs 1160), because a labelled `Adw.Toggle` is
 * wider than an icon plus a word. The first measured set (656 / 704 /
 * 856 / 1136) was still 8 px low below `normal-2`: both pill tables were
 * read 8 px short, so `phone-chrome.probe.spec.ts` now measures the pills
 * with GTK and refuses a table that drifts. `chrome-stages.spec.ts`
 * refuses a rung whose own pill cannot fit at its own threshold, and
 * `scripts/check-chrome-stages.mjs` holds the `.blp` conditions to these
 * four numbers.
 */
export const STAGE_MIN_CANVAS_PX: Record<ChromeStage, number> = {
  tight: 0,
  compact: 672,
  'normal-1': 720,
  'normal-2': 856,
  roomy: 1160,
}

/** The stage a canvas of `width` px lands in. */
export function stageForCanvasWidth(width: number): ChromeStage {
  let stage: ChromeStage = 'tight'
  for (const candidate of CHROME_STAGES) {
    if (width >= STAGE_MIN_CANVAS_PX[candidate]) stage = candidate
  }
  return stage
}

/**
 * How much of the canvas the context pill needs — its natural width as
 * GTK measures it (`measure()`, the pill box without the handle's
 * margin): 108 px with no roster, 150 px once one avatar is in it.
 *
 * The design's stage table sums a 100 px right pill at every rung and
 * never adds the roster. That is what made two rungs overlap in the real
 * app: at a 620 px canvas the editing pill measured 479 px and the
 * context pill 142, and 479 + 142 + 24 px of margins + an 8 px gap is
 * 653 — 33 px more than there is; at 784 px the same sum came to 938.
 * The roster is present whenever anyone else is in the session, the AI
 * assistant included, so it is not a rare case. Those first readings
 * were themselves 8 px short of what GTK reports for the same pills;
 * `phone-chrome.probe.spec.ts` keeps this table at the measured value.
 */
export const CONTEXT_PILL_PX = { solo: 108, withRoster: 150 } as const

/**
 * Natural width of the editing pill at each rung — `measure()` on the
 * pill box with the package stylesheet loaded and "Paint · Ground" as the
 * brush sentence, the numbers `phone-chrome.probe.spec.ts` reads back —
 * rather than derived from the design's per-button arithmetic, which
 * came out 5-20 % low at every rung above `tight`, because a labelled
 * `Adw.Toggle` is wider than the sum of an icon and a word.
 *
 * The two labelled rungs vary with the font as well as the text (a
 * "Select" is 9 px wider than a "Paint"; CI's font stack renders the
 * sentence 8 px and the six verbs 14 px wider than this workstation's),
 * so they are held ABOVE the widest reading: a table that is low lets a
 * rung in whose pills then overlap, a table that is high delays it by
 * pixels nobody sees. The probe holds the unsafe direction to 2 px.
 * Refresh these together whenever the pill gains or loses a control; the
 * fit rule below is what turns them into behaviour, and
 * `chrome-stages.spec.ts` checks the table stays monotonic.
 */
export const STAGE_EDITING_PILL_PX: Record<ChromeStage, number> = {
  tight: 264,
  compact: 489,
  'normal-1': 537,
  'normal-2': 656,
  roomy: 976,
}

/** What the two pills and the bar show, for one state of the chrome. */
export interface ChromeFlags {
  /** The whole start-aligned editing pill — wide only; on phone nothing is left in it. */
  editingPill: boolean
  /** The circular "‹", phone's only supported exit (decision 20). */
  backCircle: boolean
  /** The library sidebar toggle — there is no rail to open on phone. */
  libraryToggle: boolean
  /** "World" beside the back arrow. */
  backLabel: boolean
  /** Undo in the editing pill (wide) … */
  undoButton: boolean
  /** … and undo in the context pill (phone). Exactly one of the two. */
  phoneUndo: boolean
  /** Redo — a button on wide, a "⋯" item on phone. */
  redoButton: boolean
  /** The tool chooser. */
  toolGroup: boolean
  /** Verbs beside the six tool icons. */
  toolLabels: boolean
  /** Four tools instead of six. */
  toolsArePhoneSet: boolean
  /** The sentence beside the badge, "Paint · Ground". */
  badgeLabel: boolean
  /** The inspector toggle — on phone the sheet is the inspector. */
  inspectorToggle: boolean
  /** The "⋯" menu. */
  overflowButton: boolean
  /** ■ Stop and ↺ Restart, which take the context pill during a phone run. */
  runtimeControls: boolean
  /** The Play FAB. */
  playFab: boolean
  /** The docked bottom bar. */
  bottomBar: boolean
}

/** The 12 px margin each pill sits inside, plus the gap S1 asks to keep between them. */
export const PILL_MARGINS_PX = 24
export const MIN_PILL_GAP_PX = 8

/**
 * Whether both pills fit side by side in `canvasPx` with at least an
 * 8 px gap. The acceptance criterion S1 in prose, so the stage rules are
 * checked against it rather than against a remembered screenshot.
 */
export function pillsFit(editingPillPx: number, contextPillPx: number, canvasPx: number): boolean {
  return editingPillPx + contextPillPx + PILL_MARGINS_PX + MIN_PILL_GAP_PX <= canvasPx
}

/**
 * The rung actually used: the `Adw.BreakpointBin` proposes one from the
 * canvas width alone, and this steps down until the two pills fit.
 *
 * A width table cannot decide this by itself, because the context pill's
 * width is not a function of the canvas: a session with an AI assistant
 * in it needs 42 px more than a solo one at the same size. Patching the
 * table per case is what produced this comment twice; the fit check
 * makes the whole class visible instead — every rung is affordable or it
 * is not taken, at any context-pill width, present or future.
 */
export function effectiveStage(proposed: ChromeStage, canvasPx: number, contextPillPx: number): ChromeStage {
  let rank = CHROME_STAGES.indexOf(proposed)
  if (rank < 0) return 'tight'
  while (rank > 0 && !pillsFit(STAGE_EDITING_PILL_PX[CHROME_STAGES[rank]], contextPillPx, canvasPx)) rank--
  return CHROME_STAGES[rank]
}

/**
 * The visible set for one state of the chrome.
 *
 * Two invariants the spec pins, because both were broken by the layout
 * this replaces:
 *
 * - **Undo is reachable at every stage and in both layouts.** The old
 *   ladder pushed it into an overflow menu below 460sp, which on a phone
 *   made the only undo on touch two taps deep.
 * - **The armed tool is nameable at every stage.** Where the tool group
 *   is hidden (the "tight" stage: two sidebars open on a small desktop,
 *   or a tablet with the inspector out), the badge still carries the
 *   tool's icon, and its popover starts with the tool group.
 */
export function chromeFlags(stage: ChromeStage, layout: ChromeLayout, playing: boolean): ChromeFlags {
  const phone = layout === 'phone'
  const running = phone && playing
  const rank = CHROME_STAGES.indexOf(stage)
  return {
    editingPill: !phone,
    backCircle: phone && !running,
    libraryToggle: !phone,
    backLabel: !phone && rank >= CHROME_STAGES.indexOf('normal-1'),
    undoButton: !phone,
    phoneUndo: phone && !running,
    redoButton: !phone,
    // On phone the bar always carries the four tools; on wide the group
    // is the first thing the ladder drops, because the badge covers it.
    toolGroup: phone ? !running : rank >= CHROME_STAGES.indexOf('compact'),
    toolLabels: !phone && stage === 'roomy',
    toolsArePhoneSet: phone,
    badgeLabel: !phone && rank >= CHROME_STAGES.indexOf('normal-2'),
    inspectorToggle: !phone,
    overflowButton: !running,
    runtimeControls: running,
    playFab: !running,
    bottomBar: phone && !playing,
  }
}

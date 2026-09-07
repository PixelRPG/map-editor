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
 * Canvas width, in px, at which each stage starts. These are the design's
 * bar widths plus the 24 px of margins the pills sit inside, because the
 * `Adw.BreakpointBin` measures the canvas and the bar is what has to fit.
 * Kept here beside the flags so the `.blp` conditions and the tests read
 * the same numbers.
 */
export const STAGE_MIN_CANVAS_PX: Record<ChromeStage, number> = {
  tight: 0,
  compact: 604,
  'normal-1': 664,
  'normal-2': 784,
  roomy: 1124,
}

/** The stage a canvas of `width` px lands in. */
export function stageForCanvasWidth(width: number): ChromeStage {
  let stage: ChromeStage = 'tight'
  for (const candidate of CHROME_STAGES) {
    if (width >= STAGE_MIN_CANVAS_PX[candidate]) stage = candidate
  }
  return stage
}

/** What the two pills and the bar show, for one (stage, layout, playing). */
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

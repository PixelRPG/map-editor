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
 * plus a context pill WITH a roster in it (192 px) plus 32 px of margin
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
 * per-button arithmetic and lands low at every rung, because a labelled
 * `Adw.Toggle` is wider than an icon plus a word. The first measured set
 * was itself 8 px low below `normal-2` — both pill tables were read
 * 8 px short — so `phone-chrome.probe.spec.ts` now measures the pills
 * with GTK and refuses a table that drifts; that is also what caught
 * this set the hour the library toggle left the pill: 42 px narrower at
 * every rung, so every threshold moved down one or two multiples of 8.
 * `chrome-stages.spec.ts`
 * refuses a rung whose own pill cannot fit at its own threshold, and
 * `scripts/check-chrome-stages.mjs` holds the `.blp` conditions to these
 * four numbers.
 */
export const STAGE_MIN_CANVAS_PX: Record<ChromeStage, number> = {
  tight: 0,
  compact: 672,
  'normal-1': 768,
  'normal-2': 880,
  roomy: 1176,
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
 * margin): 186 px solo (map name and window controls included), 192 px
 * once an avatar replaces the roster chip's invite icon.
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
 *
 * `solo` grew 36 px when the roster chip stopped hiding itself on an
 * empty roster (REDESIGN § 4.7): solo it is the invite affordance, so
 * the pill now carries a chip at every roster size and the two figures
 * differ only by icon-versus-avatar.
 */
export const CONTEXT_PILL_PX = { solo: 186, withRoster: 192 } as const

/**
 * Natural width of the editing pill at each rung — `measure()` on the
 * pill box with the package stylesheet loaded and "Paint · Ground" as the
 * brush sentence, the numbers `phone-chrome.probe.spec.ts` reads back —
 * rather than derived from the design's per-button arithmetic, which
 * came out 5-20 % low at every rung above `tight`, because a labelled
 * `Adw.Toggle` is wider than the sum of an icon and a word.
 *
 * The two labelled rungs vary with the text (a "Select" is 9 px wider
 * than a "Paint"; a long layer name adds more) and with the font, so
 * the probe pins the font to GNOME's default, "Adwaita Sans 11", and
 * reads the same number on a workstation, under Broadway and in CI —
 * these are that reading, rounded up. Refresh them together whenever
 * the pill gains or loses a control; the fit rule below is what turns
 * them into behaviour, and `chrome-stages.spec.ts` checks the table
 * stays monotonic.
 */
export const STAGE_EDITING_PILL_PX: Record<ChromeStage, number> = {
  tight: 222,
  compact: 447,
  'normal-1': 542,
  'normal-2': 652,
  roomy: 952,
}

/** What the two pills and the bar show, for one state of the chrome. */
export interface ChromeFlags {
  /** The whole start-aligned editing pill — wide only; on phone nothing is left in it. */
  editingPill: boolean
  /** The circular "‹", phone's only supported exit (decision 20). */
  backCircle: boolean
  /** "World" beside the back arrow. */
  backLabel: boolean
  /** Undo in the editing pill (wide) … */
  undoButton: boolean
  /** … and undo in the bottom-left history pill (phone). Exactly one of the two. */
  phoneUndo: boolean
  /** Redo in the editing pill (wide) … */
  redoButton: boolean
  /** … and redo beside the phone undo. Travels with it, never alone. */
  phoneRedo: boolean
  /** The history pill itself — shown exactly when it has buttons to carry. */
  historyPill: boolean
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
  /** ■ Stop in the context pill — phone only, because wide's Stop is the FAB itself. */
  stopButton: boolean
  /** ↺ Restart beside it, in both layouts: the FAB has no second verb to spare. */
  restartButton: boolean
  /** ⚙ Game memory in the context pill while a run is on. */
  memoryButton: boolean
  /** The accent frame around the canvas while a run is on — wide only (§4.6). */
  runBorder: boolean
  /** The Play FAB. */
  playFab: boolean
  /** The docked bottom bar. */
  bottomBar: boolean
  /** "Tap where the hero arrives · Cancel" — the only chrome a pick leaves (§6.2). */
  pickBanner: boolean
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
 *
 * `editingPillPx` defaults to the English-measured table; the widget
 * passes the live measurement, because the table is wrong for any other
 * language (German verbs and layer names run wider) and for any long
 * layer name in the brush sentence.
 */
export function effectiveStage(
  proposed: ChromeStage,
  canvasPx: number,
  contextPillPx: number,
  editingPillPx: (stage: ChromeStage) => number = (stage) => STAGE_EDITING_PILL_PX[stage],
): ChromeStage {
  let rank = CHROME_STAGES.indexOf(proposed)
  if (rank < 0) return 'tight'
  while (rank > 0 && !pillsFit(editingPillPx(CHROME_STAGES[rank]), contextPillPx, canvasPx)) rank--
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
 *
 * `playing` takes the editing affordances away in BOTH layouts, because
 * the one run the maker can start today is a **Test run** by the
 * engine's own markers: `applyRuntimeMode` removes
 * `EditorModeComponent` as it adds `RuntimeModeComponent` (exactly one
 * is ever present), and `EditorMode` is what "the tools are live"
 * means. §4.6's wide *Live* Run — tools stay, because both markers are
 * present — needs a second entry point and an engine that holds both;
 * neither exists yet, and showing a pill whose tools the engine has
 * switched off would be the worse half of the two (TODO.md).
 *
 * `picking` is §6.2's pick mode: the target map is open and waiting for
 * the one tap that says where the hero arrives. It takes the editing
 * affordances away exactly as `playing` does, and both run entry points
 * with them — what is left is the banner, whose Cancel is the way out.
 * The tap is already exclusive engine-side (`consumePendingArrivalPick`
 * runs ahead of the tool lookup in `applyClick`), so this is what makes
 * "all tools replaced by one tap" *visible* rather than only true; a
 * pencil still on screen while every stroke teleports instead would be
 * the worse half of the two. It defaults to `false` so the ladder's own
 * measurement pass (`measureEditingPillWidths`) and every rule about
 * widths keep reading the editing chrome, which is the only state whose
 * pills have a width worth measuring.
 *
 * Mutually exclusive with `playing` by construction, not by a rule here:
 * a pick is only ever armed from editing chrome, and this takes the
 * Play FAB away for as long as one is out.
 */
export function chromeFlags(stage: ChromeStage, layout: ChromeLayout, playing: boolean, picking = false): ChromeFlags {
  const phone = layout === 'phone'
  const editing = !playing && !picking
  // Phone hands the run the whole screen; wide keeps the context pill
  // and the FAB, whose own icon becomes Stop.
  const phoneRun = phone && playing
  const rank = CHROME_STAGES.indexOf(stage)
  return {
    editingPill: !phone && editing,
    backCircle: phone && editing,
    backLabel: !phone && editing && rank >= CHROME_STAGES.indexOf('normal-1'),
    undoButton: !phone && editing,
    phoneUndo: phone && editing,
    redoButton: !phone && editing,
    phoneRedo: phone && editing,
    historyPill: phone && editing,
    // On phone the bar always carries the four tools; on wide the group
    // is the first thing the ladder drops, because the badge covers it.
    toolGroup: phone ? editing : editing && rank >= CHROME_STAGES.indexOf('compact'),
    toolLabels: !phone && editing && stage === 'roomy',
    toolsArePhoneSet: phone,
    badgeLabel: !phone && editing && rank >= CHROME_STAGES.indexOf('normal-2'),
    inspectorToggle: !phone && editing,
    // Both run entry points go while a pick is out: starting a run from
    // the target map would leave the pick armed behind a runtime that
    // ignores it, and the banner says the next tap means one thing.
    overflowButton: !phoneRun && !picking,
    stopButton: phoneRun,
    restartButton: playing,
    memoryButton: playing,
    runBorder: !phone && playing,
    playFab: !phoneRun && !picking,
    bottomBar: phone && editing,
    pickBanner: picking,
  }
}

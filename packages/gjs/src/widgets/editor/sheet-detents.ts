// The phone sheet's three resting heights, as data.
//
// `Adw.BottomSheet` has two states — bar and open — and sizes the open
// sheet to its child's natural height (adw-bottom-sheet.c). There is no
// detent API. So the detents are built on top: this module owns the
// arithmetic (which height, which detent a drag lands on, how far the
// camera has to duck) and `SceneEditor` owns only the GTK wiring, which
// makes "a fling down from Full stops at Half" a unit test instead of a
// thing you can only find out by flinging.
//
// GTK-free on purpose — see the note at the top of `src/test.mts`.

/** The three resting heights, shortest first. */
export type SheetDetent = 'peek' | 'half' | 'full'

export const SHEET_DETENTS: readonly SheetDetent[] = ['peek', 'half', 'full'] as const

/** Which way a drag or fling is taking the sheet. */
export type SheetDirection = 'up' | 'down'

/** The two measurements every detent height is derived from. */
export interface SheetMetrics {
  /** The scene editor's own height in px — what Half and Full measure against. */
  readonly windowHeight: number
  /** The docked bottom bar's height in px. Peek is exactly this tall. */
  readonly barHeight: number
}

/** Half is this share of the window… */
export const SHEET_HALF_FRACTION = 0.46
/** …but never shorter than this, or the brush palette has no room at all. */
export const SHEET_HALF_MIN_PX = 320
/** Full stops this far below the top edge, so the map stays identifiable behind it. */
export const SHEET_FULL_GAP_PX = 56

/**
 * Past this speed (px/s) a release counts as a fling and takes the next
 * detent in its direction rather than the nearest one. Below it, the
 * sheet snaps to whichever detent the finger left it closest to.
 */
export const SHEET_FLING_VELOCITY = 400

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

/**
 * The height, in px, at which `detent` rests.
 *
 * Every result is clamped into `[barHeight, full]`: on a short window
 * the 320 px floor and the 46 % share can both overshoot Full, and a
 * Half taller than Full would make a drag upward shrink the sheet.
 */
export function detentHeight(detent: SheetDetent, metrics: SheetMetrics): number {
  const bar = Math.max(0, metrics.barHeight)
  const full = Math.max(bar, metrics.windowHeight - SHEET_FULL_GAP_PX)
  if (detent === 'peek') return bar
  if (detent === 'full') return full
  return clamp(Math.max(metrics.windowHeight * SHEET_HALF_FRACTION, SHEET_HALF_MIN_PX), bar, full)
}

/**
 * The height a drag in progress is allowed to reach, in px.
 *
 * A drag may not take the sheet shorter than the docked bar or taller
 * than Full: the sheet would either shrink out from under the finger
 * or grow past the gap that keeps the map identifiable.
 */
export function clampSheetHeight(height: number, metrics: SheetMetrics): number {
  return clamp(height, detentHeight('peek', metrics), detentHeight('full', metrics))
}

/**
 * How far a finger has to travel on the grabber before the detent drag
 * claims the gesture, in px.
 *
 * Well under GTK's own 16 px drag threshold on purpose: the sheet's
 * swipe tracker is an ancestor gesture competing for the same sequence,
 * and whoever claims first wins. Large enough that a tap — which cycles
 * the detents instead — survives the jitter of a finger lifting.
 */
export const SHEET_DRAG_CLAIM_PX = 4

/** One `drag-update` reading, as the gesture reports it. */
export interface SheetDragSample {
  /** `Gtk.GestureDrag`'s vertical offset, positive DOWNWARD. */
  readonly offsetY: number
  /** The event's timestamp in ms (`get_current_event_time`). */
  readonly timeMs: number
}

/**
 * Vertical drag velocity in px/s, positive downward — the sign
 * {@link releaseDetent} expects.
 *
 * Measured from the last two samples with distinct timestamps, not over
 * the whole drag: a finger that wanders and then flicks has to read as a
 * flick. Returns 0 when there is nothing to measure, which makes the
 * release snap to the nearest detent.
 */
export function dragVelocityY(samples: readonly SheetDragSample[]): number {
  const last = samples.at(-1)
  if (!last) return 0
  for (let i = samples.length - 2; i >= 0; i--) {
    const previous = samples[i]
    const elapsed = last.timeMs - previous.timeMs
    if (elapsed > 0) return ((last.offsetY - previous.offsetY) / elapsed) * 1000
  }
  return 0
}

/** The neighbouring detent in `direction`; the end of the ladder stays put. */
export function nextDetent(current: SheetDetent, direction: SheetDirection): SheetDetent {
  const index = SHEET_DETENTS.indexOf(current)
  const target = clamp(index + (direction === 'up' ? 1 : -1), 0, SHEET_DETENTS.length - 1)
  return SHEET_DETENTS[target]
}

/** Peek → Half → Full → Peek. What a tap on the drag handle does. */
export function cycleDetent(current: SheetDetent): SheetDetent {
  const index = SHEET_DETENTS.indexOf(current)
  return SHEET_DETENTS[(index + 1) % SHEET_DETENTS.length]
}

/**
 * The detent `height` is closest to. Ties go to the shorter detent — a
 * release exactly between two is ambiguous, and leaving more of the map
 * uncovered is the recoverable half of that guess.
 */
export function snapDetent(height: number, metrics: SheetMetrics): SheetDetent {
  let best = SHEET_DETENTS[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const detent of SHEET_DETENTS) {
    const distance = Math.abs(detentHeight(detent, metrics) - height)
    if (distance < bestDistance) {
      best = detent
      bestDistance = distance
    }
  }
  return best
}

/** What a drag release lands on. */
export interface SheetRelease {
  /** The detent the drag started from. */
  readonly current: SheetDetent
  /** The sheet's height, in px, at the moment of release. */
  readonly height: number
  /** Vertical velocity in px/s, positive DOWNWARD (Gtk.GestureDrag's sign). */
  readonly velocityY: number
  readonly metrics: SheetMetrics
}

/**
 * The detent a released drag settles on: a fling takes the next detent
 * in its direction, anything slower snaps to the nearest one.
 *
 * Deliberately not "nearest, but biased by velocity" — a fling from Full
 * has to reach Half even when the finger barely moved, which is the
 * gesture people actually make to dismiss a sheet.
 */
export function releaseDetent(release: SheetRelease): SheetDetent {
  const { current, height, velocityY, metrics } = release
  if (Math.abs(velocityY) >= SHEET_FLING_VELOCITY) {
    // A finger moving down shrinks the sheet, hence the inverted sign.
    return nextDetent(current, velocityY > 0 ? 'down' : 'up')
  }
  return snapDetent(height, metrics)
}

/**
 * How far, in px, the camera has to lift its focus point off the bottom
 * edge so a focused tile is not behind the sheet
 * (`Engine.setViewportInset`).
 *
 * Only Half pays it. At Peek the bar is already docked — the canvas ends
 * where the bar starts (`margin-bottom` bound to `bottom-bar-height`),
 * so nothing covers the map. At Full the sheet is modal and the map is
 * dimmed: an inset of nearly the whole canvas would shove the view off
 * the map and jolt it back on the way down, for a map nobody is looking
 * at.
 */
export function bottomInsetFor(detent: SheetDetent, metrics: SheetMetrics): number {
  if (detent !== 'half') return 0
  return Math.max(0, detentHeight('half', metrics) - Math.max(0, metrics.barHeight))
}

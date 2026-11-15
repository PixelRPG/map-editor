/**
 * Pure decision logic for the canvas touch gestures.
 *
 * GTK can only be driven by a real finger, and the headless capture
 * harness has no way to inject one — so the arithmetic that decides how
 * far the camera moves and how a touch becomes a tap lives here, free
 * of `gi://`, and the unit tests are the proof. `pinch-zoom.ts` stays a
 * thin adapter: read the gesture, call these, write the camera.
 *
 * The whole-pixel zoom levels a pinch springs to are NOT here — the
 * pixel grid belongs to the tiles, not to the input device, so that
 * arithmetic lives in `@pixelrpg/engine`'s `utils/zoom.ts` where a run
 * picking its opening zoom uses the same levels.
 *
 * See `docs/design/ui-redesign/REDESIGN.md` § 5.5 for the gesture table
 * these implement.
 */

import { clampZoom, type ZoomRange } from '@pixelrpg/engine'

/**
 * The zoom and bounding-box centre a two-finger gesture started from.
 * Scale arrives from GTK as a factor against `begin`, never as a delta,
 * so the starting zoom has to be remembered rather than read live — see
 * the compounding note in `pinch-zoom.ts`.
 */
export interface TwoFingerState {
  readonly zoomAtBegin: number
  readonly centreX: number
  readonly centreY: number
}

/** What the widget should do for one `Gtk.Gesture::update`. */
export interface TwoFingerStep {
  /** Target camera zoom, already clamped. */
  readonly zoom: number
  /** Widget-local point to hold still while scaling. */
  readonly anchorX: number
  readonly anchorY: number
  /** Screen-pixel translation of the finger midpoint since the last step. */
  readonly panX: number
  readonly panY: number
  /** Carry this into the next call. */
  readonly state: TwoFingerState
}

/** Seed the state when `Gtk.Gesture::begin` fires. */
export function beginTwoFinger(zoom: number, centreX: number, centreY: number): TwoFingerState {
  return {
    zoomAtBegin: zoom > 0 && Number.isFinite(zoom) ? zoom : 1,
    centreX,
    centreY,
  }
}

/**
 * Fold one gesture update into a camera move.
 *
 * Scale and translation are reported by the SAME two contacts, so both
 * have to come out of one step: zoom about the midpoint first (which
 * pins the world point under the fingers), then translate by however
 * far that midpoint itself travelled. Doing only the first gives pinch
 * without two-finger pan; doing only the second gives pan that slides
 * the map out from under the pinch.
 */
export function stepTwoFinger(
  state: TwoFingerState,
  scale: number,
  centreX: number,
  centreY: number,
  range: ZoomRange,
): TwoFingerStep {
  const usableScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  const zoom = clampZoom(state.zoomAtBegin * usableScale, range)
  return {
    zoom,
    anchorX: centreX,
    anchorY: centreY,
    panX: centreX - state.centreX,
    panY: centreY - state.centreY,
    state: { zoomAtBegin: state.zoomAtBegin, centreX, centreY },
  }
}

/** Midpoint travel, in screen pixels, below which two fingers were "still". */
export const TWO_FINGER_SLOP_PX = 8
/** Relative zoom change below which a pinch did not really pinch (~2%). */
export const TWO_FINGER_ZOOM_SLOP = 0.02

/**
 * Did these two fingers actually pinch or drag, or did they just rest on
 * the glass and lift again?
 *
 * `Gtk.GestureZoom` begins the moment a second contact arrives, so a
 * two-finger TAP — which is undo, not zoom — runs the same begin/end
 * pair a pinch does. Springing to a whole-pixel level on every such end
 * would yank a deliberately-set 1.2× zoom to 1× each time the user
 * undoes something. The spring is for pinches, so it has to ask first.
 */
export function twoFingerDidMove(travelPx: number, zoomAtBegin: number, zoomNow: number): boolean {
  if (travelPx > TWO_FINGER_SLOP_PX) return true
  if (!(zoomAtBegin > 0) || !(zoomNow > 0)) return false
  return Math.abs(Math.log(zoomNow / zoomAtBegin)) > TWO_FINGER_ZOOM_SLOP
}

/** How forgiving the multi-finger tap recogniser is. */
export interface TapRules {
  /** Longest a tap may last, from the first press to the last lift. */
  readonly maxDurationMs: number
  /** How far a single finger may travel and still count as still. */
  readonly slopPx: number
}

/**
 * Deliberately generous: these taps are made with two or three fingers
 * at once, which land and leave less tidily than one, and nothing else
 * on the canvas competes for the gesture — a slow or smeared one that
 * is rejected simply does nothing, while a rejected pinch would have
 * moved the map.
 */
export const DEFAULT_TAP_RULES: TapRules = { maxDurationMs: 450, slopPx: 20 }

interface TapContact {
  readonly startX: number
  readonly startY: number
  readonly x: number
  readonly y: number
}

/** Fingers currently down, and what they have done so far. */
export interface TapState {
  readonly contacts: readonly TapContact[]
  /** The most fingers that were down at once — the tap's arity. */
  readonly peak: number
  readonly startedAtMs: number
  /** Something disqualified this touch; it can no longer become a tap. */
  readonly spoiled: boolean
}

export const EMPTY_TAP_STATE: TapState = { contacts: [], peak: 0, startedAtMs: 0, spoiled: false }

/**
 * A finger touched down.
 *
 * Contacts are tracked by POSITION, not by `Gdk.EventSequence`: the
 * sequence is an opaque boxed type, so GJS hands out a fresh wrapper per
 * event and it cannot be used as a map key. Nearest-point matching can
 * only confuse two fingers that have travelled far enough to swap
 * neighbourhoods — by which point `slopPx` has already rejected the tap,
 * so the mix-up changes nothing.
 */
export function pressTapContact(
  state: TapState,
  x: number,
  y: number,
  timeMs: number,
  rules: TapRules = DEFAULT_TAP_RULES,
): TapState {
  const fresh = state.contacts.length === 0
  const base = fresh ? { ...EMPTY_TAP_STATE, startedAtMs: timeMs } : state
  const contacts = [...base.contacts, { startX: x, startY: y, x, y }]
  return {
    contacts,
    peak: Math.max(base.peak, contacts.length),
    startedAtMs: base.startedAtMs,
    // A finger that joins long after the first one is a second gesture
    // layered on the first, not one tap by several fingers.
    spoiled: base.spoiled || timeMs - base.startedAtMs > rules.maxDurationMs,
  }
}

/** A finger moved. Travel past the slop turns the touch into a drag. */
export function moveTapContact(state: TapState, x: number, y: number, rules: TapRules = DEFAULT_TAP_RULES): TapState {
  const index = nearestContact(state.contacts, x, y)
  if (index < 0) return state
  const contacts = state.contacts.map((contact, at) => (at === index ? { ...contact, x, y } : contact))
  const moved = contacts[index] as TapContact
  return {
    ...state,
    contacts,
    spoiled: state.spoiled || distance(moved.startX, moved.startY, moved.x, moved.y) > rules.slopPx,
  }
}

/**
 * A finger lifted. `fingers` is non-zero only on the lift that empties
 * the glass, and carries the tap's arity — two fingers or three, however
 * raggedly they arrived and left.
 */
export function releaseTapContact(
  state: TapState,
  x: number,
  y: number,
  timeMs: number,
  rules: TapRules = DEFAULT_TAP_RULES,
): { readonly state: TapState; readonly fingers: number } {
  const moved = moveTapContact(state, x, y, rules)
  const index = nearestContact(moved.contacts, x, y)
  if (index < 0) return { state: EMPTY_TAP_STATE, fingers: 0 }
  const contacts = moved.contacts.filter((_, at) => at !== index)
  const spoiled = moved.spoiled || timeMs - moved.startedAtMs > rules.maxDurationMs
  if (contacts.length > 0) return { state: { ...moved, contacts, spoiled }, fingers: 0 }
  return { state: EMPTY_TAP_STATE, fingers: spoiled ? 0 : moved.peak }
}

function nearestContact(contacts: readonly TapContact[], x: number, y: number): number {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  contacts.forEach((contact, at) => {
    const current = distance(contact.x, contact.y, x, y)
    if (current < bestDistance) {
      bestDistance = current
      best = at
    }
  })
  return best
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

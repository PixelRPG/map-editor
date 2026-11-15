/**
 * The virtual joystick's decisions, as pure functions.
 *
 * Touch cannot be injected into the headless harness, so everything
 * that could be *wrong* about the stick — where it may appear, how far
 * the knob travels, which direction a thumb position means — lives here
 * and is pinned in `virtual-stick.spec.ts`. The GTK half
 * (`attachVirtualStick`) only turns gesture callbacks into calls on
 * these, the same split `pinch-zoom.ts` / `touch-gesture.ts` use.
 *
 * REDESIGN § 5.6 is the spec for the numbers.
 */

/** Diameter of the stick base that appears under the thumb. */
export const STICK_BASE_PX = 96

/** Diameter of the knob that follows the thumb inside the base. */
export const STICK_KNOB_PX = 44

/** How far the knob may travel from the base centre. */
export const STICK_MAX_TRAVEL_PX = 40

/**
 * Travel below which the stick reads as centred.
 *
 * A thumb resting on glass never holds still, and without a dead zone
 * the quantiser would flip the hero between two directions on the
 * jitter alone. 10 px is a quarter of the travel — small enough that
 * the stick still feels immediate, large enough to swallow the noise.
 */
export const STICK_DEAD_ZONE_PX = 10

/** How long the stick stays visible after the thumb leaves. */
export const STICK_HIDE_DELAY_MS = 300

/**
 * The fraction of the canvas, measured from the bottom-left corner, in
 * which a touch summons the stick. The rest of the canvas keeps its
 * normal gestures, so a player can still pan and pinch while playing.
 */
export const STICK_REGION_WIDTH_FRACTION = 0.55
export const STICK_REGION_HEIGHT_FRACTION = 0.45

/** A point in widget coordinates. */
export interface StickPoint {
  x: number
  y: number
}

/**
 * True when a press at (`x`, `y`) in a `width`×`height` canvas falls in
 * the lower-left region the stick owns.
 *
 * The region is a fraction rather than a fixed rectangle because the
 * thumb's reach scales with the device: the same 55 % × 45 % corner is
 * comfortable on a 360 px phone and on a tablet, where a fixed box
 * would sit far from the hand.
 */
export function isInStickRegion(x: number, y: number, width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false
  return x <= width * STICK_REGION_WIDTH_FRACTION && y >= height * (1 - STICK_REGION_HEIGHT_FRACTION)
}

/**
 * Move a requested stick centre so the whole base stays on screen.
 *
 * The stick appears *under the thumb*, and a thumb in the very corner
 * would otherwise put half the base outside the canvas — where the knob
 * is unreadable and the remaining travel is asymmetric, so the hero
 * would walk left more easily than right.
 */
export function clampStickOrigin(point: StickPoint, width: number, height: number): StickPoint {
  const radius = STICK_BASE_PX / 2
  const clampAxis = (value: number, extent: number): number => {
    // A canvas narrower than the base has no margin to give; centring
    // is the least wrong answer and keeps travel symmetric.
    if (extent <= STICK_BASE_PX) return extent / 2
    return Math.min(Math.max(value, radius), extent - radius)
  }
  return { x: clampAxis(point.x, width), y: clampAxis(point.y, height) }
}

/**
 * The knob's offset from the base centre for a thumb at `pointer`,
 * capped at {@link STICK_MAX_TRAVEL_PX}.
 *
 * Capping the vector's length rather than each axis keeps the knob on a
 * circle: clamping x and y separately would let a diagonal reach
 * `sqrt(2)` × further than a cardinal and draw the knob outside the
 * round base.
 */
export function stickKnobOffset(origin: StickPoint, pointer: StickPoint): StickPoint {
  const dx = pointer.x - origin.x
  const dy = pointer.y - origin.y
  const distance = Math.hypot(dx, dy)
  if (distance <= STICK_MAX_TRAVEL_PX || distance === 0) return { x: dx, y: dy }
  const scale = STICK_MAX_TRAVEL_PX / distance
  return { x: dx * scale, y: dy * scale }
}

/**
 * Turn a knob offset into a movement vector, quantised to eight
 * directions.
 *
 * Quantising — rather than passing the analog magnitude through — is
 * what makes touch produce *exactly* the vectors the keyboard can
 * produce, diagonals included (pre-scaled by `1/sqrt(2)`, matching
 * `readMovementInput`). The hero therefore moves at one speed however
 * they are being steered, and no gameplay tuned against the keyboard
 * behaves differently under a thumb. Eight rather than four because a
 * tile map's diagonals are walkable and a four-way stick makes
 * crossing a room a staircase of corrections.
 *
 * Analog speed is the thing given up. It is not free to add later
 * either — variable speed would need `MovementComponent` to treat the
 * vector's magnitude as a throttle, which the keyboard never produces
 * — so it is a deliberate deferral, not an oversight.
 */
export function stickVector(offset: StickPoint): { moveX: number; moveY: number } {
  const distance = Math.hypot(offset.x, offset.y)
  if (distance < STICK_DEAD_ZONE_PX) return { moveX: 0, moveY: 0 }

  // Round the angle to the nearest eighth of a turn, then read the unit
  // vector off it. `Math.round` of the resulting cosine/sine snaps
  // 0.707 to 1 and 6e-17 to 0, which is exactly the set of signs the
  // arrow keys can hold down.
  const octant = Math.round(Math.atan2(offset.y, offset.x) / (Math.PI / 4))
  const angle = octant * (Math.PI / 4)
  let moveX = Math.round(Math.cos(angle))
  let moveY = Math.round(Math.sin(angle))
  if (moveX !== 0 && moveY !== 0) {
    const inv = 1 / Math.SQRT2
    moveX *= inv
    moveY *= inv
  }
  return { moveX, moveY }
}

/** Which on-screen buttons are held down right now. */
export interface StickButtons {
  action: boolean
  attack: boolean
}

/** The stick's own live state, or `null` when no thumb is on it. */
export interface StickDrag {
  origin: StickPoint
  knob: StickPoint
}

/**
 * Assemble the intent the engine consumes from the stick's state and
 * the buttons.
 *
 * `active` is true whenever either half is engaged, so a player holding
 * only the action button still registers as a live touch producer — and
 * a hidden stick's last vector can never leak into the merge.
 */
export function touchIntent(
  drag: StickDrag | null,
  buttons: StickButtons,
): { moveX: number; moveY: number; actionHeld: boolean; attackHeld: boolean; active: boolean } {
  const vector = drag ? stickVector(drag.knob) : { moveX: 0, moveY: 0 }
  return {
    moveX: vector.moveX,
    moveY: vector.moveY,
    actionHeld: buttons.action,
    attackHeld: buttons.attack,
    active: drag !== null || buttons.action || buttons.attack,
  }
}

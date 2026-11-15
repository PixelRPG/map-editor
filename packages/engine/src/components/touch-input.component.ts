import { Component } from 'excalibur'

/**
 * The intent an on-screen touch control is producing RIGHT NOW —
 * virtual joystick vector plus the action / attack buttons.
 *
 * Deliberately NOT {@link InputSourceComponent}. That component is the
 * single contract gameplay reads, and `InputSystem` overwrites all four
 * of its fields from the keyboard every tick; a second writer touching
 * it directly would have its intent erased within the same frame. So the
 * touch host writes HERE and `InputSystem` merges the two producers into
 * the one component gameplay sees. Transport-ready rule 3 holds: an
 * input *source* is a producer, never a second source of truth.
 *
 * `moveX`/`moveY` arrive pre-normalised from the host (see
 * `stickVector` in `@pixelrpg/gjs`'s `virtual-stick.ts`, which quantises
 * to the same eight vectors the keyboard can produce, diagonals scaled
 * by `1/sqrt(2)`) — so a thumb and an arrow key move the hero at exactly
 * the same speed.
 *
 * `active` says whether a touch control is currently on screen at all.
 * It is what lets the merge distinguish "the stick is centred" from
 * "there is no stick", without the host having to unset the component.
 */
export class TouchInputComponent extends Component {
  constructor(
    public moveX = 0,
    public moveY = 0,
    public actionHeld = false,
    public attackHeld = false,
    public active = false,
  ) {
    super()
  }
}

/**
 * The value shape the GTK host passes to `Engine.setTouchInput` — the
 * component's fields without the component, so the host can assemble an
 * intent without importing Excalibur's `Component`.
 */
export interface TouchIntent {
  moveX: number
  moveY: number
  actionHeld: boolean
  attackHeld: boolean
  active: boolean
}

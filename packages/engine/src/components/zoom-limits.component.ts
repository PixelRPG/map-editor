import { Component } from 'excalibur'

/**
 * How far this map may be zoomed, and how it should be drawn at the
 * current zoom. Lives on the session singleton; written ONLY by
 * `ZoomLimitsSystem`, read by wheel, pinch and zoom-step code so they all
 * hit one clamp.
 *
 * `min` is the zoom at which the whole map fits the viewport (recomputed
 * on resize and per scene); `dots` is true while a tile is too small on
 * screen for frames and sprites to read, and they collapse to dots.
 */
export class ZoomLimitsComponent extends Component {
  constructor(
    public min: number,
    public max: number,
    public dots = false,
  ) {
    super()
  }
}

import { Component } from 'excalibur'

/**
 * Marks an actor on the hero plane whose z follows its y.
 *
 * Runtime only, never serialised. `footOffset` is the distance from the
 * actor's position to the bottom edge of its picture; `lastY` is the y
 * the current z was computed for, so `DepthSortSystem` writes z (and
 * makes Excalibur re-sort its draw list) only when the actor moved.
 */
export class DepthSortComponent extends Component {
  constructor(
    public readonly footOffset: number,
    public lastY: number,
    public readonly elevation = 0,
  ) {
    super()
  }
}

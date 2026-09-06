import { Component } from 'excalibur'

/**
 * Marks one heart of the combat HUD and remembers its place in the row.
 *
 * The heart actors are the HUD's only state, and they live in the scene
 * rather than on {@link HudSystem} — a system may keep nothing across
 * ticks. This marker is how the system finds its own row again next
 * frame, and how it tears the row down when the maximum changes.
 */
export class HudHeartComponent extends Component {
  constructor(public readonly index: number) {
    super()
  }
}

import { Component } from 'excalibur'

/** How an object activates. Mirrors `TriggerSpec.on` from the data layer. */
export type TriggerMode = 'walk-onto' | 'walk-off' | 'action-button' | 'auto' | 'none'

/**
 * Activation rules for an object entity. The {@link TriggerSystem}
 * scans entities with this component every tick and emits a
 * `trigger-fired` event on the engine event bus when the activation
 * condition is met. Specific behaviour (teleport / pickup / dialogue
 * / …) lives in the kind-specific systems that subscribe.
 */
export class TriggerComponent extends Component {
  /**
   * Has this trigger already fired? `TriggerSystem` flips it after
   * firing, but only respects it when `once` is true.
   */
  public fired = false

  constructor(
    public on: TriggerMode,
    public once = false,
    public scriptId?: string,
  ) {
    super()
  }
}

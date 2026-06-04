import { Component } from 'excalibur'

/** How an object activates. Mirrors `TriggerSpec.on` from the data layer. */
type TriggerMode = 'walk-onto' | 'walk-off' | 'action-button' | 'auto' | 'none'

/**
 * Activation rules for an object entity. The {@link TriggerSystem}
 * scans entities with this component every tick and emits a
 * `trigger-fired` event on the engine event bus when the activation
 * condition is met. Specific behaviour (teleport / pickup / dialogue
 * / …) lives in the kind-specific systems that subscribe.
 *
 * Pure data — no runtime state. The "already fired" state lives on
 * a separate `TriggerFiredComponent` marker added by `TriggerSystem`
 * (presence-as-signal, same shape as the editor/runtime mode
 * markers). Keeping data and runtime state separated leaves the
 * `on`/`once`/`scriptId` triple cleanly serializable from `TriggerSpec`.
 */
export class TriggerComponent extends Component {
  constructor(
    public on: TriggerMode,
    public once = false,
    public scriptId?: string,
  ) {
    super()
  }
}

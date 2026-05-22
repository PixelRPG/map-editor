import { Component } from 'excalibur'

/**
 * Item-pickup behaviour. The `ItemPickupSystem` listens for
 * `trigger-fired` events on entities carrying this component,
 * emits `item-picked-up`, plays the optional `pickupSound`, and
 * removes the entity from the scene.
 *
 * Re-pickup prevention is controlled at the *trigger* level via
 * `TriggerComponent.once`, not here — see
 * `docs/concepts/object-system.md`.
 */
export class ItemComponent extends Component {
  constructor(
    public itemId: string,
    public qty = 1,
    public pickupSound?: string,
  ) {
    super()
  }
}

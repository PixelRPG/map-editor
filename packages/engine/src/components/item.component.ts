import { Component } from 'excalibur'

/**
 * Item-pickup behaviour. The `ItemPickupSystem` listens for
 * `trigger-fired` events on entities carrying this component, adds
 * the item to the inventory (when one exists), plays
 * `pickupSound`, and removes the entity unless `oncePerScene` is
 * set (in which case the entity persists with `TriggerComponent.fired
 * = true` to prevent re-pickup until the scene reloads).
 */
export class ItemComponent extends Component {
  constructor(
    public itemId: string,
    public qty = 1,
    public oncePerScene = false,
    public pickupSound?: string,
  ) {
    super()
  }
}

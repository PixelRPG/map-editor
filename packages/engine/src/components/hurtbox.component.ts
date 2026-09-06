import { Component } from 'excalibur'

/**
 * Presence-as-data: an entity carrying this can be hit.
 *
 * No fields, the same shape the `collision` spec uses for "blocks
 * movement" — "can be hurt" is a yes/no, and a `hittable: boolean` field
 * would give it a second way to say no. An actor without one is scenery
 * as far as a swing is concerned, which is what keeps a sign from soaking
 * up sword hits.
 *
 * Read by {@link MeleeAttackSystem} (what a swing may hit) and
 * {@link HostileAiSystem} (whether the player can take contact damage).
 */
export class HurtboxComponent extends Component {}

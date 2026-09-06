import { Component } from 'excalibur'

/**
 * Grid-movement speed in tiles per second, as a runtime component.
 *
 * `movementSpec` used to be data-only (`build: () => null`) because its
 * single reader, `PlayerSystem`, gets the hero's speed from the flat
 * {@link CharacterDefinition} view model instead of from the spawned
 * actor. `HostileAiSystem` is the second reader and has no such view
 * model: it drives an ordinary placement, so it needs the speed on the
 * entity it is moving.
 *
 * Re-deriving it there — placement id → placement → definition →
 * component data — would rebuild, per tick, exactly what the spawn
 * pipeline already had in its hand. Attaching the component instead is
 * what the ECS is for.
 */
export class MovementComponent extends Component {
  constructor(public readonly tilesPerSec: number) {
    super()
  }
}

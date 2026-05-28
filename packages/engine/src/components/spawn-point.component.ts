import { Component } from 'excalibur'
import type { Facing } from '../types/data/index'

/**
 * Spawn-point marker. {@link PlayerSystem} looks for an entity
 * carrying this component with `spawnId === 'player'` and spawns
 * the player actor at that tile (unless a `SpawnOverrideComponent`
 * on the session singleton overrides the tile for "play from here").
 *
 * Other `spawnId` values (e.g. `'shopkeeper'`) get resolved by
 * project-specific spawn systems via the project's entity registry.
 */
export class SpawnPointComponent extends Component {
  constructor(
    public spawnId: 'player' | (string & {}),
    public facing?: Facing,
  ) {
    super()
  }
}

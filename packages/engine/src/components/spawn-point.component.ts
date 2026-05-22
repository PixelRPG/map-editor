import { Component } from 'excalibur'
import type { Facing } from '../types/data/index'

/**
 * Spawn-point marker. The `PlayerSpawnSystem` looks for an entity
 * carrying this component with `spawnId === 'player'` and either
 * moves the existing player entity to that tile or spawns a fresh
 * one.
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

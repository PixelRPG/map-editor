import { Component } from 'excalibur'
import type { Facing } from '../types/data/index.ts'

/**
 * Runtime-only override for the player's spawn position.
 *
 * When present on the session-singleton entity, {@link PlayerSystem}
 * uses `tileX/tileY` instead of looking for a `kind: 'spawn-point'`
 * placement on the map. Used to start playtest at whatever tile the
 * editor user is currently focused on (Mario-Maker-style "play from
 * here").
 *
 * **In-memory only** — never modifies the project's map data. The
 * map's real spawn-point placement stays untouched and is what
 * a full run from outside the editor uses.
 */
export class SpawnOverrideComponent extends Component {
  constructor(
    public tileX: number,
    public tileY: number,
    public facing?: Facing,
  ) {
    super()
  }
}

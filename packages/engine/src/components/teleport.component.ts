import { Component } from 'excalibur'
import type { Facing } from '../types/data/index.ts'

/**
 * Teleport behaviour. The {@link TeleportSystem} listens for
 * `trigger-fired` events and, if the triggering entity carries this
 * component, switches scenes to `targetMapId` and repositions the
 * player at `targetTile{X,Y}` with the requested facing.
 */
export class TeleportComponent extends Component {
  constructor(
    public targetMapId: string,
    public targetTileX: number,
    public targetTileY: number,
    public facing?: Facing,
  ) {
    super()
  }
}

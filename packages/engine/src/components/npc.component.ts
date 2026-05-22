import { Component } from 'excalibur'
import type { Facing } from '../types/data/index'

/** Tile-grid waypoint for an NPC route. */
export interface NpcWaypoint {
  tileX: number
  tileY: number
}

/**
 * NPC-specific data — dialogue reference + patrol route + facing.
 *
 * Movement / pathing logic lives in the (future) `NpcMovementSystem`;
 * dialogue display lives in the (future) `DialogueSystem`. Both read
 * but never mutate this component; per-NPC runtime state (current
 * waypoint index, animation phase) goes on separate components
 * dedicated to those concerns so the data component stays pure.
 */
export class NpcComponent extends Component {
  constructor(
    public dialogueId?: string,
    public route?: NpcWaypoint[],
    public facing?: Facing,
  ) {
    super()
  }
}

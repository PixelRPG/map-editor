import { Component } from 'excalibur'

/**
 * Marks an entity as physically blocking — the player and other
 * movement-controlled entities can't share its tile.
 *
 * Currently only single-tile collision is supported (`shape: 'tile'`).
 * The field exists so the engine can extend to `'rect'`/`'circle'`
 * shapes later without renaming this component.
 *
 * orphan-component-ok: KNOWN GAP — nothing reads this yet. `collisionSpec`
 * puts a user-visible "Blocks movement" toggle in the component inspector
 * and the chest / sign / door templates all seed it, but no movement
 * system consults it before committing a step, so a player walks straight
 * through every one of them. The blocker system is planned work (TODO.md,
 * "Engine / runtime"); the component is the data half of it and stays.
 */
export class CollisionComponent extends Component {
  constructor(public shape: 'tile' = 'tile') {
    super()
  }
}

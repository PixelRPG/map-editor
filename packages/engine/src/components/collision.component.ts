import { Component } from 'excalibur'

/**
 * Marks an entity as physically blocking — the player and other
 * movement-controlled entities can't share its tile.
 *
 * Currently only single-tile collision is supported (`shape: 'tile'`).
 * The field exists so the engine can extend to `'rect'`/`'circle'`
 * shapes later without renaming this component.
 *
 * Movement systems read this component on prospective destination
 * tiles before committing a step.
 */
export class CollisionComponent extends Component {
  constructor(public shape: 'tile' = 'tile') {
    super()
  }
}

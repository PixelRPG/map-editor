import { Component } from 'excalibur'

/**
 * Stable id of an {@link ObjectPlacement} an `Actor` was spawned for.
 * Attached by `ObjectSpawnSystem` to every placement actor so editor
 * code can map selection state (which lives by stable id in
 * `SelectedPlacementsComponent`) back to the runtime entity.
 *
 * Workspace-wide rule (`AGENTS.md` § Transport-ready primitives):
 * stable ids are the only persistent / wire keys. Excalibur's runtime
 * `Entity.id` is forbidden as a save-state or session-state key.
 */
export class PlacementIdComponent extends Component {
  constructor(public readonly id: string) {
    super()
  }
}

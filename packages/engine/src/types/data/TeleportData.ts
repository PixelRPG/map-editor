/**
 * A teleport stitches two map tiles together: when the player walks
 * onto `from.{mapId, x, y}`, the editor / runtime is expected to warp
 * them to `to.{mapId, x, y}`. The atlas view draws each teleport as a
 * dashed bezier between the two map cards.
 *
 * @deprecated Superseded by {@link ObjectDefinition} + {@link
 * ObjectPlacement} with `kind: 'teleport'`. The atlas overlay will
 * aggregate teleport placements across all maps in the project
 * after PR 2 of the object-system rollout, replacing the
 * project-level `teleports[]` array. See
 * `docs/concepts/object-system.md`.
 */
export interface TeleportData {
  /** Stable id (used for selection / persistence). */
  id: string
  /** Optional pill label shown at the curve's control point. */
  label?: string
  from: TeleportEndpoint
  to: TeleportEndpoint
}

export interface TeleportEndpoint {
  /** Target scene id — matches a `GameProjectData.maps[].id`. */
  mapId: string
  /** Tile column on the target scene's grid. */
  x: number
  /** Tile row on the target scene's grid. */
  y: number
}

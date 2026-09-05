/**
 * Data shape of the future `elevation-step` component — the thing a
 * walker crosses to change storey (the ramp from a river bed at storey
 * 0 onto a bridge deck at storey 1).
 *
 * Pinned as a TYPE ONLY, on purpose: there is no `ComponentSpec` and no
 * `*.component.ts` class behind it yet, because a component that no
 * system reads is exactly the shape `scripts/check-orphan-components.mjs`
 * exists to reject. The component and its system arrive together, when
 * the elevation runtime lands.
 *
 * What the shape already fixes (so later code cannot drift from it):
 *
 * - A step is a PLACEMENT — an ordinary `EntityDefinition` carrying this
 *   component, placed on a layer like any other object — never a marker
 *   inside `LayerData.sprites`. Sprites are visuals; the last per-sprite
 *   ordering field was deleted for exactly that reason.
 * - `to` names the walker's storey after crossing; the step's own
 *   storey is its layer's `LayerData.elevation`.
 * - Steps are authored as part of a stamp (a multi-cell prefab whose
 *   cells carry `{ plane, elevation: 0 | 1, step?: 'up' | 'down' }`) and
 *   placed by the child with the pencil.
 *
 * See `docs/concepts/object-system.md` § Elevation.
 */
export interface ElevationStepData {
  type: 'elevation-step'
  /** The walker's storey after crossing this cell (integer ≥ 0). */
  to: number
}

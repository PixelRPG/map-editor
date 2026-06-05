import { Component } from 'excalibur'

/**
 * Editor-only view flags that toggle independently — the user can
 * enable any combination of:
 *
 * - `showGrid` — Excalibur's debug grid lines on every tilemap.
 * - `dimInactiveLayers` — non-active-layer sprites + placements
 *   fade to {@link GRID_MODE_DIM_OPACITY} so the active layer's
 *   content is the dominant signal.
 *
 * Earlier shape (`mode: 'normal' | 'grid'`) coupled the two — the
 * user could only get the dimming alongside the grid lines, or
 * neither. The two are conceptually independent (grid lines help
 * with tile alignment, dimming helps with layer focus), so they're
 * now separate booleans driven by separate GActions.
 *
 * Lives on the per-scene session-singleton entity (see
 * `docs/concepts/editor-architecture.md`). Pure rendering state —
 * runtime / play modes ignore both flags.
 *
 * Future editor view flags (`'wireframe'`, `'collisions'`, …) drop
 * in as additional boolean fields without breaking existing
 * subscribers.
 */
export class EditorViewModeComponent extends Component {
  constructor(
    public showGrid: boolean,
    public dimInactiveLayers: boolean,
  ) {
    super()
  }
}

/** Snapshot shape published to subscribers + accepted by the engine setter. */
export interface EditorViewFlags {
  showGrid: boolean
  dimInactiveLayers: boolean
}

import { Component } from 'excalibur'

/**
 * Editor-only view mode that toggles between "render like the game
 * would" (`normal`) and an editor-focused render with grid lines
 * + dimmed non-active layers (`grid`).
 *
 * Lives on the per-scene session-singleton entity (see
 * `docs/concepts/editor-architecture.md`). Pure rendering state —
 * runtime / play modes ignore the flag.
 *
 * Single-field component rather than two boolean toggles so future
 * editor view modes (e.g. `'wireframe'`, `'collisions'`) can extend
 * the union without breaking subscribers.
 */
export type EditorViewMode = 'normal' | 'grid'

export class EditorViewModeComponent extends Component {
  constructor(public mode: EditorViewMode) {
    super()
  }
}

import { Component } from 'excalibur'

/**
 * Marker component — when present on the session-singleton entity,
 * the editor's tool systems run. When absent, tool systems short-
 * circuit on their first guard. No fields; the *presence* of the
 * component is the entire signal.
 *
 * See `docs/concepts/runtime-modes.md` and
 * `docs/concepts/editor-architecture.md`. Combined with
 * `RuntimeModeComponent`, both can be present at once for the
 * Mario-Maker-style "Live Run" (edit while playing).
 */
export class EditorModeComponent extends Component {}

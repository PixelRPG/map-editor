import { Component } from 'excalibur'

/**
 * Marker component — when present on the session-singleton entity,
 * runtime systems run (player movement, trigger effects, audio,
 * animations advance, etc.). When absent, those systems short-
 * circuit on their first guard so the engine renders but doesn't
 * "play".
 *
 * No fields; presence-as-signal. Combined with `EditorModeComponent`
 * for Live Run, or alone for Full Run / Test Run. See
 * `docs/concepts/runtime-modes.md`.
 */
export class RuntimeModeComponent extends Component {}

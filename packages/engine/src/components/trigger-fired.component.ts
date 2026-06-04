import { Component } from 'excalibur'

/**
 * Presence-as-signal marker added by {@link TriggerSystem} after a
 * `once: true` trigger fires. The system skips entities that carry
 * this marker on subsequent activation attempts within the same
 * scene visit. Scene reload drops the entity + marker together
 * (re-spawn produces a fresh `Actor` without it).
 *
 * Lives separately from {@link TriggerComponent} so the data
 * component stays a clean serializable shape (`on`, `once`,
 * `scriptId`) and the runtime "already fired" state is a pure
 * marker — mirrors the `EditorModeComponent` / `RuntimeModeComponent`
 * pattern.
 */
export class TriggerFiredComponent extends Component {}

/**
 * Eight cardinal animation roles every playable character must
 * provide. Other animations (custom — `sword-swing`, `wave`, etc.)
 * live alongside these but are addressed by their user-chosen id
 * rather than a role.
 *
 * Naming convention: `<state>-<direction>`, lowercase, hyphenated.
 * Used as the keying type for {@link PlayerActorComponent}'s
 * `animationsByRole` map and as the canonical animation ids in
 * `CharacterDefinition.animations` for required roles — the role
 * IS the id (no separate `role` field), which keeps the schema
 * one-key-per-thing.
 */
export type CharacterAnimationRole =
  | 'idle-up'
  | 'idle-down'
  | 'idle-left'
  | 'idle-right'
  | 'walk-up'
  | 'walk-down'
  | 'walk-left'
  | 'walk-right'

export const REQUIRED_ROLES: readonly CharacterAnimationRole[] = [
  'idle-up',
  'idle-down',
  'idle-left',
  'idle-right',
  'walk-up',
  'walk-down',
  'walk-left',
  'walk-right',
] as const

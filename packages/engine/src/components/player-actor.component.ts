import { type Animation, Component } from 'excalibur'
import type { CharacterAnimationRole, Facing } from '../types/data/index.ts'

/**
 * Runtime-only state attached to the player {@link Actor}.
 *
 * Holds the role-indexed animation map (resolved either from the
 * configured player {@link CharacterDefinition} or from the
 * procedural placeholder), the current facing, movement speed in
 * pixels-per-second, and the currently-applied role so the
 * controller can diff against it before swapping graphics each
 * frame (avoids restarting Animations on every tick).
 *
 * Pure runtime data — never serialised. {@link PlayerSystem} owns
 * the lifetime.
 */
export class PlayerActorComponent extends Component {
  constructor(
    public animationsByRole: Partial<Record<CharacterAnimationRole, Animation>>,
    public facing: Facing,
    public speedPxPerSec: number,
    public currentRole: CharacterAnimationRole,
  ) {
    super()
  }
}

/** Marker — present on the entity that is currently the player actor. */
export class PlayerComponent extends Component {}

// Pure animation-selection logic for the character preview: parsing the
// `<kind>-<direction>` role ids, picking which sequence to play, and
// rotating the facing. GTK-free so it can be unit-tested (the widget in
// `character-preview.ts` subclasses `Adw.Bin` and can't be imported under
// `gjsify test`).

/** The four cardinal facings a required-role animation id can carry. */
export type DirectionRole = 'up' | 'down' | 'left' | 'right'

/** Whether the character is moving (`walk`) or standing still (`idle`). */
export type AnimationKind = 'walk' | 'idle'

/** Order the auto-cycling preview rotates the facing through. */
const DIRECTION_CYCLE: readonly DirectionRole[] = ['down', 'left', 'up', 'right']

const ANIMATION_ID_PATTERN = /^(walk|idle)-(up|down|left|right)$/

/** Minimal shape {@link resolveAnimation} needs — the engine's `CharacterAnimation` satisfies it. */
interface AnimationLike {
  id: string
}

/**
 * Split a required-role animation id into its kind + direction, or return
 * `null` for a custom (user-defined) id like `sword-swing`.
 */
export function parseAnimationRole(animId: string): { kind: AnimationKind; direction: DirectionRole } | null {
  const match = ANIMATION_ID_PATTERN.exec(animId)
  if (!match) return null
  return { kind: match[1] as AnimationKind, direction: match[2] as DirectionRole }
}

/** Compose the required-role id the preview plays for a facing + paused state. */
export function animationIdFor(direction: DirectionRole, paused: boolean): string {
  return `${paused ? 'idle' : 'walk'}-${direction}`
}

/** Next facing in the auto-cycle rotation (down → left → up → right → down). */
export function nextDirection(current: DirectionRole): DirectionRole {
  const index = DIRECTION_CYCLE.indexOf(current)
  return DIRECTION_CYCLE[(index + 1) % DIRECTION_CYCLE.length]
}

/**
 * Pick the animation to play from a character's list.
 *
 * A `customId` selects by id directly, and returns `null` when that id no
 * longer exists (e.g. the user deleted it elsewhere). Otherwise the
 * walk-/idle- × direction role is looked up with a cross-kind fallback, so
 * a character with only walk frames (or only idle) still previews —
 * showing something beats blanking the picture.
 */
export function resolveAnimation<T extends AnimationLike>(
  animations: readonly T[],
  customId: string | null,
  direction: DirectionRole,
  paused: boolean,
): T | null {
  if (customId !== null) return animations.find((a) => a.id === customId) ?? null
  const primary = animationIdFor(direction, paused)
  const fallback = animationIdFor(direction, !paused)
  return animations.find((a) => a.id === primary) ?? animations.find((a) => a.id === fallback) ?? null
}

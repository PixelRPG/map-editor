/**
 * The four cardinal directions an entity can face. Used by the player,
 * NPC routes, teleport destinations and spawn points.
 *
 * Extracted from the old `ObjectDefinition.ts` (deleted in the
 * entity-composition refactor) so the many `import { Facing }` sites
 * keep resolving through the `types/data` barrel.
 */
export type Facing = 'up' | 'down' | 'left' | 'right'

/** Type guard for {@link Facing}. */
export function isFacing(value: unknown): value is Facing {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right'
}

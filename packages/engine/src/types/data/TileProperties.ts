/**
 * Gameplay properties attached to a single sprite inside a sprite-set.
 *
 * Tile properties live in the sprite-set JSON (alongside the visual
 * sprite definition) so that the same sprite-set used by two projects
 * has identical tile behaviour — Water is Water regardless of which
 * game it's dropped into. Per-project overrides may be added later
 * via a project-level `tilePropertyOverrides` map if a real use case
 * shows up; for v1 the sprite-set is authoritative.
 *
 * Consumed by the engine's `WalkOnTileSystem` and any other system
 * that resolves tile-level behaviour from a sprite-set lookup.
 *
 * See `docs/concepts/object-system.md` for the full design.
 */
export interface TileProperties {
  /**
   * Whether the player (and other movement-controlled entities) can
   * walk through tiles using this sprite. Defaults to `true` when
   * absent. Blocked tiles bump and fire an `on-bump` engine event.
   */
  walkable?: boolean

  /**
   * Surface classification used by audio + animation systems to map
   * a tile to a default footstep sound / dust effect / swim state.
   * Free-form string so projects can introduce custom surfaces
   * (e.g. `'magma'`, `'cloud'`) without an engine schema change.
   */
  surface?: 'grass' | 'water' | 'stone' | 'sand' | 'wood' | 'snow' | 'dirt' | (string & {})

  /**
   * Explicit override for the footstep sound this tile triggers.
   * Skips the surface-derived default. Sound id is resolved by the
   * project's audio bank.
   */
  footstepSound?: string

  /**
   * Random-encounter table id triggered when the player steps onto
   * this tile. Engine resolves at walk-onto time.
   */
  encounterTable?: string

  /**
   * Project-specific extensions. Engine ignores anything in here;
   * scripts / custom systems can read it.
   */
  custom?: Record<string, unknown>
}

/**
 * Type guard for `TileProperties`. Accepts an empty object — every
 * field is optional.
 */
export function isTileProperties(value: unknown): value is TileProperties {
  if (value == null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.walkable !== undefined && typeof v.walkable !== 'boolean') return false
  if (v.surface !== undefined && typeof v.surface !== 'string') return false
  if (v.footstepSound !== undefined && typeof v.footstepSound !== 'string') return false
  if (v.encounterTable !== undefined && typeof v.encounterTable !== 'string') return false
  if (v.custom !== undefined && (typeof v.custom !== 'object' || v.custom === null)) return false
  return true
}

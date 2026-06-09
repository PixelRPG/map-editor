import type { ComponentData, EntityDefinition } from './EntityDefinition'
import { isComponentData, isEntityDefinition } from './EntityDefinition'

/**
 * A concrete instance of an entity on a map's tile grid.
 *
 * Two forms — exactly one of `defId` or `inline` must be set:
 *
 * - **Library reference** (`defId` + optional `overrides`): the
 *   canonical form for any entity that gets reused. Engine looks up
 *   the {@link EntityDefinition} in the project's `entityLibrary` and
 *   merges `overrides` on top (wholesale-replace per component `type`).
 *
 * - **Inline definition** (`inline`): the entire definition is stored
 *   on the placement itself — for genuinely one-off placements.
 *
 * Tile-snapped — `tileX`/`tileY` are grid cells, not pixels. The
 * `layerId` controls sort + visibility grouping only.
 *
 * See `docs/concepts/entity-and-appearance-model.md`. (Kept the
 * `ObjectPlacement` name + `objectPlacements` map key — these are
 * "placed objects on the map"; only the *definition* model changed.)
 */
export interface ObjectPlacement {
  /** Stable id, unique within the map. Used as a save-state key. */
  id: string

  /** Layer this placement sorts under. Must match a `LayerData.id`. */
  layerId: string

  /** Tile-grid column. */
  tileX: number

  /** Tile-grid row. */
  tileY: number

  /**
   * Reference to a library entry. Mutually exclusive with `inline`.
   * If both are set, validators reject the placement.
   */
  defId?: string

  /**
   * Per-instance overrides on top of the library entry. `name` replaces
   * the display name; each component in `components` **replaces the base
   * component of the same `type`** (wholesale, never deep-merged — same
   * discipline as the shipped object overrides). A component type absent
   * from the base is appended. See `mergePlacementComponents`.
   */
  overrides?: {
    name?: string
    components?: ComponentData[]
  }

  /**
   * Self-contained definition. Mutually exclusive with `defId`. Carries
   * its own `id` for entity identity at runtime (conventionally derived
   * from the placement id).
   */
  inline?: EntityDefinition
}

/** Type guard for `ObjectPlacement`. */
export function isObjectPlacement(value: unknown): value is ObjectPlacement {
  if (value == null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || v.id.length === 0) return false
  if (typeof v.layerId !== 'string' || v.layerId.length === 0) return false
  if (typeof v.tileX !== 'number' || !Number.isFinite(v.tileX)) return false
  if (typeof v.tileY !== 'number' || !Number.isFinite(v.tileY)) return false

  const hasDefId = typeof v.defId === 'string' && v.defId.length > 0
  const hasInline = v.inline !== undefined
  // Exactly one of the two must be set.
  if (hasDefId === hasInline) return false

  if (v.overrides !== undefined) {
    if (typeof v.overrides !== 'object' || v.overrides === null) return false
    const o = v.overrides as Record<string, unknown>
    if (o.name !== undefined && typeof o.name !== 'string') return false
    if (o.components !== undefined && (!Array.isArray(o.components) || !o.components.every(isComponentData)))
      return false
  }
  if (hasInline && !isEntityDefinition(v.inline)) return false

  return true
}

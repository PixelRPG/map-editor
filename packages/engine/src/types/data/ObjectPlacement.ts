import type { ObjectDefinition } from './ObjectDefinition'
import { isObjectDefinition } from './ObjectDefinition'

/**
 * A concrete instance of an object on a map's tile grid.
 *
 * Two forms — exactly one of `defId` or `inline` must be set:
 *
 * - **Library reference** (`defId` + optional `overrides`): the
 *   canonical form for any object that gets reused. Engine looks up
 *   the {@link ObjectDefinition} in the project's `objectLibrary`
 *   and shallow-merges `overrides` on top.
 *
 * - **Inline definition** (`inline`): the entire definition is
 *   stored on the placement itself. Useful for genuinely one-off
 *   placements where promoting to the library would just clutter
 *   the project.
 *
 * Tile-snapped — `tileX`/`tileY` are grid cells, not pixels. The
 * `layerId` controls sort + visibility grouping only; objects don't
 * "belong" to a layer in the data-ownership sense.
 *
 * See `docs/concepts/object-system.md` for the full design.
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
   * Shallow overrides applied on top of the library entry. Each
   * field replaces (does not merge) the corresponding field on the
   * resolved definition. `properties` is treated as a single value —
   * the whole `properties` block is replaced, not deep-merged.
   */
  overrides?: Partial<Omit<ObjectDefinition, 'id' | 'kind'>>

  /**
   * Self-contained definition. Mutually exclusive with `defId`. The
   * inline definition itself carries an `id` for entity identity at
   * runtime; conventionally derived from the placement id.
   */
  inline?: ObjectDefinition
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

  if (v.overrides !== undefined && (typeof v.overrides !== 'object' || v.overrides === null)) return false
  if (hasInline && !isObjectDefinition(v.inline)) return false

  return true
}

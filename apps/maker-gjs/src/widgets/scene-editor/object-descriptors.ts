import type Gdk from '@girs/gdk-4.0'
import type { EntityDefinition } from '@pixelrpg/engine'
import { markerColorFor } from '@pixelrpg/engine'
import { GdkSpriteSetResource, type GdkSpriteSheet } from '@pixelrpg/gjs'
import { visualOf } from '../../services/entity-visuals.ts'
import type { LoadedProject } from '../../services/project-loader.ts'

/** Sprite sheets keyed by sprite-set id; `null` marks a failed load. */
export type ObjectSheets = ReadonlyMap<string, GdkSpriteSheet | null>

/** A placeable library object as the Brush page's Things grid renders it. */
export interface ObjectBrushOption {
  id: string
  name: string
  paintable: Gdk.Paintable | null
  color?: string
}

/** Every sprite set referenced by the given definitions. */
export function spriteSetIdsFor(defs: Iterable<EntityDefinition | null>): Set<string> {
  const ids = new Set<string>()
  for (const def of defs) {
    const vis = visualOf(def)
    if (vis) ids.add(vis.spriteSetId)
  }
  return ids
}

/**
 * Load each sprite set once — most decoration objects share one set and
 * `getSpriteSet` is async. A failed set maps to `null` so callers fall
 * back to the marker colour instead of retrying.
 */
export async function loadObjectSheets(
  resource: LoadedProject['resource'],
  setIds: Iterable<string>,
): Promise<ObjectSheets> {
  const sheets = new Map<string, GdkSpriteSheet | null>()
  await Promise.all(
    Array.from(setIds).map(async (setId) => {
      try {
        const engineSet = await resource.getSpriteSet(setId)
        if (!engineSet) {
          sheets.set(setId, null)
          return
        }
        const gdkSet = await GdkSpriteSetResource.fromEngineResource(engineSet)
        sheets.set(setId, gdkSet.spriteSheet ?? null)
      } catch (error) {
        console.warn(`[object-descriptors] Failed to load sprite set "${setId}" for the Things grid:`, error)
        sheets.set(setId, null)
      }
    }),
  )
  return sheets
}

/**
 * The definition's sprite as a paintable, or `null`. Aspect-preserving:
 * these render in CONTAIN-fit swatches, where the default stretching
 * paintable distorts (squashed in grid cells, sliver-thin in rows).
 * Also how the depth glyphs get the project's player sprite.
 */
export function paintableFor(def: EntityDefinition | null, sheets: ObjectSheets): Gdk.Paintable | null {
  const vis = visualOf(def)
  if (!vis) return null
  return sheets.get(vis.spriteSetId)?.sprites[vis.spriteId]?.createPaintable({ keepAspectRatio: true }) ?? null
}

/** No resolvable sprite → the definition's marker colour, mirroring the map. */
function swatchColorFor(def: EntityDefinition | null, paintable: Gdk.Paintable | null): string | undefined {
  if (paintable || !def) return undefined
  return markerColorFor(def.components)
}

/**
 * Brush swatches for the Brush page's Things grid, so picking an object
 * looks and feels exactly like picking a tile.
 */
export function buildBrushOptions(defs: readonly EntityDefinition[], sheets: ObjectSheets): ObjectBrushOption[] {
  return defs.map((def) => {
    const paintable = paintableFor(def, sheets)
    return { id: def.id, name: def.name, paintable, color: swatchColorFor(def, paintable) }
  })
}

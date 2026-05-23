import type { MapResource } from '../resource/MapResource.ts'
import type { SpriteIndex } from '../types/SpriteIndex.ts'
import { isValidTileId } from './sprite.validator.ts'

function getSpriteCount(spriteSetResource: SpriteIndex): number {
  const sprites = spriteSetResource.sprites
  const ids = Object.keys(sprites).map((id) => Number.parseInt(id, 10))
  return ids.length > 0 ? Math.max(...ids) + 1 : 0
}

function spriteExists(spriteSetResource: SpriteIndex, spriteId: number): boolean {
  return !!spriteSetResource.sprites[spriteId]
}

interface SpriteSetReferenceLike {
  id?: string
  firstGid?: number
}

/**
 * Find sprite set ID and sprite ID for a given global tile ID.
 *
 * @param mapResource The MapResource to search
 * @param tileId The global tile ID to find
 * @returns Object with spriteSetId and spriteId, or null if not found
 */
export function findSpriteInfoForTileId(
  mapResource: MapResource,
  tileId: number,
): { spriteSetId: string; spriteId: number } | null {
  if (!isValidTileId(tileId)) return null

  const spriteSetResources = mapResource.getAllSpriteSetResources()
  const mapData = mapResource.mapData

  if (!mapData?.spriteSets) {
    console.warn('[SpriteInfoResolver] Invalid map resource data')
    return null
  }

  for (const [spriteSetId, spriteSetResource] of spriteSetResources) {
    const spriteSetRef = mapData.spriteSets?.find((ref: SpriteSetReferenceLike) => ref?.id === spriteSetId) as
      | SpriteSetReferenceLike
      | undefined
    if (!spriteSetRef?.firstGid || typeof spriteSetRef.firstGid !== 'number') {
      continue
    }

    const firstGid = spriteSetRef.firstGid
    const spriteCount = getSpriteCount(spriteSetResource)
    const lastGid = firstGid + spriteCount - 1

    if (tileId >= firstGid && tileId <= lastGid) {
      const localSpriteId = tileId - firstGid

      if (spriteExists(spriteSetResource, localSpriteId)) {
        return {
          spriteSetId: spriteSetId,
          spriteId: localSpriteId,
        }
      }
    }
  }

  console.warn(`[SpriteInfoResolver] Could not find sprite info for tileId ${tileId} in any sprite set`)
  return null
}

/**
 * Inverse of {@link findSpriteInfoForTileId}: turn a `(spriteSetId,
 * localSpriteId)` pair back into the global tile id used by
 * `ActiveTileComponent` / paint commands.
 *
 * Used by the eyedropper path: when the user clicks a tile we have
 * the sprite ref from `MapEditorComponent` (which stores local ids
 * + sprite-set id), and need to push it back into
 * `ActiveTileComponent` whose `spriteId` is the *global* form.
 *
 * Returns `null` when the map data doesn't reference the requested
 * sprite set, or when the sprite set's `firstGid` is missing /
 * non-numeric (malformed project file).
 */
export function findTileIdForSpriteInfo(
  mapResource: MapResource,
  spriteSetId: string,
  localSpriteId: number,
): number | null {
  const mapData = mapResource.mapData
  if (!mapData?.spriteSets) return null
  const ref = mapData.spriteSets.find((r: SpriteSetReferenceLike) => r?.id === spriteSetId) as
    | SpriteSetReferenceLike
    | undefined
  if (typeof ref?.firstGid !== 'number') return null
  return ref.firstGid + localSpriteId
}

import type { GameProjectResource, SpriteSetResource } from '@pixelrpg/engine'
import { GdkSpriteSetResource } from '@pixelrpg/gjs'

import { characterSpriteSetIds, isCharacterSpriteSet } from '../../services/sprite-set-classification.ts'
import { orderByProjectSpriteSets, type TilesetSortKey } from '../../services/tiles-view-model.ts'
import type { TilesetCardFacts } from './tileset-cards.ts'

/** One world tileset as the Sheets gallery holds it: engine data + its GTK wrapper. */
export interface TilesetEntry {
  id: string
  resource: SpriteSetResource
  gdk: GdkSpriteSetResource | null
}

const entryId = (entry: TilesetEntry): string => entry.id

/**
 * Snapshot a project's world tilesets in `spriteSets[]` order, wrapping
 * each as a GTK resource up-front so its card can show a sheet thumbnail.
 * Tilesets are few (a handful per project), so eager wrapping is cheap and
 * keeps the gallery from popping thumbnails in one by one.
 *
 * Character animation sheets are excluded — they belong to the Cast view
 * (see {@link isCharacterSpriteSet}). A set whose image fails to wrap is
 * kept without a thumbnail rather than dropped.
 */
export async function loadTilesetEntries(project: GameProjectResource): Promise<TilesetEntry[]> {
  const usedByCharacter = characterSpriteSetIds(project.data?.entityLibrary)
  const entries: TilesetEntry[] = []
  for (const [id, resource] of project.spriteSets) {
    if (isCharacterSpriteSet(resource.data?.kind, usedByCharacter.has(id))) continue
    entries.push({ id, resource, gdk: await wrapForThumbnail(resource) })
  }
  return orderByProjectSpriteSets(
    entries,
    entryId,
    (project.data?.spriteSets ?? []).map((ref) => ref.id),
  )
}

async function wrapForThumbnail(resource: SpriteSetResource): Promise<GdkSpriteSetResource | null> {
  try {
    return await GdkSpriteSetResource.fromEngineResource(resource)
  } catch (err) {
    console.warn('[TilesView] Failed to wrap sprite-set for thumbnail:', err)
    return null
  }
}

/**
 * Wrap an entry's sheet on demand — the palette needs it even for a set
 * whose eager wrap failed. Returns whether the entry now has one.
 */
export async function ensureSpriteSetLoaded(entry: TilesetEntry): Promise<boolean> {
  if (entry.gdk) return true
  try {
    entry.gdk = await GdkSpriteSetResource.fromEngineResource(entry.resource)
    return true
  } catch (err) {
    console.warn('[TilesView] Failed to load sprite-set for palette:', err)
    return false
  }
}

/** Display name of a tileset, falling back to its id. */
export function tilesetName(entry: TilesetEntry): string {
  return entry.resource.data?.name ?? entry.id
}

/** The fields the gallery's search + sort read off an entry. */
export function tilesetSortKey(entry: TilesetEntry, mapUsers: number): TilesetSortKey {
  return { name: tilesetName(entry), spriteWidth: entry.resource.data?.spriteWidth ?? 0, mapUsers }
}

/** Everything a tileset card states about an entry. */
export function tilesetCardFacts(entry: TilesetEntry, mapUsers: number): TilesetCardFacts {
  const data = entry.resource.data
  return {
    id: entry.id,
    name: tilesetName(entry),
    spriteCount: data?.sprites?.length ?? 0,
    spriteWidth: data?.spriteWidth ?? 0,
    spriteHeight: data?.spriteHeight ?? 0,
    mapUsers,
  }
}

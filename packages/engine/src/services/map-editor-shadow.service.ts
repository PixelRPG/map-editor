import type { MapEditorComponent, TileSpriteRef } from '../components/map-editor.component.ts'

/**
 * Operations on the {@link MapEditorComponent} shadow state.
 *
 * The component itself is pure data (a `Record<string, TileSpriteRef[]>`
 * keyed by `"x,y"`) per AGENTS.md ECS doctrine — all the read/write
 * verbs live here as free functions instead of methods on the
 * component. Callers pass `(tileX, tileY)` coordinates rather than
 * `ex.Tile` runtime objects so the shadow state stays decoupled from
 * Excalibur's runtime entity graph and round-trips as JSON.
 */

function coordKey(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`
}

function parseCoordKey(key: string): { tileX: number; tileY: number } {
  const comma = key.indexOf(',')
  return {
    tileX: Number(key.slice(0, comma)),
    tileY: Number(key.slice(comma + 1)),
  }
}

/**
 * Seed the shadow state from a coord-keyed map of refs. Used by
 * `MapResource.addToScene` once per scene; clears any pre-existing
 * state on the component.
 */
export function setInitialSprites(
  component: MapEditorComponent,
  refsByCoord: ReadonlyMap<string, TileSpriteRef[]>,
): void {
  const next: Record<string, TileSpriteRef[]> = {}
  for (const [key, refs] of refsByCoord) {
    next[key] = [...refs]
  }
  component.sprites = next
}

/**
 * Read sprite refs at `(tileX, tileY)`. With `layerId` supplied,
 * filters to refs on that layer; without, returns every layer's
 * contribution stacked together.
 */
export function getSpritesAt(
  component: MapEditorComponent,
  tileX: number,
  tileY: number,
  layerId?: string,
): TileSpriteRef[] {
  const refs = component.sprites[coordKey(tileX, tileY)]
  if (!refs) return []
  if (!layerId) return refs
  return refs.filter((sprite) => sprite.layerId === layerId)
}

/**
 * Replace the refs at `(tileX, tileY)` on `layerId` with the supplied
 * set. Refs on other layers at the same tile are preserved. The
 * `layerId` field is stamped onto each input ref so callers don't
 * have to remember to duplicate it.
 */
export function setSpritesAt(
  component: MapEditorComponent,
  tileX: number,
  tileY: number,
  layerId: string,
  sprites: ReadonlyArray<Omit<TileSpriteRef, 'layerId'>>,
): void {
  const key = coordKey(tileX, tileY)
  const existing = component.sprites[key] ?? []
  const otherLayerSprites = existing.filter((sprite) => sprite.layerId !== layerId)
  const stamped = sprites.map((sprite) => ({ ...sprite, layerId }))
  const next = [...otherLayerSprites, ...stamped]
  if (next.length === 0) {
    delete component.sprites[key]
  } else {
    component.sprites[key] = next
  }
}

/**
 * Yield every `(tileX, tileY)` that has at least one sprite on
 * **any** layer. Used by `MapResource.refreshTileSolidsForSprite`
 * to find every tile that might be affected by a sprite-set
 * `solid` toggle.
 */
export function* iterateOccupiedCoords(
  component: MapEditorComponent,
): IterableIterator<{ tileX: number; tileY: number }> {
  for (const key of Object.keys(component.sprites)) {
    yield parseCoordKey(key)
  }
}

/** Build a coord-keyed shadow ref map from a plain entry list — used by `MapResource.processTileLayer`. */
export { coordKey as shadowCoordKey }

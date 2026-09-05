import type { TileSpriteRef } from '../components/map-editor.component.ts'
import type { SpriteDataMap } from '../types/index.ts'
import { parseShadowCoordKey } from '../services/map-editor-shadow.service.ts'

/**
 * Fold the live editor shadow back into the persisted per-layer sprite
 * arrays.
 *
 * Paints mutate `MapEditorComponent.sprites` only; `mapData.layers[]`
 * stays at the load-time snapshot until something explicitly syncs it.
 * Anything that needs a current view of the map (a disk write, a
 * project snapshot for a late-joining peer) goes through this fold
 * first.
 *
 * The result is deterministic — sorted by `(y, x)` — so wire bytes are
 * stable across runs of the host, and a file that lands on disk diffs
 * cleanly. No depth is written per sprite: the order of two layers'
 * sprites on one cell is the layers' order in `MapData.layers`.
 *
 * Lossy in one documented way: per-placement `properties` and `solid`
 * overrides on the original `SpriteDataMap` entries do not survive,
 * because the shadow only tracks the gameplay-loaded fields
 * (`spriteSetId`, `spriteId`, `animationId`, `layerId`).
 */

/** The `"x,y" → refs` record a single plane's `MapEditorComponent` holds. */
export type ShadowSprites = Readonly<Record<string, readonly TileSpriteRef[]>>

/**
 * Collect every plane's shadow into `layerId → sprites[]`, sorted.
 * Layers with no painted tile are absent from the result; the caller
 * writes an empty array for those.
 */
export function foldShadowToLayerSprites(shadows: Iterable<ShadowSprites>): Map<string, SpriteDataMap[]> {
  const spritesPerLayer = new Map<string, SpriteDataMap[]>()
  for (const shadow of shadows) {
    for (const [key, refs] of Object.entries(shadow)) {
      const { tileX, tileY } = parseShadowCoordKey(key)
      for (const ref of refs) {
        const list = spritesPerLayer.get(ref.layerId) ?? []
        list.push(toSpriteData(ref, tileX, tileY))
        spritesPerLayer.set(ref.layerId, list)
      }
    }
  }
  for (const sprites of spritesPerLayer.values()) {
    sprites.sort((a, b) => a.y - b.y || a.x - b.x)
  }
  return spritesPerLayer
}

/** Optional fields stay absent rather than becoming `undefined` — the JSON must not grow null keys. */
function toSpriteData(ref: TileSpriteRef, tileX: number, tileY: number): SpriteDataMap {
  const entry: SpriteDataMap = {
    x: tileX,
    y: tileY,
    spriteSetId: ref.spriteSetId,
    spriteId: ref.spriteId,
  }
  if (ref.animationId !== undefined) entry.animationId = ref.animationId
  return entry
}

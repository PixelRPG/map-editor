import type { Animation, Graphic, Sprite, Tile, TileMap } from 'excalibur'
import { MapEditorComponent, type TileSpriteRef } from '../components/map-editor.component.ts'
import { TIER_Z, TileMapTierComponent } from '../components/tilemap-tier.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { collectHiddenLayerIds } from './layer-visibility.ts'
import { getSpritesAt } from './map-editor-shadow.service.ts'

/**
 * Tile graphics operations and sprite rendering.
 *
 * Read shadow-state from {@link MapEditorComponent} on the TileMap.
 * The TileMap's `MapEditorComponent` is added when the MapResource enters a
 * scene; calling these functions before that point is a programmer error and
 * surfaces as an early return + warning.
 *
 * **Cloning is load-bearing.** Excalibur's `Sprite` / `Animation`
 * instances track per-draw state (transform matrices, current frame
 * counter for animations). Adding the same instance to multiple
 * tiles via `tile.addGraphic` causes visual corruption when one
 * tile's render mutates state another tile is about to read in the
 * same frame. We clone every graphic before attaching — mirroring
 * the pattern that `MapResource.applyInitialGraphics` has always
 * used. Forgetting this is the bug that produced
 * "rocks vanish after toggling layer visibility": initial render
 * cloned, runtime rebuild reused references, and the subsequent
 * toggle's rebuild collided with the shared state.
 */

/**
 * Resolve a `TileSpriteRef` into a fresh, ready-to-attach
 * Excalibur graphic. Returns `null` when the sprite set isn't
 * loaded or the requested sprite / animation isn't in it.
 *
 * Animations take precedence over static sprites — matches
 * `MapResource.applyInitialGraphics` (animated tiles fall back to
 * the static sprite only when the animation id is missing or
 * unknown).
 */
function resolveTileGraphic(mapResource: MapResource, ref: TileSpriteRef): Graphic | null {
  const spriteSet = mapResource.getSpriteSetResource(ref.spriteSetId)
  if (!spriteSet) return null
  if (ref.animationId) {
    const anim: Animation | undefined = spriteSet.animations[ref.animationId]
    if (anim) return anim.clone()
  }
  const sprite: Sprite | undefined = spriteSet.sprites[ref.spriteId]
  return sprite ? sprite.clone() : null
}

/**
 * Optional per-sprite opacity hook. When supplied, the returned
 * value is written to the cloned graphic's `opacity` before it's
 * attached to the tile. Used by the editor view mode (grid mode
 * dims non-active-layer sprites) — runtime / play paths leave it
 * undefined to keep everything fully opaque.
 */
type TileGraphicOpacityProvider = (ref: TileSpriteRef) => number

export function rebuildAllTileGraphics(
  tileMap: TileMap,
  mapResource: MapResource,
  tile: Tile,
  opacityFor?: TileGraphicOpacityProvider,
): void {
  const editorComponent = tileMap.get(MapEditorComponent)
  if (!editorComponent) return

  const hiddenLayerIds = collectHiddenLayerIds(mapResource)
  const allSprites = getSpritesAt(editorComponent, tile.x, tile.y)
  // Filter out sprites whose layer is hidden — they stay in the
  // shadow state (so toggling visibility back on is a pure graphics
  // rebuild without re-loading from JSON) but we skip them at render.
  const visibleSprites = allSprites.filter((s) => !hiddenLayerIds.has(s.layerId))
  const sortedSprites = [...visibleSprites].sort((a, b) => (a?.zIndex || 0) - (b?.zIndex || 0))

  tile.clearGraphics()

  for (const ref of sortedSprites) {
    if (!ref?.spriteSetId || typeof ref.spriteId !== 'number') continue
    const graphic = resolveTileGraphic(mapResource, ref)
    if (!graphic) continue
    if (opacityFor) graphic.opacity = opacityFor(ref)
    try {
      tile.addGraphic(graphic)
    } catch (error) {
      // Single-sprite failure shouldn't abort the whole rebuild; log with
      // enough context to debug, then continue.
      console.error(`[TileGraphicsManager] Failed to add graphic ${ref.spriteSetId}#${ref.spriteId} to tile:`, error)
    }
  }
}

/**
 * Pin a tilemap's z to its declared tier. The tilemap's z is set
 * once on creation by {@link MapResource.createTileMaps} and
 * doesn't change at runtime, so this function is now a noop for
 * tilemaps that already carry a {@link TileMapTierComponent} —
 * kept exported because it's part of {@link refreshAllTileGraphics}'s
 * pair contract.
 *
 * Pre-refactor this set `tileMap.z = max(layer.z, sprite.z) + 100`,
 * which forced the monolithic tilemap *above* every actor in the
 * scene. That offset is the bug the tier system replaces — actors
 * (placements, the future player) now interleave with tilemaps at
 * their tier's z, not flat-stacked behind one tilemap z=109.
 *
 * `mapResource` is retained in the signature so call sites don't
 * change, and so we can fall back to its first layer's z if a
 * tilemap somehow lacks the tier marker (defensive only — every
 * `MapResource`-built tilemap has one).
 */
export function updateTileMapZIndex(tileMap: TileMap, mapResource: MapResource): void {
  const tierComponent = tileMap.get(TileMapTierComponent)
  if (tierComponent) {
    tileMap.z = TIER_Z[tierComponent.tier]
    return
  }
  // Defensive fallback for tilemaps not built by MapResource — pin
  // them to the ground tier so they at least don't overpaint
  // actors. mapResource access here is just to keep the signature
  // stable for any external caller; not used.
  void mapResource
  tileMap.z = TIER_Z.ground
}

/**
 * Rebuild graphics on every tile in the supplied `TileMap`. Used after
 * a global state change that affects rendering for many tiles at once
 * — currently: toggling `layer.visible` on a layer. Pairs the per-tile
 * rebuild with a single z-index pass at the end so the maximum
 * z-index of the tilemap reflects all (visible) sprites.
 *
 * Hot for huge maps — O(columns × rows × sprites-per-tile) — but
 * called only on explicit user toggles, not per frame.
 */
export function refreshAllTileGraphics(
  tileMap: TileMap,
  mapResource: MapResource,
  opacityFor?: TileGraphicOpacityProvider,
): void {
  for (let x = 0; x < tileMap.columns; x++) {
    for (let y = 0; y < tileMap.rows; y++) {
      const tile = tileMap.getTile(x, y)
      if (!tile) continue
      rebuildAllTileGraphics(tileMap, mapResource, tile, opacityFor)
    }
  }
  updateTileMapZIndex(tileMap, mapResource)
}

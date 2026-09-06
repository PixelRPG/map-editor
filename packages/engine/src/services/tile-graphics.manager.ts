import type { Animation, Graphic, Sprite, Tile, TileMap } from 'excalibur'
import { MapEditorComponent, type TileSpriteRef } from '../components/map-editor.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { layerOrderIndex, sortRefsByLayerOrder } from './layer-order.ts'
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

/**
 * Rebuild one tile's graphics from the shadow: the visible refs on the
 * cell, in draw order. Draw order is the layers' order in
 * `MapData.layers` — the same rule the initial paint and the walk-on
 * lookup use — never the shadow's insertion order, which a live paint
 * appends to.
 */
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
  const sortedSprites = sortRefsByLayerOrder(visibleSprites, layerOrderIndex(mapResource.mapData?.layers ?? []))

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
 * Rebuild graphics on every tile in the supplied `TileMap`. Used after
 * a global state change that affects rendering for many tiles at once
 * — toggling `layer.visible`, reordering a layer, moving a layer to
 * another plane.
 *
 * Hot for huge maps — O(columns × rows × sprites-per-tile) — but
 * called only on explicit user actions, not per frame.
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
}

import type { Scene, TileMap } from 'excalibur'
import { MapScene } from '../scenes/map.scene.ts'
import { getSpritesAt, parseShadowCoordKey, setSpritesAt } from '../services/map-editor-shadow.service.ts'
import { attachPlacement, detachPlacement } from '../services/placement-store.service.ts'
import { rebuildAllTileGraphics } from '../services/tile-graphics.manager.ts'
import { findTileMapForLayer } from '../services/tile-paint.service.ts'
import type { LayerData, ObjectPlacement } from '../types/data/index.ts'
import type { Command } from './types.ts'

/**
 * Payload of {@link DuplicateLayerCommand} and
 * {@link RemoveLayerCommand} — the SAME shape for both, because the two
 * commands are each other's mirror: duplicate attaches on `apply` and
 * detaches on `revert`, remove the other way round.
 *
 * It carries the layer's whole CONTENT, not just its id:
 *
 * - `layer` includes its tile sprites in `LayerData.sprites`. At
 *   runtime those live in the plane tilemap's `MapEditorComponent`
 *   shadow, not on the layer, and that shadow is only synced back into
 *   `LayerData` on save — so the caller snapshots the live shadow into
 *   the payload at dispatch time.
 * - `placements` is every `ObjectPlacement` whose `layerId` is this
 *   layer; they are stored on `MapData`, not inside the layer, and
 *   would otherwise outlive it as orphans.
 *
 * Capturing both makes the command deterministic and transport-friendly
 * (AGENTS.md [Transport-ready primitives] rules 2 + 4): a peer applying
 * the op, and an undo three steps later, reconstruct exactly the layer
 * that was there — neither has to go looking for content that by then
 * may be gone.
 */
export interface LayerContentPayload {
  layer: LayerData
  /** Position in `MapData.layers` (clamped on apply). */
  index: number
  placements: ObjectPlacement[]
}

/**
 * Duplicate a layer: a new layer (fresh id, "… copy" name) carrying a
 * copy of the original's tiles and placements. One command, one undo
 * step — the alternative, an add plus a paint per cell, would make
 * undoing a duplicate of a 1000-tile layer a thousand presses.
 *
 * Distinct from {@link AddLayerCommand}, which only splices an EMPTY
 * layer into `MapData.layers` and relies on the undo invariant that
 * later paints are reverted first. A duplicate arrives with content, so
 * it owns the shadow + placement writes itself.
 */
export class DuplicateLayerCommand implements Command<LayerContentPayload> {
  static readonly KIND = 'layer.duplicate'
  readonly kind = DuplicateLayerCommand.KIND

  constructor(readonly payload: LayerContentPayload) {}

  get label(): string {
    return `Duplicate layer "${this.payload.layer.name}"`
  }

  apply(scene: Scene): void {
    attachLayer(scene, this.payload)
  }

  revert(scene: Scene): void {
    detachLayer(scene, this.payload)
  }
}

/**
 * Delete a layer with everything on it. Invertible: `revert` puts the
 * layer back at its old index with its tiles and placements, which is
 * what makes the UI safe to skip a confirmation dialog for — the
 * "Deleted X · Undo" toast is the safeguard.
 */
export class RemoveLayerCommand implements Command<LayerContentPayload> {
  static readonly KIND = 'layer.remove'
  readonly kind = RemoveLayerCommand.KIND

  constructor(readonly payload: LayerContentPayload) {}

  get label(): string {
    return `Delete layer "${this.payload.layer.name}"`
  }

  apply(scene: Scene): void {
    detachLayer(scene, this.payload)
  }

  revert(scene: Scene): void {
    attachLayer(scene, this.payload)
  }
}

/**
 * Put the payload's layer into the map: splice it into `MapData.layers`,
 * write its tiles into its plane's shadow and spawn its placements.
 * Idempotent — an already-present id is skipped whole, so a replayed op
 * cannot double-spawn.
 */
function attachLayer(scene: Scene, payload: LayerContentPayload): void {
  if (!(scene instanceof MapScene)) return
  const layers = scene.mapResource?.mapData?.layers
  if (!layers) return
  if (layers.some((l) => l.id === payload.layer.id)) return
  layers.splice(Math.max(0, Math.min(payload.index, layers.length)), 0, payload.layer)

  // After the splice, so the plane lookup resolves through the layer.
  const target = findTileMapForLayer(scene, payload.layer.id)
  if (target) {
    for (const sprite of payload.layer.sprites ?? []) {
      const kept = getSpritesAt(target.editor, sprite.x, sprite.y, payload.layer.id)
      setSpritesAt(target.editor, sprite.x, sprite.y, payload.layer.id, [
        ...kept,
        { spriteSetId: sprite.spriteSetId, spriteId: sprite.spriteId, animationId: sprite.animationId },
      ])
      refreshCell(scene, target.tileMap, sprite.x, sprite.y)
    }
  }
  for (const placement of payload.placements) attachPlacement(scene, placement)
}

/**
 * Take the payload's layer out of the map: despawn its placements,
 * clear every cell it holds in its plane's shadow and splice it out of
 * `MapData.layers`. Clears from the LIVE shadow rather than the
 * payload's cell list, so a peer whose shadow drifted still ends up
 * with no orphan sprites. Idempotent — an unknown id is skipped.
 */
function detachLayer(scene: Scene, payload: LayerContentPayload): void {
  if (!(scene instanceof MapScene)) return
  const layers = scene.mapResource?.mapData?.layers
  if (!layers) return
  const at = layers.findIndex((l) => l.id === payload.layer.id)
  if (at < 0) return

  for (const placement of payload.placements) detachPlacement(scene, placement.id)

  // Before the splice, while the plane lookup still resolves.
  const target = findTileMapForLayer(scene, payload.layer.id)
  if (target) {
    // Snapshot the keys: `setSpritesAt` deletes an emptied cell from
    // the record we would otherwise be iterating.
    for (const key of Object.keys(target.editor.sprites)) {
      const { tileX, tileY } = parseShadowCoordKey(key)
      if (getSpritesAt(target.editor, tileX, tileY, payload.layer.id).length === 0) continue
      setSpritesAt(target.editor, tileX, tileY, payload.layer.id, [])
      refreshCell(scene, target.tileMap, tileX, tileY)
    }
  }
  layers.splice(at, 1)
}

/** Redraw one cell's whole stack and re-derive its collision from the shadow. */
function refreshCell(scene: MapScene, tileMap: TileMap, tileX: number, tileY: number): void {
  const tile = tileMap.getTile(tileX, tileY)
  if (!tile) return
  rebuildAllTileGraphics(tileMap, scene.mapResource, tile)
  scene.mapResource.refreshTileSolidFromEditor(tileMap, tile)
}

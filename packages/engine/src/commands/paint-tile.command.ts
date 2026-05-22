import { type Scene, TileMap } from 'excalibur'
import { MapEditorComponent } from '../components/map-editor.component.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { addSpriteToTileForLayer, removeSpritesFromTileForLayer } from '../services/layer.manager.ts'
import type { Command } from './types.ts'

/**
 * Payload of {@link PaintTileCommand}. All identifiers are stable
 * across save/load + cross-peer.
 */
export interface PaintTilePayload {
  layerId: string
  tileX: number
  tileY: number
  /** Global tile id (sprite-set local index + `firstGid`). */
  spriteId: number
  /**
   * Previous sprite refs on the targeted tile + layer, captured at
   * apply time. Used by `revert` to restore the prior state. `[]`
   * means the tile was empty before this paint.
   */
  previousSprites: Array<{ spriteSetId: string; spriteId: number; zIndex?: number; animationId?: string }>
}

/**
 * Painting a tile = setting the sprite at (tileX, tileY) on `layerId`
 * to `spriteId`, replacing any prior sprites on the same (tile, layer)
 * slot. Revert restores the captured `previousSprites`.
 *
 * Construction note: the caller is responsible for populating
 * `previousSprites` from `MapEditorComponent.getSpritesForTileAndLayer`
 * **before** mutating. The command does NOT capture the previous state
 * itself — that would require running side effects in the constructor,
 * which breaks the "command is pure data" contract.
 */
export class PaintTileCommand implements Command<PaintTilePayload> {
  static readonly KIND = 'tile.paint'
  readonly kind = PaintTileCommand.KIND

  constructor(readonly payload: PaintTilePayload) {}

  get label(): string {
    return `Paint tile (${this.payload.tileX}, ${this.payload.tileY})`
  }

  apply(scene: Scene): void {
    const ctx = resolveContext(scene)
    if (!ctx) return
    const tile = ctx.tileMap.getTile(this.payload.tileX, this.payload.tileY)
    if (!tile) return
    addSpriteToTileForLayer(ctx.tileMap, ctx.mapResource, tile, this.payload.layerId, this.payload.spriteId)
  }

  revert(scene: Scene): void {
    const ctx = resolveContext(scene)
    if (!ctx) return
    const tile = ctx.tileMap.getTile(this.payload.tileX, this.payload.tileY)
    if (!tile) return
    if (this.payload.previousSprites.length === 0) {
      removeSpritesFromTileForLayer(ctx.tileMap, ctx.mapResource, tile, this.payload.layerId)
      return
    }
    const editor = ctx.tileMap.get(MapEditorComponent)
    if (!editor) return
    editor.setSpritesForTileAndLayer(tile, this.payload.layerId, this.payload.previousSprites)
    // Refresh graphics so the restored sprites render.
    ctx.tileMap.getTile(this.payload.tileX, this.payload.tileY)
  }
}

/**
 * Erasing a tile = clearing the sprites at (tileX, tileY) on `layerId`.
 * Revert restores the captured `previousSprites`. Same construction
 * contract as `PaintTileCommand` for the previous-state capture.
 */
export class EraseTileCommand implements Command<Omit<PaintTilePayload, 'spriteId'>> {
  static readonly KIND = 'tile.erase'
  readonly kind = EraseTileCommand.KIND

  constructor(readonly payload: Omit<PaintTilePayload, 'spriteId'>) {}

  get label(): string {
    return `Erase tile (${this.payload.tileX}, ${this.payload.tileY})`
  }

  apply(scene: Scene): void {
    const ctx = resolveContext(scene)
    if (!ctx) return
    const tile = ctx.tileMap.getTile(this.payload.tileX, this.payload.tileY)
    if (!tile) return
    removeSpritesFromTileForLayer(ctx.tileMap, ctx.mapResource, tile, this.payload.layerId)
  }

  revert(scene: Scene): void {
    const ctx = resolveContext(scene)
    if (!ctx) return
    const tile = ctx.tileMap.getTile(this.payload.tileX, this.payload.tileY)
    if (!tile) return
    if (this.payload.previousSprites.length === 0) return
    const editor = ctx.tileMap.get(MapEditorComponent)
    if (!editor) return
    editor.setSpritesForTileAndLayer(tile, this.payload.layerId, this.payload.previousSprites)
  }
}

/**
 * Find the `TileMap` + `MapResource` on a `MapScene`. Returns `null`
 * if the scene isn't a `MapScene` or its tilemap isn't realised yet.
 */
function resolveContext(scene: Scene) {
  if (!(scene instanceof MapScene)) return null
  const mapResource = scene.mapResource
  if (!mapResource) return null
  for (const entity of scene.world.entityManager.entities) {
    if (entity instanceof TileMap) {
      return { tileMap: entity, mapResource }
    }
  }
  return null
}

import type { Tile } from 'excalibur'
import { Component } from 'excalibur'

export interface TileSpriteRef {
  spriteSetId: string
  spriteId: number
  animationId?: string
  zIndex?: number
  layerId: string
}

/**
 * Per-tilemap editor shadow state. Holds the active list of sprite
 * references on each tile (grouped by layer) so the editor can read
 * + mutate without round-tripping through `mapData.layers[].sprites[]`
 * (which is the JSON-backed source of truth and gets synced on save,
 * not on every paint).
 *
 * Pure data + Map-backed accessors — no lifecycle hooks. Services
 * (`LayerManager`, `TileEditorSystem`) read/write via the public
 * methods; `MapResource.processTileLayer` seeds the initial state
 * via `setInitialSprites`.
 */
export class MapEditorComponent extends Component {
  private readonly sprites = new Map<Tile, TileSpriteRef[]>()

  public setInitialSprites(sprites: Map<Tile, TileSpriteRef[]>): void {
    this.sprites.clear()
    for (const [tile, refs] of sprites) {
      this.sprites.set(tile, [...refs])
    }
  }

  public getSpritesForTileAndLayer(tile: Tile, layerId?: string): TileSpriteRef[] {
    const allSprites = this.sprites.get(tile) || []
    if (!layerId) return allSprites
    return allSprites.filter((sprite) => sprite.layerId === layerId)
  }

  public setSpritesForTileAndLayer(tile: Tile, layerId: string, sprites: Array<Omit<TileSpriteRef, 'layerId'>>): void {
    const existingSprites = this.sprites.get(tile) || []
    const otherLayerSprites = existingSprites.filter((sprite) => sprite.layerId !== layerId)
    const newSprites = sprites.map((sprite) => ({ ...sprite, layerId }))
    this.sprites.set(tile, [...otherLayerSprites, ...newSprites])
  }

  public getAllTilesWithSprites(): IterableIterator<Tile> {
    return this.sprites.keys()
  }
}

import { Component } from 'excalibur'
import type { TileMap, Tile } from 'excalibur'

export interface TileSpriteRef {
  spriteSetId: string
  spriteId: number
  animationId?: string
  zIndex?: number
  layerId: string
}

/**
 * ECS Component that enables TileMap entities to be edited.
 *
 * Owns the per-tile sprite references (the editor's shadow-state for which
 * sprites live on which (tile, layer)) alongside selection/hover state. Services
 * read and mutate this via the component instead of the MapResource, which now
 * only loads data.
 */
export class MapEditorComponent extends Component {
  public isEditable: boolean = true

  public selectedTileCoords: { x: number; y: number } | null = null

  public hoverTileCoords: { x: number; y: number } | null = null

  public hoverHasChanged: boolean = false

  public onTileSelected?: (tile: Tile, coords: { x: number; y: number }) => void

  public onTileHovered?: (tile: Tile, coords: { x: number; y: number }) => void

  private readonly sprites = new Map<Tile, TileSpriteRef[]>()

  private tileMap: TileMap | null = null

  public onAdd(owner: TileMap): void {
    this.tileMap = owner
  }

  public onRemove(): void {
    this.tileMap = null
    this.selectedTileCoords = null
    this.hoverTileCoords = null
    this.sprites.clear()
  }

  public clearHoverState(): void {
    if (this.hoverTileCoords !== null) {
      this.hoverHasChanged = true
    }
    this.hoverTileCoords = null
  }

  public enableEditing(): void {
    this.isEditable = true
  }

  public disableEditing(): void {
    this.isEditable = false
    this.selectedTileCoords = null
    this.hoverTileCoords = null
  }

  public getSelectedTile(): Tile | null {
    if (!this.tileMap || !this.selectedTileCoords) return null
    return this.tileMap.getTile(
      this.selectedTileCoords.x,
      this.selectedTileCoords.y,
    )
  }

  public getHoveredTile(): Tile | null {
    if (!this.tileMap || !this.hoverTileCoords) return null
    return this.tileMap.getTile(this.hoverTileCoords.x, this.hoverTileCoords.y)
  }

  public setInitialSprites(sprites: Map<Tile, TileSpriteRef[]>): void {
    this.sprites.clear()
    for (const [tile, refs] of sprites) {
      this.sprites.set(tile, [...refs])
    }
  }

  public getSpritesForTileAndLayer(
    tile: Tile,
    layerId?: string,
  ): TileSpriteRef[] {
    const allSprites = this.sprites.get(tile) || []
    if (!layerId) return allSprites
    return allSprites.filter((sprite) => sprite.layerId === layerId)
  }

  public setSpritesForTileAndLayer(
    tile: Tile,
    layerId: string,
    sprites: Array<Omit<TileSpriteRef, 'layerId'>>,
  ): void {
    const existingSprites = this.sprites.get(tile) || []
    const otherLayerSprites = existingSprites.filter(
      (sprite) => sprite.layerId !== layerId,
    )
    const newSprites = sprites.map((sprite) => ({ ...sprite, layerId }))
    this.sprites.set(tile, [...otherLayerSprites, ...newSprites])
  }

  public clearSpritesForTileAndLayer(tile: Tile, layerId: string): void {
    const existingSprites = this.sprites.get(tile) || []
    const remainingSprites = existingSprites.filter(
      (sprite) => sprite.layerId !== layerId,
    )
    this.sprites.set(tile, remainingSprites)
  }

  public getAllTilesWithSprites(): IterableIterator<Tile> {
    return this.sprites.keys()
  }
}

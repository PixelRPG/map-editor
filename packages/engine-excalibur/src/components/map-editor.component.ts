import { Component } from 'excalibur'
import type { TileMap, Tile, PointerEvent } from 'excalibur'

/**
 * ECS Component that enables TileMap entities to be edited
 *
 * This component integrates with the existing TileMap event system to provide
 * editor-specific state management. It leverages the existing TileMap infrastructure
 * for coordinate transformation and pointer event handling.
 *
 * @example
 * ```typescript
 * // Activate editor mode for a tilemap
 * tileMap.addComponent(new MapEditorComponent())
 *
 * // Component will automatically listen to TileMap pointer events
 * const editorComponent = tileMap.get(MapEditorComponent)
 * console.log('Selected tile:', editorComponent.selectedTileCoords)
 * ```
 */
export class MapEditorComponent extends Component {
  /**
   * Flag indicating if the TileMap is currently editable
   * When false, the component still exists but ignores interactions
   */
  public isEditable: boolean = true

  /**
   * Currently selected tile coordinates in tile space
   */
  public selectedTileCoords: { x: number; y: number } | null = null

  /**
   * Currently hovered tile coordinates in tile space
   * Updated when pointer moves over tiles
   */
  public hoverTileCoords: { x: number; y: number } | null = null

  /**
   * Flag indicating if the hover has changed
   * We need this to avoid sending unnecessary RPC events
   */
  public hoverHasChanged: boolean = false

  /**
   * Callback fired when a tile is selected (clicked)
   * Provides both the tile object and its coordinates
   */
  public onTileSelected?: (tile: Tile, coords: { x: number; y: number }) => void

  /**
   * Callback fired when hovering over a tile
   * Provides both the tile object and its coordinates
   */
  public onTileHovered?: (tile: Tile, coords: { x: number; y: number }) => void

  /**
   * Reference to the TileMap this component is attached to
   * Set during initialization when component is added to entity
   */
  private tileMap: TileMap | null = null

  /**
   * Initialize the component when added to a TileMap entity
   * Sets up event listeners for existing TileMap pointer events
   */
  public onAdd(owner: TileMap): void {
    this.tileMap = owner
    // Event listeners are now handled by EditorInputSystem
    // this.setupEventListeners()
  }

  /**
   * Clean up when component is removed
   */
  public onRemove(): void {
    this.tileMap = null
    this.selectedTileCoords = null
    this.hoverTileCoords = null
  }

  /**
   * Clear the hover state
   * Called by external systems to reset hover state
   */
  public clearHoverState(): void {
    // Only set hoverHasChanged if there was actually a hover state to clear
    if (this.hoverTileCoords !== null) {
      this.hoverHasChanged = true
    }
    this.hoverTileCoords = null
  }

  /**
   * Enable editing mode for this TileMap
   * Can be called to re-enable editing after disabling
   */
  public enableEditing(): void {
    this.isEditable = true
  }

  /**
   * Disable editing mode for this TileMap
   * Component remains attached but ignores interactions
   */
  public disableEditing(): void {
    this.isEditable = false
    this.selectedTileCoords = null
    this.hoverTileCoords = null
  }

  /**
   * Get the currently selected tile object
   * @returns The selected tile or null if no tile is selected
   */
  public getSelectedTile(): Tile | null {
    if (!this.tileMap || !this.selectedTileCoords) return null
    return this.tileMap.getTile(
      this.selectedTileCoords.x,
      this.selectedTileCoords.y,
    )
  }

  /**
   * Get the currently hovered tile object
   * @returns The hovered tile or null if no tile is being hovered
   */
  public getHoveredTile(): Tile | null {
    if (!this.tileMap || !this.hoverTileCoords) return null
    return this.tileMap.getTile(this.hoverTileCoords.x, this.hoverTileCoords.y)
  }
}

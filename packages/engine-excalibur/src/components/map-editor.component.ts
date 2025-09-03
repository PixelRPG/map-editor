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
   * Cleanup function to remove event listeners
   * Called when component is removed or entity is destroyed
   */
  private cleanup?: () => void

  /**
   * Initialize the component when added to a TileMap entity
   * Sets up event listeners for existing TileMap pointer events
   */
  public onAdd(owner: TileMap): void {
    this.tileMap = owner
    this.setupEventListeners()
  }

  /**
   * Clean up event listeners when component is removed
   */
  public onRemove(): void {
    if (this.cleanup) {
      this.cleanup()
      this.cleanup = undefined
    }
    this.tileMap = null
    this.selectedTileCoords = null
    this.hoverTileCoords = null
  }

  /**
   * Clear the hover state
   * Called by external systems to reset hover state
   */
  public clearHoverState(): void {
    this.hoverTileCoords = null
  }

  /**
   * Set up event listeners for TileMap pointer events
   * Uses existing TileMapEvents.PointerDown and TileMapEvents.PointerMove
   */
  private setupEventListeners(): void {
    if (!this.tileMap) return

    // Listen for pointer down events (tile selection)
    const pointerDownSubscription = this.tileMap.on('pointerdown', (event) => {
      if (!this.isEditable) return

      // Use existing TileMap.getTileByPoint() to find the clicked tile
      const tile = this.tileMap!.getTileByPoint(event.worldPos)
      if (tile) {
        // Get coordinates from the tile object itself
        const coords = { x: tile.x, y: tile.y }
        this.selectedTileCoords = coords

        // Trigger callback if provided
        this.onTileSelected?.(tile, this.selectedTileCoords)
      }
    })

    // Listen for pointer move events (hover tracking)
    const pointerMoveSubscription = this.tileMap.on('pointermove', (event) => {
      if (!this.isEditable) return

      const tile = this.tileMap!.getTileByPoint(event.worldPos)
      if (tile) {
        const coords = { x: tile.x, y: tile.y }

        // Only update if coordinates actually changed
        if (
          !this.hoverTileCoords ||
          this.hoverTileCoords.x !== coords.x ||
          this.hoverTileCoords.y !== coords.y
        ) {
          this.hoverTileCoords = coords
          this.onTileHovered?.(tile, this.hoverTileCoords)
        }
      } else {
        // Clear hover state when not over a tile
        this.hoverTileCoords = null
      }
    })

    // Set up cleanup function
    this.cleanup = () => {
      pointerDownSubscription.close()
      pointerMoveSubscription.close()
    }
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

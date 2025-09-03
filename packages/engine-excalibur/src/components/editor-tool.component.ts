import { Component } from 'excalibur'

/**
 * Tool types available in the map editor
 */
export type EditorTool = 'brush' | 'eraser' | 'fill' | null

/**
 * ECS Component that manages the current editor tool state and selections
 *
 * This component tracks the active editing tool, selected resources, and tool-specific
 * settings. It's attached to TileMap entities when in editor mode and provides
 * a centralized state management for tool operations.
 *
 * @example
 * ```typescript
 * // Set up brush tool with specific tile
 * const toolComponent = new EditorToolComponent()
 * toolComponent.currentTool = 'brush'
 * toolComponent.selectedTileId = 42
 * toolComponent.brushSize = 3
 *
 * // Attach to tilemap
 * tileMap.addComponent(toolComponent)
 * ```
 */
export interface EditorToolComponentOptions {
  defaultTool?: EditorTool
  defaultTileId?: number | null
  defaultLayerId?: string | null
  brushSize?: number
  fillTolerance?: number
}

export class EditorToolComponent extends Component {
  /**
   * The currently active editing tool
   * Determines which editing operation is performed on tile interactions
   */
  public currentTool: EditorTool = null

  /**
   * ID of the currently selected tile for painting/placement
   * Corresponds to the tile ID in the tileset
   */
  public selectedTileId: number | null = null

  /**
   * ID of the currently selected layer for editing operations
   * Determines which layer tiles are placed on or modified
   */
  public selectedLayerId: string | null = null

  /**
   * Create a new EditorToolComponent with optional default values
   * @param options Configuration options for default values
   */
  constructor(options: EditorToolComponentOptions = {}) {
    super()

    // Set default values if provided
    if (options.defaultTool !== undefined) {
      this.setTool(options.defaultTool)
    }
    if (options.defaultTileId !== undefined) {
      this.setSelectedTile(options.defaultTileId)
    }
    if (options.defaultLayerId !== undefined) {
      this.setSelectedLayer(options.defaultLayerId)
    }
    if (options.brushSize !== undefined) {
      this.brushSize = options.brushSize
    }
    if (options.fillTolerance !== undefined) {
      this.fillTolerance = options.fillTolerance
    }
  }

  /**
   * Size of the brush tool in tiles
   * Affects how many tiles are painted at once (1 = single tile, 3 = 3x3 area)
   */
  public brushSize: number = 1

  /**
   * Tolerance for fill operations (0-1)
   * Determines how similar colors must be to be included in fill operations
   * 0 = exact match only, 1 = include all similar colors
   */
  public fillTolerance: number = 0

  /**
   * Callback fired when the current tool changes
   * Allows external systems to react to tool switches
   */
  public onToolChanged?: (newTool: EditorTool, oldTool: EditorTool) => void

  /**
   * Callback fired when the selected tile changes
   * Useful for updating UI or preview systems
   */
  public onTileSelectionChanged?: (
    newTileId: number | null,
    oldTileId: number | null,
  ) => void

  /**
   * Callback fired when the selected layer changes
   * Allows updating layer-specific UI elements
   */
  public onLayerSelectionChanged?: (
    newLayerId: string | null,
    oldLayerId: string | null,
  ) => void

  /**
   * Set the current editing tool
   * @param tool The tool to activate
   */
  public setTool(tool: EditorTool): void {
    const oldTool = this.currentTool
    this.currentTool = tool

    if (oldTool !== tool) {
      this.onToolChanged?.(tool, oldTool)
    }
  }

  /**
   * Set the selected tile for painting operations
   * @param tileId The tile ID to select, or null to deselect
   */
  public setSelectedTile(tileId: number | null): void {
    const oldTileId = this.selectedTileId
    this.selectedTileId = tileId

    if (oldTileId !== tileId) {
      this.onTileSelectionChanged?.(tileId, oldTileId)
    }
  }

  /**
   * Set the selected layer for editing operations
   * @param layerId The layer ID to select, or null to deselect
   */
  public setSelectedLayer(layerId: string | null): void {
    const oldLayerId = this.selectedLayerId
    this.selectedLayerId = layerId

    if (oldLayerId !== layerId) {
      this.onLayerSelectionChanged?.(layerId, oldLayerId)
    }
  }

  /**
   * Check if a specific tool is currently active
   * @param tool The tool to check
   * @returns True if the specified tool is active
   */
  public isToolActive(tool: EditorTool): boolean {
    return this.currentTool === tool
  }

  /**
   * Check if the current tool configuration is valid for editing
   * @returns True if all required settings are configured
   */
  public isReadyForEditing(): boolean {
    // Brush and eraser need a selected layer
    if (
      (this.currentTool === 'brush' || this.currentTool === 'eraser') &&
      !this.selectedLayerId
    ) {
      return false
    }

    // Brush needs a selected tile
    if (this.currentTool === 'brush' && this.selectedTileId === null) {
      return false
    }

    return this.currentTool !== null
  }

  /**
   * Get a summary of the current tool state for debugging/UI purposes
   * @returns Object containing current tool configuration
   */
  public getToolState(): {
    tool: EditorTool
    tileId: number | null
    layerId: string | null
    brushSize: number
    fillTolerance: number
    ready: boolean
  } {
    return {
      tool: this.currentTool,
      tileId: this.selectedTileId,
      layerId: this.selectedLayerId,
      brushSize: this.brushSize,
      fillTolerance: this.fillTolerance,
      ready: this.isReadyForEditing(),
    }
  }

  /**
   * Reset all tool settings to defaults
   */
  public reset(): void {
    const oldTool = this.currentTool
    const oldTileId = this.selectedTileId
    const oldLayerId = this.selectedLayerId

    this.currentTool = null
    this.selectedTileId = null
    this.selectedLayerId = null
    this.brushSize = 1
    this.fillTolerance = 0

    // Trigger callbacks if values changed
    if (oldTool !== null) {
      this.onToolChanged?.(null, oldTool)
    }
    if (oldTileId !== null) {
      this.onTileSelectionChanged?.(null, oldTileId)
    }
    if (oldLayerId !== null) {
      this.onLayerSelectionChanged?.(null, oldLayerId)
    }
  }
}

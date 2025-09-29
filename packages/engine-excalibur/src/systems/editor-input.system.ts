import {
  Engine,
  System,
  World,
  Scene,
  SystemType,
  TileMap,
  vec,
  Tile,
} from 'excalibur'
import {
  InputEventType,
  RpcEngineType,
  InputEvent,
  isMouseMoveEvent,
  isMouseDownEvent,
  isMouseUpEvent,
  isMouseLeaveEvent,
  isMouseEnterEvent,
  isWheelEvent,
  isKeyDownEvent,
  isKeyUpEvent,
  isValidInputEvent,
} from '@pixelrpg/engine-core'
import { settings } from '../settings.ts'
import { rpcEndpointFactory } from '../lib/rpc.ts'
import { MapEditorComponent, EditorToolComponent } from '../components/index.ts'
import { EngineRpcRegistry } from '@pixelrpg/engine-core'
import { LayerManager } from '../services/index.ts'
import { EDITOR_CONSTANTS } from '../lib/constants.ts'
import { MapResource } from '@pixelrpg/data-excalibur'
import { MapScene } from '../scenes/map.scene.ts'

/**
 * Handles basic input events and coordinates with specialized handlers
 */
export class InputCoordinator {
  private isDown = false
  private dragStartPos = { x: 0, y: 0 }
  private engine?: Engine
  private tileMapInteractor?: TileMapInteractor

  /**
   * Set the engine reference
   */
  setEngine(engine: Engine): void {
    this.engine = engine
  }

  /**
   * Set the tile map interactor
   */
  setTileMapInteractor(interactor: TileMapInteractor): void {
    this.tileMapInteractor = interactor
  }

  /**
   * Handle pointer move events
   */
  onPointerMove(x: number, y: number): void {
    if (this.isDown && this.engine) {
      // Handle camera movement (drag)
      const zoom = this.engine.currentScene.camera.zoom
      const deltaX = (x - this.dragStartPos.x) / zoom
      const deltaY = (y - this.dragStartPos.y) / zoom
      this.engine.currentScene.camera.x -= deltaX
      this.engine.currentScene.camera.y -= deltaY
      this.dragStartPos = { x, y }
    } else {
      // Handle hover interactions with TileMaps
      this.tileMapInteractor?.handleInteraction(x, y, 'move')
    }
  }

  /**
   * Handle pointer down events
   */
  onPointerDown(x: number, y: number): void {
    this.isDown = true
    this.dragStartPos = { x, y }

    // Check if click was on an editor-enabled TileMap
    this.tileMapInteractor?.handleInteraction(x, y, 'down')
  }

  /**
   * Handle pointer up events
   */
  onPointerUp(): void {
    this.isDown = false
  }
}

/**
 * Handles TileMap-specific interactions and editing operations
 */
export class TileMapInteractor {
  private scene?: Scene
  private rpc = rpcEndpointFactory<EngineRpcRegistry>()

  /**
   * Set the scene reference
   */
  setScene(scene: Scene): void {
    this.scene = scene
  }

  /**
   * Handle interaction with TileMaps at screen coordinates
   */
  handleInteraction(x: number, y: number, type: 'move' | 'down' | 'up'): void {
    if (!this.scene || !this.scene.engine) return

    const worldPos = this.scene.engine.screen.screenToWorldCoordinates(
      vec(x, y),
    )

    // Find TileMap entities with MapEditorComponent
    const tileMapEntities = this.scene.world.entityManager.entities.filter(
      (entity) => entity instanceof TileMap,
    )

    for (const tileMap of tileMapEntities as TileMap[]) {
      const editorComponent = tileMap.get(MapEditorComponent)
      const toolComponent = tileMap.get(EditorToolComponent)

      if (!editorComponent?.isEditable) continue

      const tileCoords = this.getTileCoordinates(tileMap, worldPos)
      if (!tileCoords) continue

      const tile = tileMap.getTile(tileCoords.x, tileCoords.y)
      if (!tile) continue

      // Handle the interaction based on type
      this.handleTileInteraction(tileMap, tile, tileCoords, type, toolComponent)
      break // Only handle the first matching TileMap
    }
  }

  /**
   * Get tile coordinates from world position
   */
  private getTileCoordinates(
    tileMap: TileMap,
    worldPos: { x: number; y: number },
  ): { x: number; y: number } | null {
    try {
      // Convert world position to local position relative to tilemap
      const localPos = {
        x: worldPos.x - tileMap.pos.x,
        y: worldPos.y - tileMap.pos.y,
      }

      const tileX = Math.floor(localPos.x / tileMap.tileWidth)
      const tileY = Math.floor(localPos.y / tileMap.tileHeight)

      // Check bounds
      if (
        tileX >= 0 &&
        tileX < tileMap.columns &&
        tileY >= 0 &&
        tileY < tileMap.rows
      ) {
        return { x: tileX, y: tileY }
      }
      return null
    } catch (error) {
      console.warn('[TileMapInteractor] Error getting tile coordinates:', error)
      return null
    }
  }

  /**
   * Handle tile interaction based on tool and interaction type
   */
  private handleTileInteraction(
    tileMap: TileMap,
    tile: Tile,
    coords: { x: number; y: number },
    type: 'move' | 'down' | 'up',
    toolComponent?: EditorToolComponent,
  ): void {
    const tool = toolComponent?.currentTool || 'brush'
    const tileId = toolComponent?.selectedTileId
    const layerId = toolComponent?.selectedLayerId

    if (type === 'move') {
      this.handleTileHover(tileMap, tile, coords)
    } else if (type === 'down' && tool && tileId !== null && layerId) {
      this.handleTileClick(tileMap, tile, coords, tool, tileId, layerId)
    }
  }

  /**
   * Handle tile hover
   */
  private handleTileHover(
    tileMap: TileMap,
    tile: Tile,
    coords: { x: number; y: number },
  ): void {
    const editorComponent = tileMap.get(MapEditorComponent)
    if (!editorComponent) return

    // Update hover state
    editorComponent.hoverTileCoords = coords
    editorComponent.hoverHasChanged = true

    // Send hover event via RPC
    this.rpc.sendNotification(RpcEngineType.TILE_HOVERED, {
      coords,
      tileMapId: tileMap.id.toString(),
    })

    // Trigger callback if available
    editorComponent.onTileHovered?.(tile, coords)
  }

  /**
   * Handle tile click based on current tool
   */
  private handleTileClick(
    tileMap: TileMap,
    tile: Tile,
    coords: { x: number; y: number },
    tool: string,
    tileId: number,
    layerId: string,
  ): void {
    const editorComponent = tileMap.get(MapEditorComponent)
    if (!editorComponent) return

    // Update selected state
    editorComponent.selectedTileCoords = coords

    // Handle based on tool
    if (tool === 'brush') {
      this.applyBrushTool(tileMap, tile, tileId, layerId)
    } else if (tool === 'eraser') {
      this.applyEraserTool(tileMap, tile, layerId)
    }

    // Send click event via RPC
    this.rpc.sendNotification(RpcEngineType.TILE_CLICKED, {
      coords,
      tileMapId: tileMap.id.toString(),
    })

    // Trigger callback if available
    editorComponent.onTileSelected?.(tile, coords)
  }

  /**
   * Apply brush tool to tile
   */
  private applyBrushTool(
    tileMap: TileMap,
    tile: Tile,
    tileId: number,
    layerId: string,
  ): void {
    try {
      // Get map resource from scene
      const mapScene = this.scene as MapScene
      if (!mapScene?.mapResource) return

      // Add sprite to tile for the layer
      LayerManager.addSpriteToTileForLayer(
        tileMap,
        mapScene.mapResource,
        tile,
        layerId,
        tileId,
      )

      // Send tile placed event via RPC
      this.rpc.sendNotification(RpcEngineType.TILE_PLACED, {
        coords: this.getTileCoordinatesFromTile(tileMap, tile)!,
        tileId,
        layerId,
      })
    } catch (error) {
      console.error('[TileMapInteractor] Error applying brush tool:', error)
    }
  }

  /**
   * Apply eraser tool to tile
   */
  private applyEraserTool(tileMap: TileMap, tile: Tile, layerId: string): void {
    try {
      // Get map resource from scene
      const mapScene = this.scene as MapScene
      if (!mapScene?.mapResource) return

      // Remove sprites from tile for the layer
      LayerManager.removeSpritesFromTileForLayer(
        tileMap,
        mapScene.mapResource,
        tile,
        layerId,
      )
    } catch (error) {
      console.error('[TileMapInteractor] Error applying eraser tool:', error)
    }
  }

  /**
   * Get tile coordinates from tile object
   */
  private getTileCoordinatesFromTile(
    tileMap: TileMap,
    tile: Tile,
  ): { x: number; y: number } | null {
    try {
      for (let x = 0; x < tileMap.columns; x++) {
        for (let y = 0; y < tileMap.rows; y++) {
          if (tileMap.getTile(x, y) === tile) {
            return { x, y }
          }
        }
      }
      return null
    } catch (error) {
      console.warn(
        '[TileMapInteractor] Error getting coordinates from tile:',
        error,
      )
      return null
    }
  }
}

/**
 * System to handle input for the map editor
 *
 * This system coordinates input handling using specialized components:
 * - InputCoordinator: Basic input event coordination
 * - TileMapInteractor: TileMap-specific interactions
 *
 * It follows the single responsibility principle by delegating to focused classes.
 */
export class EditorInputSystem extends System {
  public systemType = SystemType.Update

  private inputCoordinator = new InputCoordinator()
  private tileMapInteractor = new TileMapInteractor()
  private rpc = rpcEndpointFactory<EngineRpcRegistry>()
  private engine?: Engine
  private scene?: Scene

  constructor() {
    super()
    this.onPointerMove = this.onPointerMove.bind(this)
    this.onPointerDown = this.onPointerDown.bind(this)
    this.onPointerUp = this.onPointerUp.bind(this)
    this.onWheel = this.onWheel.bind(this)
  }

  public update(delta: number) {
    // Update logic can be added here if needed
  }

  /**
   * Handle pointer move events
   * @param x X coordinate in screen space
   * @param y Y coordinate in screen space
   */
  protected onPointerMove(x: number, y: number) {
    this.inputCoordinator.onPointerMove(x, y)
  }

  /**
   * Handle pointer down events
   * @param x X coordinate in screen space
   * @param y Y coordinate in screen space
   */
  protected onPointerDown(x: number, y: number) {
    this.inputCoordinator.onPointerDown(x, y)
  }

  /**
   * Handle pointer up events
   */
  protected onPointerUp() {
    this.inputCoordinator.onPointerUp()
  }

  /**
   * Handle wheel events for zooming
   */
  protected onWheel(deltaY: number, position: { x: number; y: number }): void {
    if (!this.engine) return

    const direction = deltaY > 0 ? -1 : 1
    let zoom = this.engine.currentScene.camera.zoom
    zoom += direction * EDITOR_CONSTANTS.ZOOM_STEP

    // Limit minimum zoom
    if (zoom <= EDITOR_CONSTANTS.MIN_ZOOM) {
      zoom = EDITOR_CONSTANTS.MIN_ZOOM
    }

    // Round zoom to one decimal place
    zoom = Math.round(zoom * 10) / 10

    this.engine.currentScene.camera.zoom = zoom
  }

  /**
   * Initialize the system with world and scene references
   */
  public initialize(world: World, scene: Scene) {
    if (super.initialize) {
      super.initialize(world, scene)
    }

    this.engine = scene.engine
    this.scene = scene

    // Set up coordinator and interactor
    this.inputCoordinator.setEngine(this.engine)
    this.tileMapInteractor.setScene(this.scene)
    this.inputCoordinator.setTileMapInteractor(this.tileMapInteractor)

    const pointer = this.engine.input.pointers.primary

    pointer.on('down', (event) => {
      this.onPointerDown(event.screenPos.x, event.screenPos.y)
    })

    pointer.on('up', () => {
      this.onPointerUp()
    })

    pointer.on('cancel', () => {
      this.onPointerUp()
    })

    if (!settings.isWebKitView) {
      // Default browser behavior
      pointer.on('move', (event) => {
        this.onPointerMove(event.screenPos.x, event.screenPos.y)
      })
    } else {
      // Register handler for input events from GJS
      this.rpc.registerHandler(RpcEngineType.HANDLE_INPUT_EVENT, (params) => {
        if (isValidInputEvent(params)) {
          this.handleInputEvent(params)
          return { success: true }
        } else {
          console.warn('[EditorInputSystem] Not a valid input event:', params)
          return { success: false, error: 'Invalid input event format' }
        }
      })
    }

    // Handle wheel events for zooming
    pointer.on('wheel', (wheelEvent) => {
      const x = wheelEvent.x || 0
      const y = wheelEvent.y || 0

      this.onWheel(wheelEvent.deltaY, { x, y })

      // Send wheel event to GJS
      this.rpc.sendNotification(RpcEngineType.HANDLE_INPUT_EVENT, {
        type: InputEventType.WHEEL,
        data: {
          x,
          y,
          deltaY: wheelEvent.deltaY,
        },
      })
    })
  }

  /**
   * Handle input events from GJS
   */
  handleInputEvent(event: InputEvent): void {
    if (!settings.isWebKitView || !this.engine) {
      return
    }

    // Route to appropriate handler based on event type
    if (isMouseMoveEvent(event)) {
      this.onPointerMove(event.data.x, event.data.y)
    } else if (isMouseDownEvent(event)) {
      this.onPointerDown(event.data.x, event.data.y)
    } else if (isMouseUpEvent(event)) {
      this.onPointerUp()
    } else if (isMouseLeaveEvent(event)) {
      this.onPointerUp() // Treat as pointer up to cancel dragging
    } else if (isWheelEvent(event)) {
      this.onWheel(event.data.deltaY, { x: event.data.x, y: event.data.y })
    } else if (isKeyDownEvent(event) || isKeyUpEvent(event)) {
      // Key events could be used for keyboard shortcuts in the future
    } else if (!isMouseEnterEvent(event)) {
      // Mouse enter event - no specific action needed
      console.warn('[EditorInputSystem] Unhandled input event from GJS:', event)
    }
  }

  /**
   * Clean up resources when this system is removed
   */
  public onRemove(): void {
    this.rpc.destroy()
  }
}

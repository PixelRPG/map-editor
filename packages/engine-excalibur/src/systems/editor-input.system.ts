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
import { rpcEndpointFactory } from '../utils/rpc.ts'
import { MapEditorComponent, EditorToolComponent } from '../components/index.ts'
import { EngineRpcRegistry } from '@pixelrpg/engine-core'
import { SpriteUtils } from '../utils/sprite-utils.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'

/**
 * System to handle input for the map editor
 *
 * This system integrates with the existing TileMap infrastructure to provide
 * editor-specific input handling. It queries for TileMap entities with MapEditorComponent
 * and processes interactions using the existing TileMap coordinate transformation methods.
 */
export class EditorInputSystem extends System {
  private isDown = false
  private dragStartPos = { x: 0, y: 0 }

  public systemType = SystemType.Update

  private rpc = rpcEndpointFactory<EngineRpcRegistry>()
  private engine?: Engine

  /**
   * Reference to the scene for accessing entities
   */
  private scene?: Scene

  constructor() {
    super()
    this.onPointerMove = this.onPointerMove.bind(this)
    this.onPointerDown = this.onPointerDown.bind(this)
    this.onPointerUp = this.onPointerUp.bind(this)
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
      this.handleTileMapInteraction(x, y, 'move')
    }
  }

  /**
   * Handle pointer down events
   * @param x X coordinate in screen space
   * @param y Y coordinate in screen space
   */
  protected onPointerDown(x: number, y: number) {
    this.isDown = true
    this.dragStartPos = { x, y }

    // Check if click was on an editor-enabled TileMap
    this.handleTileMapInteraction(x, y, 'down')
  }

  /**
   * Handle pointer up events
   */
  protected onPointerUp() {
    this.isDown = false
  }

  /**
   * Handle wheel events for zooming
   * @param deltaY Wheel delta Y
   * @param position Mouse position
   */
  protected onWheel(deltaY: number, position: { x: number; y: number }) {
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

  public initialize(world: World, scene: Scene) {
    if (super.initialize) {
      super.initialize(world, scene)
    }

    this.engine = scene.engine
    this.scene = scene
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
        // Check if it's a valid input event
        if (isValidInputEvent(params)) {
          // We can directly use the InputEvent as is, since it matches our type
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
      // Extract position from wheelEvent
      const x = wheelEvent.x || 0
      const y = wheelEvent.y || 0

      // Handle zooming
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
   * Handle TileMap interactions using existing TileMap infrastructure
   * @param screenX X coordinate in screen space
   * @param screenY Y coordinate in screen space
   * @param interactionType Type of interaction ('down' for clicks, 'move' for hovers)
   */
  private handleTileMapInteraction(
    screenX: number,
    screenY: number,
    interactionType: 'down' | 'move',
  ): void {
    if (!this.engine || !this.scene) return

    const worldPos = this.engine.screen.screenToWorldCoordinates(
      vec(screenX, screenY),
    )
    const tileMaps = this.getEditableTileMaps()

    if (interactionType === 'down') {
      this.handleTileClick(worldPos, tileMaps)
    } else if (interactionType === 'move') {
      this.handleTileHover(worldPos, tileMaps)
    }
  }

  /**
   * Get all editable TileMaps from the scene
   */
  private getEditableTileMaps(): TileMap[] {
    return this.scene!.entities.filter(
      (entity) => entity instanceof TileMap,
    ).filter((tileMap) => {
      const mapEditorComponent = tileMap.get(MapEditorComponent)
      return mapEditorComponent?.isEditable
    }) as TileMap[]
  }

  /**
   * Handle tile click interactions
   */
  private handleTileClick(
    worldPos: { x: number; y: number },
    tileMaps: TileMap[],
  ): void {
    for (const tileMap of tileMaps) {
      const tile = tileMap.getTileByPoint(vec(worldPos.x, worldPos.y))
      if (tile) {
        const coords = { x: tile.x, y: tile.y }

        // Send TILE_CLICKED RPC event
        this.rpc.sendNotification(RpcEngineType.TILE_CLICKED, {
          coords,
          tileMapId: String(tileMap.id || 'unknown'),
        })

        // Handle tool-based tile placement
        this.handleTilePlacement(tileMap, tile, coords)
      }
    }
  }

  /**
   * Handle tile hover interactions
   */
  private handleTileHover(
    worldPos: { x: number; y: number },
    tileMaps: TileMap[],
  ): void {
    let foundHoveredTile = false

    for (const tileMap of tileMaps) {
      const tile = tileMap.getTileByPoint(vec(worldPos.x, worldPos.y))
      if (tile) {
        foundHoveredTile = true
        const coords = { x: tile.x, y: tile.y }
        this.updateHoverState(tileMap, coords)
      }
    }

    // Clear hover state if no tile was found
    if (!foundHoveredTile) {
      this.clearAllHoverStates(tileMaps)
    }
  }

  /**
   * Update hover state for a specific TileMap
   */
  private updateHoverState(
    tileMap: TileMap,
    coords: { x: number; y: number },
  ): void {
    const mapEditorComponent = tileMap.get(MapEditorComponent)
    if (!mapEditorComponent) return

    // Only update if coordinates actually changed
    if (
      !mapEditorComponent.hoverTileCoords ||
      mapEditorComponent.hoverTileCoords.x !== coords.x ||
      mapEditorComponent.hoverTileCoords.y !== coords.y
    ) {
      mapEditorComponent.hoverTileCoords = coords
      mapEditorComponent.hoverHasChanged = true
    }
  }

  /**
   * Clear hover state for all TileMaps
   */
  private clearAllHoverStates(tileMaps: TileMap[]): void {
    for (const tileMap of tileMaps) {
      const mapEditorComponent = tileMap.get(MapEditorComponent)
      if (mapEditorComponent?.hoverTileCoords !== null) {
        mapEditorComponent.clearHoverState()
      }
    }
  }

  /**
   * Handle tile placement based on current tool selection
   * @param tileMap The TileMap being edited
   * @param tile The tile that was clicked
   * @param coords The tile coordinates
   */
  private handleTilePlacement(
    tileMap: TileMap,
    tile: Tile,
    coords: { x: number; y: number },
  ): void {
    const toolComponent = tileMap.get(EditorToolComponent)
    const mapEditorComponent = tileMap.get(MapEditorComponent)

    if (!this.isValidForTilePlacement(toolComponent, mapEditorComponent)) {
      return
    }

    const { currentTool, selectedTileId } = toolComponent
    const mapResource = this.getMapResource(tileMap)
    if (!mapResource) return

    const effectiveLayerId = this.getEffectiveLayerId(
      toolComponent,
      mapResource,
    )
    if (!effectiveLayerId) return

    try {
      if (currentTool === 'brush' && selectedTileId !== null) {
        this.handleBrushTool(
          tileMap,
          tile,
          coords,
          selectedTileId,
          mapResource,
          mapEditorComponent,
        )
      } else if (currentTool === 'eraser') {
        this.handleEraserTool(
          tileMap,
          tile,
          coords,
          effectiveLayerId,
          selectedTileId,
          mapResource,
          mapEditorComponent,
        )
      }
    } catch (error) {
      console.error('[EditorInputSystem] Error handling tile placement:', error)
    }
  }

  /**
   * Validate components for tile placement
   */
  private isValidForTilePlacement(
    toolComponent: EditorToolComponent | undefined,
    mapEditorComponent: MapEditorComponent | undefined,
  ): boolean {
    return !!(
      toolComponent &&
      toolComponent.isReadyForEditing() &&
      mapEditorComponent
    )
  }

  /**
   * Get MapResource from TileMap
   */
  private getMapResource(tileMap: TileMap): any {
    const mapResource = (tileMap as any).mapResource
    if (!mapResource) {
      console.warn('[EditorInputSystem] No MapResource found on TileMap')
    }
    return mapResource
  }

  /**
   * Get effective layer ID for operations
   */
  private getEffectiveLayerId(
    toolComponent: EditorToolComponent,
    mapResource: any,
  ): string | null {
    const { selectedLayerId } = toolComponent

    if (selectedLayerId) {
      return selectedLayerId
    }

    const firstLayerId = mapResource.getFirstLayerId()
    if (!firstLayerId) {
      console.warn('[EditorInputSystem] No layers available in map')
    }
    return firstLayerId
  }

  /**
   * Handle brush tool operations
   */
  private handleBrushTool(
    tileMap: TileMap,
    tile: Tile,
    coords: { x: number; y: number },
    selectedTileId: number,
    mapResource: any,
    mapEditorComponent: MapEditorComponent,
  ): void {
    const spriteInfo = SpriteUtils.findSpriteInfoForTileId(
      mapResource,
      selectedTileId,
    )
    if (!spriteInfo) {
      console.error(
        `[EditorInputSystem] Could not find sprite info for tileId ${selectedTileId}`,
      )
      return
    }

    const spriteSetResource = mapResource.getSpriteSetResource(
      spriteInfo.spriteSetId,
    )
    if (!spriteSetResource?.sprites[spriteInfo.spriteId]) {
      console.error(
        `[EditorInputSystem] Could not get sprite ${spriteInfo.spriteId} from sprite set ${spriteInfo.spriteSetId}`,
      )
      return
    }

    const actualSprite = spriteSetResource.sprites[spriteInfo.spriteId]
    tile.addGraphic(actualSprite.clone())
    mapEditorComponent.selectedTileCoords = coords
  }

  /**
   * Handle eraser tool operations
   */
  private handleEraserTool(
    tileMap: TileMap,
    tile: Tile,
    coords: { x: number; y: number },
    layerId: string,
    selectedTileId: number | null,
    mapResource: any,
    mapEditorComponent: MapEditorComponent,
  ): void {
    mapResource.clearSpritesForTileAndLayer(tile, layerId)
    SpriteUtils.rebuildTileGraphics(tileMap, mapResource, tile)

    // Update tile properties
    const remainingSprites = mapResource.getSpritesForTileAndLayer(tile)
    tile.solid = remainingSprites.length > 0
    tile.data.set(
      'tileId',
      remainingSprites.length > 0 ? selectedTileId || 1 : 0,
    )

    mapEditorComponent.selectedTileCoords = coords
  }

  /**
   * Clean up resources when this system is removed
   */
  public onRemove(): void {
    // Cleanup the RPC client
    this.rpc.destroy()
  }

  /**
   * Handle input events from GJS
   * @param event The input event
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
}

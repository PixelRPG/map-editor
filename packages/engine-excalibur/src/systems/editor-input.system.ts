import {
  Engine,
  System,
  World,
  Scene,
  SystemType,
  TileMap,
  vec,
  Tile,
  Sprite,
  Canvas,
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
    zoom += direction * 0.2

    // Limit minimum zoom
    if (zoom <= 0.1) {
      zoom = 0.1
    }

    // Round zoom to one decimal place
    zoom = Math.round(zoom * 10) / 10

    this.engine.currentScene.camera.zoom = zoom
    console.debug('[EditorInputSystem] Wheel zoom to', zoom)
  }

  public initialize(world: World, scene: Scene) {
    console.debug('[EditorInputSystem] Initializing')
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
      console.debug(
        '[EditorInputSystem] Setting up pointer move event listener for default browser behavior',
      )
      // Default browser behavior
      pointer.on('move', (event) => {
        this.onPointerMove(event.screenPos.x, event.screenPos.y)
      })
    } else {
      console.debug(
        '[EditorInputSystem] Setting up RPC client for GJS input events',
      )

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

    // Convert screen coordinates to world coordinates
    const worldPos = this.engine.screen.screenToWorldCoordinates(
      vec(screenX, screenY),
    )

    // Get all entities from the scene and filter for TileMaps with MapEditorComponent
    const tileMaps = this.scene.entities.filter(
      (entity) => entity instanceof TileMap,
    ) as TileMap[]

    let foundHoveredTile = false

    for (const tileMap of tileMaps) {
      // Check if this TileMap has MapEditorComponent
      const mapEditorComponent = tileMap.get(MapEditorComponent)

      // Skip if no MapEditorComponent or editing is disabled
      if (!mapEditorComponent?.isEditable) continue

      // Use existing TileMap.getTileByPoint() to find the tile at the position
      const tile = tileMap.getTileByPoint(worldPos)

      if (tile) {
        // Get coordinates from tile object
        const coords = { x: tile.x, y: tile.y }

        if (interactionType === 'down') {
          // Send TILE_CLICKED RPC event
          this.rpc.sendNotification(RpcEngineType.TILE_CLICKED, {
            coords,
            tileMapId: String(tileMap.id || 'unknown'),
          })

          // Handle tool-based tile placement if EditorToolComponent is present
          this.handleTilePlacement(tileMap, tile, coords)
        } else if (interactionType === 'move') {
          foundHoveredTile = true

          // Only update hover state if coordinates actually changed
          if (
            !mapEditorComponent.hoverTileCoords ||
            mapEditorComponent.hoverTileCoords.x !== coords.x ||
            mapEditorComponent.hoverTileCoords.y !== coords.y
          ) {
            mapEditorComponent.hoverTileCoords = coords
            mapEditorComponent.hoverHasChanged = true
          } else {
            continue
          }
        }
      }
    }

    // If we're moving and no tile was found, clear hover state
    if (interactionType === 'move' && !foundHoveredTile) {
      // Clear hover state for all TileMaps that currently have hover state
      for (const tileMap of tileMaps) {
        const mapEditorComponent = tileMap.get(MapEditorComponent)
        if (
          mapEditorComponent?.isEditable &&
          mapEditorComponent.hoverTileCoords !== null
        ) {
          // Clear the hover state using the component method
          // This will set hoverHasChanged = true and hoverTileCoords = null
          mapEditorComponent.clearHoverState()
        }
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

    if (
      !toolComponent ||
      !toolComponent.isReadyForEditing() ||
      !mapEditorComponent
    )
      return

    const { currentTool, selectedTileId, selectedLayerId } = toolComponent

    console.log(
      `[EditorInputSystem] Tool state: tool=${currentTool}, tileId=${selectedTileId}, layerId=${selectedLayerId}`,
    )

    // Use default layer if not specified
    const effectiveLayerId = selectedLayerId || 'default'
    console.log(`[EditorInputSystem] Using layer: ${effectiveLayerId}`)

    if (currentTool === 'brush' && selectedTileId !== null) {
      console.log(
        `[EditorInputSystem] Brush tool: placing tile ${selectedTileId} at (${coords.x}, ${coords.y})`,
      )

      // Clear existing graphics
      tile.clearGraphics()

      // Try to get sprite from sprite sheet
      const sprite = this.getSpriteForTile(tileMap, selectedTileId)

      if (sprite) {
        // Use actual sprite from sprite sheet
        tile.addGraphic(sprite.clone())
      } else {
        // Fallback: create a simple colored rectangle
        console.warn(
          `[EditorInputSystem] Could not find sprite for tileId ${selectedTileId}, using fallback`,
        )
        const tileWidth = tileMap.tileWidth
        const tileHeight = tileMap.tileHeight

        // Create a simple colored rectangle based on tileId
        const colorIndex = selectedTileId % 8
        const colors = [
          '#FF0000',
          '#00FF00',
          '#0000FF',
          '#FFFF00',
          '#FF00FF',
          '#00FFFF',
          '#800080',
          '#FFA500',
        ]

        // Create a simple colored graphic for testing using Excalibur Canvas
        const exCanvas = new Canvas({
          width: tileWidth,
          height: tileHeight,
          draw: (ctx: CanvasRenderingContext2D) => {
            ctx.fillStyle = colors[colorIndex]
            ctx.fillRect(0, 0, tileWidth, tileHeight)

            // Add border for visibility
            ctx.strokeStyle = '#000000'
            ctx.lineWidth = 1
            ctx.strokeRect(0, 0, tileWidth, tileHeight)
          },
        })

        // Use Canvas directly as graphic (Canvas extends Graphic)
        tile.addGraphic(exCanvas)
      }

      // Update tile properties
      tile.solid = selectedTileId > 0
      tile.data.set('tileId', selectedTileId)

      // Set selectedTileCoords so TileInteractionSystem can handle the placement
      mapEditorComponent.selectedTileCoords = coords
    }
  }

  /**
   * Get a sprite for the given tile ID from the TileMap's sprite sheets
   * @param tileMap The TileMap to get sprite from
   * @param tileId The tile ID to look for
   * @returns The sprite if found, null otherwise
   */
  private getSpriteForTile(tileMap: TileMap, tileId: number): Sprite | null {
    try {
      // Try to access the MapResource stored on the TileMap
      const mapResource = (tileMap as any).mapResource
      if (!mapResource) {
        console.warn('[EditorInputSystem] No MapResource found on TileMap')
        return null
      }

      // Get all sprite set resources
      const spriteSetResources = mapResource.getAllSpriteSetResources()

      // Try to find the sprite in any of the sprite sets
      for (const [spriteSetId, spriteSetResource] of spriteSetResources) {
        if (spriteSetResource.sprites && spriteSetResource.sprites[tileId]) {
          console.debug(
            `[EditorInputSystem] Found sprite ${tileId} in sprite set ${spriteSetId}`,
          )
          return spriteSetResource.sprites[tileId]
        }
      }

      console.warn(
        `[EditorInputSystem] Sprite ${tileId} not found in any sprite set`,
      )
      return null
    } catch (error) {
      console.error('[EditorInputSystem] Error getting sprite for tile:', error)
      return null
    }
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
    // First use type guards to determine the event type for better type safety
    if (isMouseMoveEvent(event)) {
      // Handle mouse move with proper typing
      // console.log('Mouse move event from GJS:', event.data);
      // If in webkit view, manually update the pointer position
      if (settings.isWebKitView && this.engine) {
        // Simulate a pointer move in Excalibur
        const pointer = this.engine.input.pointers.primary

        // Update the pointer position - Excalibur handles pointer positions differently
        // Handle the movement in our system instead of trying to update internal state
        this.onPointerMove(event.data.x, event.data.y)
      }
    } else if (isMouseDownEvent(event)) {
      // Handle mouse down with proper typing
      console.log('Mouse down event from GJS:', event.data)
      if (settings.isWebKitView && this.engine) {
        this.onPointerDown(event.data.x, event.data.y)
      }
    } else if (isMouseUpEvent(event)) {
      // Handle mouse up with proper typing
      console.log('Mouse up event from GJS:', event.data)
      if (settings.isWebKitView && this.engine) {
        this.onPointerUp()
      }
    } else if (isMouseLeaveEvent(event)) {
      // Handle mouse leave with proper typing
      console.log('Mouse leave event from GJS')
      if (settings.isWebKitView && this.engine) {
        // Handle mouse leaving the canvas
        this.onPointerUp() // treat as pointer up to cancel any dragging
      }
    } else if (isMouseEnterEvent(event)) {
      // Handle mouse enter with proper typing
      console.log('Mouse enter event from GJS:', event.data)
    } else if (isWheelEvent(event)) {
      // Handle wheel with proper typing
      console.log('Wheel event from GJS:', event.data)
      if (settings.isWebKitView && this.engine) {
        this.onWheel(event.data.deltaY, { x: event.data.x, y: event.data.y })
      }
    } else if (isKeyDownEvent(event)) {
      // Handle key down with proper typing
      console.log('Key down event from GJS:', event.data)
    } else if (isKeyUpEvent(event)) {
      // Handle key up with proper typing
      console.log('Key up event from GJS:', event.data)
    } else {
      // Fallback for unknown event types
      console.log('Unhandled input event from GJS:', event)
    }
  }
}

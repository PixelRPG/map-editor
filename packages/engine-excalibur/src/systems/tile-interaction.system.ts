import { System, World, Scene, SystemType, Query, Entity } from 'excalibur'
import { MapEditorComponent, EditorToolComponent } from '../components/index.ts'
import { RpcEngineType } from '@pixelrpg/engine-core'
import { rpcEndpointFactory } from '../utils/rpc.ts'

/**
 * ECS system that handles tile-based interactions
 *
 * This system processes click and hover events on entities with MapEditorComponent.
 * It uses Excalibur's Query system to efficiently find interactive entities and routes
 * interactions to the appropriate editing tools.
 */
export class TileInteractionSystem extends System {
  public readonly systemType = SystemType.Update
  public readonly priority = 11 // Run after MapEditorSystem

  private rpc = rpcEndpointFactory()
  private world: World

  /**
   * Query for entities with MapEditorComponent
   */
  private interactiveEntitiesQuery: Query<typeof MapEditorComponent>

  constructor() {
    super()
  }

  /**
   * Initialize the system with world and scene references
   */
  public initialize(world: World, scene: Scene): void {
    console.debug(
      '[TileInteractionSystem] Initializing tile interaction system',
    )

    if (super.initialize) {
      super.initialize(world, scene)
    }

    this.world = world

    // Initialize query after world is available
    this.interactiveEntitiesQuery = this.world.query([MapEditorComponent])
  }

  /**
   * Main update loop for processing interactions
   */
  public update(elapsed: number): void {
    // Get all entities with MapEditorComponent
    const interactiveEntities = this.interactiveEntitiesQuery.entities

    for (const entity of interactiveEntities) {
      const editorComponent = entity.get(MapEditorComponent)
      const toolComponent = entity.get(EditorToolComponent)

      if (!editorComponent?.isEditable) continue

      // Process hover interactions
      if (editorComponent.hoverTileCoords) {
        this.handleTileHover(entity, editorComponent.hoverTileCoords)
      }

      // Process selection interactions
      if (editorComponent.selectedTileCoords) {
        this.handleTileClick(
          entity,
          editorComponent.selectedTileCoords,
          toolComponent,
        )
      }
    }
  }

  /**
   * Handle tile click interactions based on current tool
   */
  private handleTileClick(
    entity: Entity,
    coords: { x: number; y: number },
    toolComponent?: EditorToolComponent,
  ): void {
    if (!toolComponent?.isReadyForEditing()) return

    const { currentTool, selectedTileId, selectedLayerId } = toolComponent

    if (!selectedLayerId) return

    if (currentTool === 'brush' && selectedTileId !== null) {
      console.log(
        `[TileInteractionSystem] Placing tile ${selectedTileId} at (${coords.x}, ${coords.y}) on layer ${selectedLayerId}`,
      )
      this.rpc.sendNotification(RpcEngineType.TILE_PLACED, {
        coords,
        tileId: selectedTileId,
        layerId: selectedLayerId,
      })
    } else if (currentTool === 'eraser') {
      console.log(
        `[TileInteractionSystem] Erasing tile at (${coords.x}, ${coords.y}) on layer ${selectedLayerId}`,
      )
      this.rpc.sendNotification(RpcEngineType.TILE_PLACED, {
        coords,
        tileId: 0,
        layerId: selectedLayerId,
      })
    }

    // Clear selected tile coords after processing
    const editorComponent = entity.get(MapEditorComponent)
    if (editorComponent) {
      editorComponent.selectedTileCoords = null
    }
  }

  /**
   * Handle tile hover interactions
   */
  private handleTileHover(
    entity: Entity,
    coords: { x: number; y: number },
  ): void {
    // Send TILE_HOVERED RPC event
    this.rpc.sendNotification(RpcEngineType.TILE_HOVERED, {
      coords,
      tileMapId: entity.id || 'unknown',
    })
  }

  /**
   * Clean up resources when the system is removed
   */
  public onRemove(): void {
    console.debug('[TileInteractionSystem] Cleaning up interaction system')
    this.rpc.destroy()
  }
}

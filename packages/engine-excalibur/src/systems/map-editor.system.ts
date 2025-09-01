import {
  System,
  World,
  Scene,
  SystemType,
  Query,
  Entity,
  ComponentCtor,
  Component,
} from 'excalibur'
import { MapEditorComponent, EditorToolComponent } from '../components/index.ts'
import { RpcEngineType } from '@pixelrpg/engine-core'
import { rpcEndpointFactory } from '../utils/rpc.ts'

/**
 * Interface for editor state change RPC parameters
 */
interface EditorStateChangeParams {
  tool?: string
  tileId?: number
  layerId?: string
  [key: string]: unknown
}

/**
 * Central ECS system that coordinates all map editing functionality
 *
 * This system acts as the main orchestrator between entities, tools, and RPC communication.
 * It uses Excalibur's Query system to efficiently find and process only entities with
 * the required editor components. The system runs continuously but only processes
 * entities that have MapEditorComponent attached.
 *
 * @example
 * ```typescript
 * // System runs continuously and automatically processes editor-enabled entities
 * scene.world.add(new MapEditorSystem())
 *
 * // To enable editing on a TileMap, simply add the component:
 * tileMap.addComponent(new MapEditorComponent())
 * tileMap.addComponent(new EditorToolComponent())
 * ```
 */
export class MapEditorSystem extends System {
  public readonly systemType = SystemType.Update
  public readonly priority = 10 // Run after input systems but before rendering

  private rpc = rpcEndpointFactory()
  private world: World

  /**
   * Query for entities with complete editor setup (MapEditorComponent + EditorToolComponent)
   */
  private editableEntitiesQuery: Query<ComponentCtor<Component>>

  /**
   * Query for entities with MapEditorComponent only
   */
  private editorEntitiesQuery: Query<ComponentCtor<Component>>

  constructor() {
    super()
  }

  /**
   * Initialize the system with world and scene references
   */
  public initialize(world: World, scene: Scene): void {
    console.debug('[MapEditorSystem] Initializing editor coordination system')

    if (super.initialize) {
      super.initialize(world, scene)
    }

    this.world = world

    // Initialize queries after world is available
    this.editableEntitiesQuery = this.world.query([
      MapEditorComponent,
      EditorToolComponent,
    ])
    this.editorEntitiesQuery = this.world.query([MapEditorComponent])

    // Set up RPC handlers for editor state synchronization
    this.setupRpcHandlers()
  }

  /**
   * Main update loop for editor coordination
   * Uses queries to efficiently find and process only editor-enabled entities
   */
  public update(elapsed: number): void {
    // Get all entities with MapEditorComponent (basic editor functionality)
    const editorEntities = this.editorEntitiesQuery.entities

    // Get all entities with complete editor setup
    const editableEntities = this.editableEntitiesQuery.entities

    // Only process if we have editor entities
    if (editorEntities.length > 0) {
      // Synchronize editor state for editable entities
      this.synchronizeEditorState(editableEntities)
    }
  }

  /**
   * Set up RPC handlers for bidirectional communication with GJS host
   */
  private setupRpcHandlers(): void {
    this.rpc.registerHandler(
      RpcEngineType.EDITOR_STATE_CHANGED,
      (params: unknown) => {
        this.handleEditorStateChange(params as EditorStateChangeParams)
        return { success: true }
      },
    )

    console.debug('[MapEditorSystem] RPC handlers registered')
  }

  /**
   * Synchronize editor state between components and host
   */
  private synchronizeEditorState(editableEntities: Entity[]): void {
    for (const entity of editableEntities) {
      const editorComponent = entity.get(MapEditorComponent)
      const toolComponent = entity.get(EditorToolComponent)

      if (!editorComponent || !toolComponent) continue

      // Synchronize hover state
      if (editorComponent.hoverTileCoords) {
        this.notifyHostOfStateChange('hover', {
          coords: editorComponent.hoverTileCoords,
          entityId: String(entity.id || 'unknown'),
        })
      }

      // Synchronize selection state
      if (editorComponent.selectedTileCoords) {
        this.notifyHostOfStateChange('selection', {
          coords: editorComponent.selectedTileCoords,
          entityId: String(entity.id || 'unknown'),
        })
      }
    }
  }

  /**
   * Handle editor state changes from the host
   */
  private handleEditorStateChange(params: EditorStateChangeParams): void {
    console.debug('[MapEditorSystem] Received editor state change:', params)

    const editableEntities = this.editableEntitiesQuery.entities

    for (const entity of editableEntities) {
      const toolComponent = entity.get(EditorToolComponent)

      if (
        toolComponent &&
        params.tool &&
        params.tileId !== undefined &&
        params.layerId
      ) {
        // Update tool state based on host parameters
        if (params.tool !== toolComponent.currentTool) {
          toolComponent.setTool(
            params.tool as 'brush' | 'eraser' | 'fill' | null,
          )
        }

        if (params.tileId !== toolComponent.selectedTileId) {
          toolComponent.setSelectedTile(params.tileId)
        }

        if (params.layerId !== toolComponent.selectedLayerId) {
          toolComponent.setSelectedLayer(params.layerId)
        }
      }
    }
  }

  /**
   * Notify the host of editor state changes
   */
  private notifyHostOfStateChange(
    type: 'hover' | 'selection',
    data: { coords: { x: number; y: number }; entityId: string },
  ): void {
    console.debug(`[MapEditorSystem] Notifying host of ${type} change:`, data)
  }

  /**
   * Clean up resources when the system is removed
   */
  public onRemove(): void {
    console.debug('[MapEditorSystem] Cleaning up editor system')
    this.rpc.destroy()
  }
}

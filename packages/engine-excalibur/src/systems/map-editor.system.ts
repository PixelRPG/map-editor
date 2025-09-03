import {
  System,
  World,
  Scene,
  SystemType,
  Query,
  Entity,
  ComponentCtor,
  Component,
  TileMap,
} from 'excalibur'
import { MapEditorComponent, EditorToolComponent } from '../components/index.ts'
import { RpcEngineType, EngineRpcRegistry } from '@pixelrpg/engine-core'
import { rpcEndpointFactory } from '../utils/rpc.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'

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
  public readonly priority = EDITOR_CONSTANTS.EDITOR_SYSTEM_PRIORITY // Run after input systems but before rendering

  private rpc = rpcEndpointFactory<EngineRpcRegistry>()
  private world: World
  private scene: Scene

  /**
   * Query for entities with complete editor setup (MapEditorComponent + EditorToolComponent)
   */
  private editableEntitiesQuery: Query<ComponentCtor<Component>>

  /**
   * Query for entities with MapEditorComponent only
   */
  private editorEntitiesQuery: Query<ComponentCtor<Component>>

  /**
   * Cache for last sent coordinates to avoid sending duplicates
   * Key: entityId, Value: { hover: coords, selection: coords }
   */
  private lastSentCoords: Map<string, {
    hover?: { x: number; y: number }
    selection?: { x: number; y: number }
  }> = new Map()

  constructor() {
    super()
  }

  /**
   * Initialize the system with world and scene references
   */
  public initialize(world: World, scene: Scene): void {
    if (super.initialize) {
      super.initialize(world, scene)
    }

    this.world = world
    this.scene = scene

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
    console.log('[MapEditorSystem] 🚀 Setting up RPC handlers...')

    this.rpc.registerHandler(
      RpcEngineType.EDITOR_STATE_CHANGED,
      (params: unknown) => {
        console.log(
          '[MapEditorSystem] 📨 RPC handler called with params:',
          params,
        )
        this.handleEditorStateChange(params as EditorStateChangeParams)
        return { success: true }
      },
    )
  }

  /**
   * Synchronize editor state between components and host
   */
  private synchronizeEditorState(editableEntities: Entity[]): void {
    for (const entity of editableEntities) {
      const editorComponent = entity.get(MapEditorComponent)
      const toolComponent = entity.get(EditorToolComponent)

      if (!editorComponent || !toolComponent) continue

      const entityId = String(entity.id || 'unknown')

      // Get or create cache entry for this entity
      let entityCache = this.lastSentCoords.get(entityId)
      if (!entityCache) {
        entityCache = {}
        this.lastSentCoords.set(entityId, entityCache)
      }

      // Synchronize hover state - only send if coordinates changed
      if (editorComponent.hoverTileCoords) {
        const coordsChanged =
          !entityCache.hover ||
          entityCache.hover.x !== editorComponent.hoverTileCoords.x ||
          entityCache.hover.y !== editorComponent.hoverTileCoords.y

        if (coordsChanged) {
          entityCache.hover = { ...editorComponent.hoverTileCoords }
          this.notifyHostOfStateChange('hover', {
            coords: editorComponent.hoverTileCoords,
            entityId: entityId,
          })
        }
      } else {
        // Clear hover state if no coordinates
        if (entityCache.hover) {
          delete entityCache.hover
        }
      }

      // Synchronize selection state - only send if coordinates changed
      if (editorComponent.selectedTileCoords) {
        const coordsChanged =
          !entityCache.selection ||
          entityCache.selection.x !== editorComponent.selectedTileCoords.x ||
          entityCache.selection.y !== editorComponent.selectedTileCoords.y

        if (coordsChanged) {
          entityCache.selection = { ...editorComponent.selectedTileCoords }
          this.notifyHostOfStateChange('selection', {
            coords: editorComponent.selectedTileCoords,
            entityId: entityId,
          })
        }
      } else {
        // Clear selection state if no coordinates
        if (entityCache.selection) {
          delete entityCache.selection
        }
      }

      // Clean up empty cache entries
      if (!entityCache.hover && !entityCache.selection) {
        this.lastSentCoords.delete(entityId)
      }
    }
  }

  /**
   * Handle editor state changes from the host
   */
  private handleEditorStateChange(params: EditorStateChangeParams): void {
    const editableEntities = this.editableEntitiesQuery.entities

    for (const entity of editableEntities) {
      const toolComponent = entity.get(EditorToolComponent)

      if (toolComponent && params.tileId !== undefined) {
        // Update tool state based on host parameters
        if (params.tool !== toolComponent.currentTool) {
          toolComponent.setTool(
            params.tool as 'brush' | 'eraser' | 'fill' | null,
          )
        }

        if (params.tileId !== toolComponent.selectedTileId) {
          toolComponent.setSelectedTile(params.tileId)
        }

        // Use first available layer if not specified
        let layerId = params.layerId
        if (!layerId) {
          // Try to get the first available layer from any TileMap
          const tileMaps = this.scene?.world.entities.filter(
            (entity) => entity instanceof TileMap,
          ) as TileMap[]
          if (tileMaps && tileMaps.length > 0) {
            const mapResource = (tileMaps[0] as any).mapResource
            if (mapResource) {
              layerId = mapResource.getFirstLayerId() || 'default'
            }
          }
          layerId = layerId || EDITOR_CONSTANTS.DEFAULT_LAYER_NAME
        }
        if (layerId !== toolComponent.selectedLayerId) {
          console.log(
            `[MapEditorSystem] 🔄 Updating layerId: ${toolComponent.selectedLayerId} → ${layerId}`,
          )
          toolComponent.setSelectedLayer(layerId)
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
    // Send RPC notification to host
    if (type === 'hover') {
      this.rpc.sendNotification(RpcEngineType.TILE_HOVERED, {
        coords: data.coords,
        tileMapId: data.entityId,
      })
    } else if (type === 'selection') {
      this.rpc.sendNotification(RpcEngineType.TILE_CLICKED, {
        coords: data.coords,
        tileMapId: data.entityId,
      })
    }
  }

  /**
   * Clean up resources when the system is removed
   */
  public onRemove(): void {
    // Clear coordinate cache
    this.lastSentCoords.clear()

    // Destroy RPC client
    this.rpc.destroy()
  }
}

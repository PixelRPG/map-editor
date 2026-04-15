import { System, World, Scene, SystemType, Query, Entity } from 'excalibur'
import {
  EngineEvent,
  EngineEventMap,
  TypedEventEmitter,
} from '@pixelrpg/engine-core'
import { MapEditorComponent, EditorToolComponent } from '../components/index.ts'

/**
 * ECS system that emits tile-click/hover events for entities with MapEditorComponent.
 *
 * Emits events directly via the engine's TypedEventEmitter (no RPC).
 */
export class TileInteractionSystem extends System {
  public readonly systemType = SystemType.Update
  public readonly priority = 11

  private world!: World
  private interactiveEntitiesQuery!: Query<typeof MapEditorComponent>

  constructor(private readonly events: TypedEventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) {
      super.initialize(world, scene)
    }

    this.world = world
    this.interactiveEntitiesQuery = this.world.query([MapEditorComponent])
  }

  public update(_elapsed: number): void {
    const interactiveEntities = this.interactiveEntitiesQuery.entities

    for (const entity of interactiveEntities) {
      const editorComponent = entity.get(MapEditorComponent)
      const toolComponent = entity.get(EditorToolComponent)

      if (!editorComponent?.isEditable) continue

      if (editorComponent.hoverHasChanged) {
        this.handleTileHover(entity, editorComponent.hoverTileCoords)
        editorComponent.hoverHasChanged = false
      }

      if (editorComponent.selectedTileCoords) {
        this.handleTileClick(
          entity,
          editorComponent.selectedTileCoords,
          toolComponent,
        )
      }
    }
  }

  private handleTileClick(
    entity: Entity,
    coords: { x: number; y: number },
    toolComponent?: EditorToolComponent,
  ): void {
    if (!toolComponent?.isReadyForEditing()) return

    const { currentTool, selectedTileId, selectedLayerId } = toolComponent
    if (!selectedLayerId) return

    if (currentTool === 'brush' && selectedTileId !== null) {
      this.events.emit(EngineEvent.TILE_PLACED, {
        coords,
        tileId: selectedTileId,
        layerId: selectedLayerId,
      })
    } else if (currentTool === 'eraser') {
      this.events.emit(EngineEvent.TILE_PLACED, {
        coords,
        tileId: 0,
        layerId: selectedLayerId,
      })
    }

    const editorComponent = entity.get(MapEditorComponent)
    if (editorComponent) {
      editorComponent.selectedTileCoords = null
    }
  }

  private handleTileHover(
    entity: Entity,
    coords: { x: number; y: number } | null,
  ): void {
    this.events.emit(EngineEvent.TILE_HOVERED, {
      coords,
      tileMapId: String(entity.id || 'unknown'),
    })
  }
}

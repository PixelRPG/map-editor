import { System, World, Scene, SystemType, Query, Entity } from 'excalibur'
import {
  EditorState,
  EngineEvent,
  EngineEventMap,
} from '../types/index.ts'
import { TypedEventEmitter } from '../utils/index.ts'
import { MapEditorComponent } from '../components/index.ts'

/**
 * ECS system that emits tile-click/hover events for entities with MapEditorComponent.
 *
 * Reads the active editor tool/tile/layer directly from the engine-held
 * EditorState (previously mirrored into an EditorToolComponent by
 * MapEditorSystem — both are now gone). Emits events via the engine's
 * TypedEventEmitter; no RPC.
 */
export class TileInteractionSystem extends System {
  public readonly systemType = SystemType.Update
  public readonly priority = 11

  private world!: World
  private interactiveEntitiesQuery!: Query<typeof MapEditorComponent>

  constructor(
    private readonly events: TypedEventEmitter<EngineEventMap>,
    private readonly getEditorState: () => EditorState,
  ) {
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
    const state = this.getEditorState()

    for (const entity of interactiveEntities) {
      const editorComponent = entity.get(MapEditorComponent)

      if (!editorComponent?.isEditable) continue

      if (editorComponent.hoverHasChanged) {
        this.handleTileHover(entity, editorComponent.hoverTileCoords)
        editorComponent.hoverHasChanged = false
      }

      if (editorComponent.selectedTileCoords) {
        this.handleTileClick(entity, editorComponent.selectedTileCoords, state)
      }
    }
  }

  private handleTileClick(
    entity: Entity,
    coords: { x: number; y: number },
    state: EditorState,
  ): void {
    const { tool, tileId, layerId } = state
    if (!layerId || !tool) return

    if (tool === 'brush' && tileId !== null) {
      this.events.emit(EngineEvent.TILE_PLACED, {
        coords,
        tileId,
        layerId,
      })
    } else if (tool === 'eraser') {
      this.events.emit(EngineEvent.TILE_PLACED, {
        coords,
        tileId: 0,
        layerId,
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

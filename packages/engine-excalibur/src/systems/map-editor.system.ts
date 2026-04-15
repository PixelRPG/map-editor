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
import { EditorState } from '@pixelrpg/engine-core'
import { MapEditorComponent, EditorToolComponent } from '../components/index.ts'
import { EDITOR_CONSTANTS } from '../lib/constants.ts'

/**
 * ECS system that pushes the engine-held editor state (tool/tile/layer) down to
 * every editable TileMap's EditorToolComponent each frame. In-process, so no RPC.
 */
export class MapEditorSystem extends System {
  public readonly systemType = SystemType.Update
  public readonly priority = EDITOR_CONSTANTS.EDITOR_SYSTEM_PRIORITY

  private world!: World
  private scene!: Scene

  private editableEntitiesQuery!: Query<ComponentCtor<Component>>

  constructor(private readonly getEditorState: () => EditorState) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) {
      super.initialize(world, scene)
    }

    this.world = world
    this.scene = scene

    this.editableEntitiesQuery = this.world.query([
      MapEditorComponent,
      EditorToolComponent,
    ])
  }

  public update(_elapsed: number): void {
    const editorState = this.getEditorState()
    const editableEntities = this.editableEntitiesQuery.entities

    for (const entity of editableEntities) {
      this.applyStateToEntity(entity, editorState)
    }
  }

  private applyStateToEntity(entity: Entity, state: EditorState): void {
    const toolComponent = entity.get(EditorToolComponent)
    if (!toolComponent) return

    if (state.tool !== toolComponent.currentTool) {
      toolComponent.setTool(state.tool)
    }

    if (state.tileId !== null && state.tileId !== toolComponent.selectedTileId) {
      toolComponent.setSelectedTile(state.tileId)
    }

    let layerId = state.layerId
    if (!layerId) {
      const tileMaps = this.scene?.world.entities.filter(
        (e) => e instanceof TileMap,
      ) as TileMap[] | undefined
      if (tileMaps && tileMaps.length > 0) {
        const mapResource = (tileMaps[0] as any).mapResource
        if (mapResource) {
          layerId = mapResource.getFirstLayerId() || EDITOR_CONSTANTS.DEFAULT_LAYER_NAME
        }
      }
      layerId = layerId || EDITOR_CONSTANTS.DEFAULT_LAYER_NAME
    }

    if (layerId !== toolComponent.selectedLayerId) {
      toolComponent.setSelectedLayer(layerId)
    }
  }
}

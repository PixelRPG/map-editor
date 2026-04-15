import { Entity, Logger, Scene, TileMap } from 'excalibur'
import { MapResource } from '@pixelrpg/data-excalibur'
import {
  EditorState,
  EngineEventMap,
  TypedEventEmitter,
} from '@pixelrpg/engine-core'
import { MapEditorComponent, EditorToolComponent } from '../components/index.ts'

import {
  EditorInputSystem,
  MapEditorSystem,
  TileInteractionSystem,
} from '../systems/index.ts'

export class MapScene extends Scene {
  private logger = Logger.getInstance()

  constructor(
    public readonly mapResource: MapResource,
    events: TypedEventEmitter<EngineEventMap>,
    getEditorState: () => EditorState,
  ) {
    super()
    this.world.add(new EditorInputSystem(events))
    this.world.add(new MapEditorSystem(getEditorState))
    this.world.add(new TileInteractionSystem(events))

    mapResource.addToScene(this)
    this.addEditorComponentsToTileMaps(this)
  }

  /**
   * Add editor components to all TileMap entities for editing functionality
   */
  private addEditorComponentsToTileMaps(scene: Scene): void {
    // Get all entities in the scene
    const entities = scene.world.entities
    let tileMapCount = 0

    for (const entity of entities) {
      // Check if this entity is a TileMap
      if (this.isTileMap(entity)) {
        this.logger.debug(
          `Adding editor components to TileMap entity: ${entity.id}`,
        )

        // Add the editor components
        entity.addComponent(new MapEditorComponent())

        // Initialize EditorToolComponent with default values
        const toolComponent = new EditorToolComponent({
          defaultTool: 'brush', // Default to brush tool
          defaultTileId: 1, // Default to first tile
          defaultLayerId: null, // No default layer - must be selected by user
        })
        entity.addComponent(toolComponent)

        tileMapCount++
        this.logger.debug('Editor components added successfully')
      }
    }

    this.logger.info(
      `Added editor components to ${tileMapCount} TileMap entities`,
    )
  }

  /**
   * Check if an entity is a TileMap
   */
  private isTileMap(entity: Entity): boolean {
    // Check if the entity is an instance of TileMap
    return entity instanceof TileMap
  }
}

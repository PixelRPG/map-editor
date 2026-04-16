import { Entity, Logger, Scene, TileMap } from 'excalibur'
import { MapResource } from '@pixelrpg/data'
import { EditorState, EngineEventMap } from '../types/index.ts'
import { TypedEventEmitter } from '../utils/index.ts'
import { MapEditorComponent } from '../components/index.ts'

import {
  EditorInputSystem,
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
    this.world.add(new EditorInputSystem(events, getEditorState))
    this.world.add(new TileInteractionSystem(events, getEditorState))

    mapResource.addToScene(this)
    this.addEditorComponentsToTileMaps(this)
  }

  /**
   * Add editor components to all TileMap entities for editing functionality
   */
  private addEditorComponentsToTileMaps(scene: Scene): void {
    const entities = scene.world.entities
    let tileMapCount = 0

    for (const entity of entities) {
      if (this.isTileMap(entity)) {
        this.logger.debug(
          `Adding editor components to TileMap entity: ${entity.id}`,
        )
        entity.addComponent(new MapEditorComponent())
        tileMapCount++
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
    return entity instanceof TileMap
  }
}

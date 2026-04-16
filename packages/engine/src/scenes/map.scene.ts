import { EventEmitter, Logger, Scene } from 'excalibur'
import { MapResource } from '../resource/MapResource.ts'
import { EditorState, EngineEventMap } from '../types/index.ts'

import {
  EditorInputSystem,
  TileInteractionSystem,
} from '../systems/index.ts'

export class MapScene extends Scene {
  private logger = Logger.getInstance()

  constructor(
    public readonly mapResource: MapResource,
    events: EventEmitter<EngineEventMap>,
    getEditorState: () => EditorState,
  ) {
    super()
    this.world.add(new EditorInputSystem(events, getEditorState))
    this.world.add(new TileInteractionSystem(events, getEditorState))

    mapResource.addToScene(this)
    this.logger.debug('MapScene initialized')
  }
}

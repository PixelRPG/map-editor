import {
  EventEmitter,
  Engine,
  Scene,
  System,
  SystemType,
  Tile,
  TileMap,
  Vector,
  World,
  vec,
} from 'excalibur'
import {
  EditorState,
  EngineEvent,
  EngineEventMap,
} from '../types/index.ts'
import { MapEditorComponent } from '../components/index.ts'
import { LayerManager } from '../services/index.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { MapScene } from '../scenes/map.scene.ts'

interface TileHit {
  tileMap: TileMap
  tile: Tile
  coords: { x: number; y: number }
  editor: MapEditorComponent
}

/**
 * Tile-level editor interactions: brush/eraser application on click and hover
 * tracking on move. Owns no global state — per-tilemap selection/hover lives
 * in {@link MapEditorComponent} on the TileMap entity.
 *
 * Subscribes to `ex.Input.Pointer` events directly. Coexists peacefully with
 * {@link CameraControlSystem}: hover events fire during pan-drags too, but
 * there is no visual hover feedback today, so the redundancy is harmless and
 * the simpler split avoids any cross-system coordination state.
 */
export class TileEditorSystem extends System {
  public readonly systemType = SystemType.Update

  private engine?: Engine
  private scene?: Scene

  constructor(
    private readonly events: EventEmitter<EngineEventMap>,
    private readonly getEditorState: () => EditorState,
  ) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) {
      super.initialize(world, scene)
    }
    this.engine = scene.engine
    this.scene = scene

    const pointer = this.engine.input.pointers.primary

    pointer.on('down', (event) => {
      this.handlePointer(vec(event.screenPos.x, event.screenPos.y), 'down')
    })

    pointer.on('move', (event) => {
      this.handlePointer(vec(event.screenPos.x, event.screenPos.y), 'move')
    })
  }

  public update(_elapsed: number): void {
    // All work is event-driven.
  }

  private handlePointer(screenPos: Vector, kind: 'down' | 'move'): void {
    const hit = this.findTileUnderPointer(screenPos)
    if (!hit) return

    if (kind === 'move') {
      this.applyHover(hit)
    } else {
      this.applyClick(hit)
    }
  }

  private findTileUnderPointer(screenPos: Vector): TileHit | null {
    if (!this.scene?.engine) return null

    const worldPos = this.scene.engine.screen.screenToWorldCoordinates(screenPos)

    for (const entity of this.scene.world.entityManager.entities) {
      if (!(entity instanceof TileMap)) continue
      const editor = entity.get(MapEditorComponent)
      if (!editor?.isEditable) continue

      const coords = this.toTileCoords(entity, worldPos)
      if (!coords) continue

      const tile = entity.getTile(coords.x, coords.y)
      if (!tile) continue

      return { tileMap: entity, tile, coords, editor }
    }
    return null
  }

  private toTileCoords(
    tileMap: TileMap,
    worldPos: Vector,
  ): { x: number; y: number } | null {
    const localX = worldPos.x - tileMap.pos.x
    const localY = worldPos.y - tileMap.pos.y
    const tileX = Math.floor(localX / tileMap.tileWidth)
    const tileY = Math.floor(localY / tileMap.tileHeight)
    if (
      tileX < 0 ||
      tileY < 0 ||
      tileX >= tileMap.columns ||
      tileY >= tileMap.rows
    ) {
      return null
    }
    return { x: tileX, y: tileY }
  }

  private applyHover(hit: TileHit): void {
    hit.editor.hoverTileCoords = hit.coords
    this.events.emit(EngineEvent.TILE_HOVERED, {
      coords: hit.coords,
      tileMapId: hit.tileMap.id.toString(),
    })
  }

  private applyClick(hit: TileHit): void {
    const state = this.getEditorState()
    const tool = state.tool ?? 'brush'
    const layerId = this.resolveLayerId(state.layerId)
    if (!layerId) return

    const mapResource = (this.scene as MapScene | undefined)?.mapResource
    if (!mapResource) return

    if (tool === 'brush') {
      if (state.tileId === null || state.tileId === undefined) return
      LayerManager.addSpriteToTileForLayer(
        hit.tileMap,
        mapResource,
        hit.tile,
        layerId,
        state.tileId,
      )
      this.events.emit(EngineEvent.TILE_PLACED, {
        coords: hit.coords,
        tileId: state.tileId,
        layerId,
      })
    } else if (tool === 'eraser') {
      LayerManager.removeSpritesFromTileForLayer(
        hit.tileMap,
        mapResource,
        hit.tile,
        layerId,
      )
      this.events.emit(EngineEvent.TILE_PLACED, {
        coords: hit.coords,
        tileId: 0,
        layerId,
      })
    }

    this.events.emit(EngineEvent.TILE_CLICKED, {
      coords: hit.coords,
      tileMapId: hit.tileMap.id.toString(),
    })
  }

  private resolveLayerId(layerId: string | null): string | null {
    if (layerId) return layerId
    const mapResource = (this.scene as MapScene | undefined)?.mapResource
    return (
      mapResource?.getFirstLayerId?.() ?? EDITOR_CONSTANTS.DEFAULT_LAYER_NAME
    )
  }
}

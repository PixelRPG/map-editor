import {
  Engine,
  EventEmitter,
  System,
  World,
  Scene,
  SystemType,
  TileMap,
  vec,
  Tile,
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

/**
 * Handles basic input events and coordinates with specialized handlers
 */
export class InputCoordinator {
  private isDown = false
  // Null until the first move after down, because GTK's pressed signal and
  // motion signal currently report coordinates in different reference frames
  // in @gjsify/event-bridge (pressed: widget-local; motion: surface-local).
  // Using the first move as the anchor keeps everything in one frame.
  private dragStartPos: { x: number; y: number } | null = null
  private engine?: Engine
  private tileMapInteractor?: TileMapInteractor

  setEngine(engine: Engine): void {
    this.engine = engine
  }

  setTileMapInteractor(interactor: TileMapInteractor): void {
    this.tileMapInteractor = interactor
  }

  onPointerMove(x: number, y: number): void {
    if (this.isDown && this.engine) {
      if (!this.dragStartPos) {
        this.dragStartPos = { x, y }
        return
      }
      const zoom = this.engine.currentScene.camera.zoom || 1
      const deltaX = (x - this.dragStartPos.x) / zoom
      const deltaY = (y - this.dragStartPos.y) / zoom
      this.engine.currentScene.camera.x -= deltaX
      this.engine.currentScene.camera.y -= deltaY
      this.dragStartPos = { x, y }
    } else {
      this.tileMapInteractor?.handleInteraction(x, y, 'move')
    }
  }

  onPointerDown(x: number, y: number): void {
    this.isDown = true
    this.dragStartPos = null
    this.tileMapInteractor?.handleInteraction(x, y, 'down')
  }

  onPointerUp(): void {
    this.isDown = false
    this.dragStartPos = null
  }
}

/**
 * Handles TileMap-specific interactions and editing operations.
 * Emits engine events directly via the provided emitter (no RPC).
 */
export class TileMapInteractor {
  private scene?: Scene

  constructor(
    private readonly events: EventEmitter<EngineEventMap>,
    private readonly getEditorState: () => EditorState,
  ) {}

  setScene(scene: Scene): void {
    this.scene = scene
  }

  handleInteraction(x: number, y: number, type: 'move' | 'down' | 'up'): void {
    if (!this.scene || !this.scene.engine) return

    const worldPos = this.scene.engine.screen.screenToWorldCoordinates(vec(x, y))

    const tileMapEntities = this.scene.world.entityManager.entities.filter(
      (entity) => entity instanceof TileMap,
    )

    for (const tileMap of tileMapEntities as TileMap[]) {
      const editorComponent = tileMap.get(MapEditorComponent)

      if (!editorComponent?.isEditable) continue

      const tileCoords = this.getTileCoordinates(tileMap, worldPos)
      if (!tileCoords) continue

      const tile = tileMap.getTile(tileCoords.x, tileCoords.y)
      if (!tile) continue

      this.handleTileInteraction(tileMap, tile, tileCoords, type)
      break
    }
  }

  private getTileCoordinates(
    tileMap: TileMap,
    worldPos: { x: number; y: number },
  ): { x: number; y: number } | null {
    try {
      const localPos = {
        x: worldPos.x - tileMap.pos.x,
        y: worldPos.y - tileMap.pos.y,
      }

      const tileX = Math.floor(localPos.x / tileMap.tileWidth)
      const tileY = Math.floor(localPos.y / tileMap.tileHeight)

      if (
        tileX >= 0 &&
        tileX < tileMap.columns &&
        tileY >= 0 &&
        tileY < tileMap.rows
      ) {
        return { x: tileX, y: tileY }
      }
      return null
    } catch (error) {
      console.warn('[TileMapInteractor] Error getting tile coordinates:', error)
      return null
    }
  }

  private handleTileInteraction(
    tileMap: TileMap,
    tile: Tile,
    coords: { x: number; y: number },
    type: 'move' | 'down' | 'up',
  ): void {
    const state = this.getEditorState()
    const tool = state.tool ?? 'brush'
    const tileId = state.tileId
    const layerId = this.resolveLayerId(state.layerId)

    if (type === 'move') {
      this.handleTileHover(tileMap, tile, coords)
    } else if (type === 'down' && tool && tileId !== null && tileId !== undefined && layerId) {
      this.handleTileClick(tileMap, tile, coords, tool, tileId, layerId)
    }
  }

  // Mirrors the fallback that the deleted MapEditorSystem used to apply:
  // when no layer is explicitly selected, pick the first layer from the
  // scene's mapResource, or fall back to the default layer name.
  private resolveLayerId(layerId: string | null): string | null {
    if (layerId) return layerId
    const mapScene = this.scene as MapScene | undefined
    return (
      mapScene?.mapResource?.getFirstLayerId?.() ??
      EDITOR_CONSTANTS.DEFAULT_LAYER_NAME
    )
  }

  private handleTileHover(
    tileMap: TileMap,
    tile: Tile,
    coords: { x: number; y: number },
  ): void {
    const editorComponent = tileMap.get(MapEditorComponent)
    if (!editorComponent) return

    editorComponent.hoverTileCoords = coords
    editorComponent.hoverHasChanged = true

    this.events.emit(EngineEvent.TILE_HOVERED, {
      coords,
      tileMapId: tileMap.id.toString(),
    })

    editorComponent.onTileHovered?.(tile, coords)
  }

  private handleTileClick(
    tileMap: TileMap,
    tile: Tile,
    coords: { x: number; y: number },
    tool: string,
    tileId: number,
    layerId: string,
  ): void {
    const editorComponent = tileMap.get(MapEditorComponent)
    if (!editorComponent) return

    editorComponent.selectedTileCoords = coords

    if (tool === 'brush') {
      this.applyBrushTool(tileMap, tile, tileId, layerId)
    } else if (tool === 'eraser') {
      this.applyEraserTool(tileMap, tile, layerId)
    }

    this.events.emit(EngineEvent.TILE_CLICKED, {
      coords,
      tileMapId: tileMap.id.toString(),
    })

    editorComponent.onTileSelected?.(tile, coords)
  }

  private applyBrushTool(
    tileMap: TileMap,
    tile: Tile,
    tileId: number,
    layerId: string,
  ): void {
    try {
      const mapScene = this.scene as MapScene
      if (!mapScene?.mapResource) return

      LayerManager.addSpriteToTileForLayer(
        tileMap,
        mapScene.mapResource,
        tile,
        layerId,
        tileId,
      )

      const placedCoords = this.getTileCoordinatesFromTile(tileMap, tile)
      if (placedCoords) {
        this.events.emit(EngineEvent.TILE_PLACED, {
          coords: placedCoords,
          tileId,
          layerId,
        })
      }
    } catch (error) {
      console.error('[TileMapInteractor] Error applying brush tool:', error)
    }
  }

  private applyEraserTool(tileMap: TileMap, tile: Tile, layerId: string): void {
    try {
      const mapScene = this.scene as MapScene
      if (!mapScene?.mapResource) return

      LayerManager.removeSpritesFromTileForLayer(
        tileMap,
        mapScene.mapResource,
        tile,
        layerId,
      )
    } catch (error) {
      console.error('[TileMapInteractor] Error applying eraser tool:', error)
    }
  }

  private getTileCoordinatesFromTile(
    tileMap: TileMap,
    tile: Tile,
  ): { x: number; y: number } | null {
    try {
      for (let x = 0; x < tileMap.columns; x++) {
        for (let y = 0; y < tileMap.rows; y++) {
          if (tileMap.getTile(x, y) === tile) {
            return { x, y }
          }
        }
      }
      return null
    } catch (error) {
      console.warn(
        '[TileMapInteractor] Error getting coordinates from tile:',
        error,
      )
      return null
    }
  }
}

/**
 * System to handle input for the map editor.
 *
 * Uses Excalibur's native pointer events directly. Input is delivered to the
 * canvas by `@gjsify/event-bridge` in GJS or by the browser natively — no RPC.
 */
export class EditorInputSystem extends System {
  public systemType = SystemType.Update

  private inputCoordinator = new InputCoordinator()
  private tileMapInteractor: TileMapInteractor
  private engine?: Engine
  private scene?: Scene

  constructor(
    events: EventEmitter<EngineEventMap>,
    getEditorState: () => EditorState,
  ) {
    super()
    this.tileMapInteractor = new TileMapInteractor(events, getEditorState)
    this.onPointerMove = this.onPointerMove.bind(this)
    this.onPointerDown = this.onPointerDown.bind(this)
    this.onPointerUp = this.onPointerUp.bind(this)
    this.onWheel = this.onWheel.bind(this)
  }

  public update(_delta: number) {
    // Update logic can be added here if needed
  }

  protected onPointerMove(x: number, y: number) {
    this.inputCoordinator.onPointerMove(x, y)
  }

  protected onPointerDown(x: number, y: number) {
    this.inputCoordinator.onPointerDown(x, y)
  }

  protected onPointerUp() {
    this.inputCoordinator.onPointerUp()
  }

  protected onWheel(deltaY: number, _position: { x: number; y: number }): void {
    if (!this.engine) return

    const direction = deltaY > 0 ? -1 : 1
    let zoom = this.engine.currentScene.camera.zoom
    zoom += direction * EDITOR_CONSTANTS.ZOOM_STEP

    if (zoom <= EDITOR_CONSTANTS.MIN_ZOOM) {
      zoom = EDITOR_CONSTANTS.MIN_ZOOM
    }

    zoom = Math.round(zoom * 10) / 10
    this.engine.currentScene.camera.zoom = zoom
  }

  public initialize(world: World, scene: Scene) {
    if (super.initialize) {
      super.initialize(world, scene)
    }

    this.engine = scene.engine
    this.scene = scene

    this.inputCoordinator.setEngine(this.engine)
    this.tileMapInteractor.setScene(this.scene)
    this.inputCoordinator.setTileMapInteractor(this.tileMapInteractor)

    const pointer = this.engine.input.pointers.primary

    pointer.on('down', (event) => {
      this.onPointerDown(event.screenPos.x, event.screenPos.y)
    })

    pointer.on('up', () => {
      this.onPointerUp()
    })

    pointer.on('cancel', () => {
      this.onPointerUp()
    })

    pointer.on('move', (event) => {
      this.onPointerMove(event.screenPos.x, event.screenPos.y)
    })

    pointer.on('wheel', (wheelEvent) => {
      const x = wheelEvent.x || 0
      const y = wheelEvent.y || 0
      this.onWheel(wheelEvent.deltaY, { x, y })
    })
  }
}

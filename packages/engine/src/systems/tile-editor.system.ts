import {
  type Engine,
  type EventEmitter,
  type Scene,
  System,
  SystemType,
  type Tile,
  TileMap,
  type Vector,
  vec,
  type World,
} from 'excalibur'
import { EraseTileCommand, PaintTileCommand } from '../commands/index.ts'
import {
  ActiveLayerComponent,
  ActiveTileComponent,
  ActiveToolComponent,
  type EditorTool,
  MapEditorComponent,
  UndoStackComponent,
} from '../components/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { findTileIdForSpriteInfo } from '../services/sprite-info.resolver.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { SessionState } from '../utils/session-state.ts'

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

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
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

  private toTileCoords(tileMap: TileMap, worldPos: Vector): { x: number; y: number } | null {
    const localX = worldPos.x - tileMap.pos.x
    const localY = worldPos.y - tileMap.pos.y
    const tileX = Math.floor(localX / tileMap.tileWidth)
    const tileY = Math.floor(localY / tileMap.tileHeight)
    if (tileX < 0 || tileY < 0 || tileX >= tileMap.columns || tileY >= tileMap.rows) {
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
    if (!this.scene) return
    const tool: EditorTool = SessionState.get(this.scene, ActiveToolComponent)?.tool ?? 'brush'
    const tileId = SessionState.get(this.scene, ActiveTileComponent)?.spriteId ?? null
    const explicitLayerId = SessionState.get(this.scene, ActiveLayerComponent)?.layerId ?? null
    const layerId = this.resolveLayerId(explicitLayerId)
    if (!layerId) return

    // Lock guard. Apply only to mutating tools — the eyedropper is a
    // read-only sample so it still works on locked layers (matches
    // most tile-editor UX: you can pick from a locked layer to use
    // its tile elsewhere, you just can't paint into it).
    if (tool !== 'eyedropper' && this.isLayerLocked(layerId)) return

    // Capture the previous sprites on this (tile, layer) so the command
    // can revert. `MapEditorComponent` holds the shadow-state — pull
    // from there before mutating.
    const editor = hit.tileMap.get(MapEditorComponent)
    const previousSprites = (editor?.getSpritesForTileAndLayer(hit.tile, layerId) ?? []).map((ref) => ({
      spriteSetId: ref.spriteSetId,
      spriteId: ref.spriteId,
      zIndex: ref.zIndex,
      animationId: ref.animationId,
    }))

    if (tool === 'brush') {
      if (tileId === null) return
      this.dispatchCommand(
        new PaintTileCommand({
          layerId,
          tileX: hit.coords.x,
          tileY: hit.coords.y,
          spriteId: tileId,
          previousSprites,
        }),
      )
      this.events.emit(EngineEvent.TILE_PLACED, {
        coords: hit.coords,
        tileId,
        layerId,
      })
    } else if (tool === 'eraser') {
      this.dispatchCommand(
        new EraseTileCommand({
          layerId,
          tileX: hit.coords.x,
          tileY: hit.coords.y,
          previousSprites,
        }),
      )
      this.events.emit(EngineEvent.TILE_PLACED, {
        coords: hit.coords,
        tileId: 0,
        layerId,
      })
    } else if (tool === 'eyedropper') {
      // Pick the **top** sprite from the active layer at this tile —
      // sprites on a single (tile, layer) slot are stacked back-to-front,
      // so the last entry is what the user actually sees.
      const top = previousSprites[previousSprites.length - 1]
      if (!top) return
      const mapResource = (this.scene as MapScene).mapResource
      if (!mapResource) return
      const globalTileId = findTileIdForSpriteInfo(mapResource, top.spriteSetId, top.spriteId)
      if (globalTileId === null) return
      this.events.emit(EngineEvent.TILE_PICKED, {
        coords: hit.coords,
        layerId,
        spriteSetId: top.spriteSetId,
        localSpriteId: top.spriteId,
        globalTileId,
      })
    }

    this.events.emit(EngineEvent.TILE_CLICKED, {
      coords: hit.coords,
      tileMapId: hit.tileMap.id.toString(),
    })
  }

  /**
   * Execute a tile-mutating command and push it onto the
   * session-singleton's undo stack. Mirrors `Engine.executeCommand`
   * but inline because the system already has the `scene` reference
   * and we want to avoid the indirection through the engine class
   * for hot paths (one paint per click).
   *
   * Distinguishes between "first command in the scene" (create + set)
   * and "stack already exists" (mutate + notify). Calling
   * `SessionState.set` with the existing instance after mutation
   * works thanks to its same-instance fast path, but the explicit
   * branch is documentation about the intent and one fewer remove +
   * add to handle in the engine.
   */
  private dispatchCommand(command: PaintTileCommand | EraseTileCommand): void {
    if (!this.scene) return
    command.apply(this.scene)
    const existing = SessionState.get(this.scene, UndoStackComponent)
    if (existing) {
      existing.commands = existing.commands.slice(0, existing.cursor)
      existing.commands.push(command)
      existing.cursor = existing.commands.length
      SessionState.notifyMutation(this.scene, existing)
    } else {
      SessionState.set(this.scene, new UndoStackComponent([command], 1))
    }
  }

  private resolveLayerId(layerId: string | null): string | null {
    if (layerId) return layerId
    const mapResource = (this.scene as MapScene | undefined)?.mapResource
    return mapResource?.getFirstLayerId?.() ?? EDITOR_CONSTANTS.DEFAULT_LAYER_NAME
  }

  private isLayerLocked(layerId: string): boolean {
    const layer = (this.scene as MapScene | undefined)?.mapResource?.mapData?.layers.find((l) => l.id === layerId)
    return layer?.locked ?? false
  }
}

import {
  type Actor,
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
  TileMapTierComponent,
  UndoStackComponent,
} from '../components/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { createPencilPreviewActor, type PencilPreviewHover, refreshPencilPreview } from '../services/pencil-preview.ts'
import { findTileIdForSpriteInfo } from '../services/sprite-info.resolver.ts'
import type { LayerTier } from '../types/data/index.ts'
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
 * the panning camera doesn't suppress hover feedback by design — the preview
 * tracks the cursor through pan-drags so the user always sees where a click
 * would land.
 *
 * Pencil hover preview is delegated to `services/pencil-preview.ts`. This
 * system owns the actor lifecycle (create on scene init, route hover state
 * + session-state mutations into the helper); the helper owns the visual
 * logic.
 */
export class TileEditorSystem extends System {
  public readonly systemType = SystemType.Update

  private engine?: Engine
  private scene?: Scene

  private previewActor: Actor | null = null
  private hoverContext: PencilPreviewHover | null = null

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) {
      super.initialize(world, scene)
    }
    this.engine = scene.engine
    this.scene = scene

    this.previewActor = createPencilPreviewActor()
    scene.add(this.previewActor)

    // Refresh the preview when the active tool / tile / layer changes,
    // so the user doesn't have to wiggle the mouse to see the effect of
    // switching tool or picking a new swatch. Subscriptions are tied
    // to the scene's lifetime via `SessionState`'s per-scene WeakMap
    // registry, so no explicit teardown is needed.
    SessionState.subscribe(scene, ActiveToolComponent, () => this.refreshPreview())
    SessionState.subscribe(scene, ActiveTileComponent, () => this.refreshPreview())
    SessionState.subscribe(scene, ActiveLayerComponent, () => this.refreshPreview())

    const pointer = this.engine.input.pointers.primary

    pointer.on('down', (event) => {
      const hit = this.findTileUnderPointer(vec(event.screenPos.x, event.screenPos.y))
      if (hit) this.applyClick(hit)
    })

    pointer.on('move', (event) => {
      const hit = this.findTileUnderPointer(vec(event.screenPos.x, event.screenPos.y))
      if (hit) this.applyHover(hit)
      this.hoverContext = hit ? { tileMap: hit.tileMap, coords: hit.coords } : null
      this.refreshPreview()
    })
  }

  public update(_elapsed: number): void {
    // All work is event-driven.
  }

  private refreshPreview(): void {
    if (!this.previewActor || !this.scene) return
    refreshPencilPreview(this.previewActor, this.scene, this.hoverContext)
  }

  private findTileUnderPointer(screenPos: Vector): TileHit | null {
    if (!this.scene?.engine) return null

    const worldPos = this.scene.engine.screen.screenToWorldCoordinates(screenPos)
    // The active layer's tier determines which of the (typically
    // three) tilemaps in the scene this click should land on. All
    // tier tilemaps share identical dimensions + position, so we can
    // compute tile coords from whichever tilemap we look up — the
    // result resolves congruent tiles on every tier.
    const tier = this.resolveActiveTier()
    const tileMap = this.findTileMapForTier(tier)
    if (!tileMap) return null

    const editor = tileMap.get(MapEditorComponent)
    if (!editor?.isEditable) return null

    const coords = this.toTileCoords(tileMap, worldPos)
    if (!coords) return null

    const tile = tileMap.getTile(coords.x, coords.y)
    if (!tile) return null

    return { tileMap, tile, coords, editor }
  }

  /**
   * Resolve which tier the active layer maps to. Falls back to
   * `'ground'` when no active layer has been picked yet (typical
   * for a freshly-loaded map before any inspector interaction) or
   * when the active layer id no longer exists in the map data.
   */
  private resolveActiveTier(): LayerTier {
    if (!this.scene) return 'ground'
    const explicitLayerId = SessionState.get(this.scene, ActiveLayerComponent)?.layerId ?? null
    const layerId = this.resolveLayerId(explicitLayerId)
    if (!layerId) return 'ground'
    const mapResource = (this.scene as MapScene).mapResource
    const layer = mapResource?.mapData?.layers.find((l) => l.id === layerId)
    return layer?.tier ?? 'ground'
  }

  /**
   * Walk the scene's entities looking for the `TileMap` carrying a
   * `TileMapTierComponent` for the requested tier. There's one per
   * tier per `MapScene` so the first hit is authoritative.
   */
  private findTileMapForTier(tier: LayerTier): TileMap | null {
    if (!this.scene) return null
    for (const entity of this.scene.world.entityManager.entities) {
      if (!(entity instanceof TileMap)) continue
      if (entity.get(TileMapTierComponent)?.tier === tier) return entity
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
    const tool: EditorTool = SessionState.get(this.scene, ActiveToolComponent)?.tool ?? 'pencil'
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

    if (tool === 'pencil') {
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

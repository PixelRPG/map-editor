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
import { type Command, PlaceObjectCommand, type PaintTilePayload } from '../commands/index.ts'
import {
  ActiveLayerComponent,
  ActiveObjectComponent,
  ActiveTileComponent,
  ActiveToolComponent,
  type EditorTool,
  MapEditorComponent,
  SelectedPlacementsComponent,
  TileMapTierComponent,
} from '../components/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { executeCommandOnScene } from '../services/command-dispatch.ts'
import { HoverOverlays } from './hover-overlays.ts'
import { pickTopmostPlacementAt } from '../services/placement-picking.ts'
import { makePlacementId } from '../services/placement-id.ts'
import { findTileIdForSpriteInfo } from '../services/sprite-info.resolver.ts'
import { worldToTile } from '../services/tile-geometry.ts'
import { isTileOutsideMap, resolveMapBounds } from '../services/tile-edit-target.ts'
import { buildTileFillCommand } from '../services/tile-fill.service.ts'
import { makeTilePaintCommand, snapshotPreviousSprites } from '../services/tile-paint.service.ts'
import type { LayerTier } from '../types/data/index.ts'
import { DEFAULT_LAYER_TIER } from '../types/data/LayerData.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { SessionState } from '../utils/session-state.ts'

/** Everything a mutating tool handler needs about one resolved tap. */
interface ToolContext {
  readonly scene: MapScene
  readonly hit: TileHit
  readonly layerId: string
  readonly previousSprites: PaintTilePayload['previousSprites']
  /** The armed tile sprite id, or `null` when none is selected. */
  readonly tileId: number | null
}

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
 * The hover ghosts + select border live in {@link HoverOverlays}; this
 * system only feeds them the tile under the pointer.
 *
 * `initialize` runs before `MapResource` has added the tilemaps for some
 * scenes, which is why the per-tier lookup below is a lazy cache rather
 * than an eager scan.
 */
export class TileEditorSystem extends System {
  public readonly systemType = SystemType.Update

  private engine?: Engine
  private scene?: Scene

  private readonly overlays = new HoverOverlays()

  /**
   * Per-tier `TileMap` cache. Each `MapScene` is constructed fresh per
   * `Engine.loadMap`, so it lives for one map and dies with the system.
   */
  private tileMapsByTier: Map<LayerTier, TileMap> | null = null

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) {
      super.initialize(world, scene)
    }
    this.engine = scene.engine
    this.scene = scene

    this.overlays.attach(scene)

    // Paint fires on the high-level `POINTER_TAP` from
    // `PointerGestureSystem`, NOT on raw `pointer.on('down')` — the
    // raw down would paint on every left-click-drag pan attempt
    // because the user has to press to start the camera drag.
    // `pointer-tap` only fires when press + release happened without
    // crossing the drag threshold, mirroring `Gtk.GestureClick`'s
    // negotiation with `Gtk.GestureDrag`.
    this.events.on(EngineEvent.POINTER_TAP, ({ screenPos }) => {
      const hit = this.findTileUnderPointer(vec(screenPos.x, screenPos.y))
      if (hit) this.applyClick(hit)
    })

    // Hover preview still rides on raw `move` — it is independent of
    // any press/drag state (the user hovers over a tile to see what
    // would be placed, with or without a button held).
    const pointer = this.engine.input.pointers.primary
    pointer.on('move', (event) => {
      const hit = this.findTileUnderPointer(vec(event.screenPos.x, event.screenPos.y))
      if (hit) this.applyHover(hit)
      this.overlays.setHover(hit ? { tileMap: hit.tileMap, coords: hit.coords } : null)
    })
  }

  public update(_elapsed: number): void {
    // All work is event-driven.
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
    if (!editor) return null

    const coords = this.toTileCoords(tileMap, worldPos)
    if (!coords) return null

    const tile = tileMap.getTile(coords.x, coords.y)
    if (!tile) return null

    return { tileMap, tile, coords, editor }
  }

  /**
   * Resolve which tier the active layer maps to. Falls back to
   * `DEFAULT_LAYER_TIER` when no active layer has been picked yet
   * (typical for a freshly-loaded map before any inspector
   * interaction) or when the active layer id no longer exists in
   * the map data.
   */
  private resolveActiveTier(): LayerTier {
    if (!this.scene) return DEFAULT_LAYER_TIER
    const explicitLayerId = SessionState.get(this.scene, ActiveLayerComponent)?.layerId ?? null
    const layerId = this.resolveLayerId(explicitLayerId)
    if (!layerId) return DEFAULT_LAYER_TIER
    const mapResource = (this.scene as MapScene).mapResource
    const layer = mapResource?.mapData?.layers.find((l) => l.id === layerId)
    return layer?.tier ?? DEFAULT_LAYER_TIER
  }

  /**
   * Resolve the per-tier `TileMap` for a pointer interaction. There's one
   * `TileMap` per tier per `MapScene`, fixed for the scene's lifetime, so
   * we walk the scene entities exactly once (on first lookup) and cache
   * the `tier → TileMap` mapping. Subsequent pointer moves are O(1).
   */
  private findTileMapForTier(tier: LayerTier): TileMap | null {
    if (!this.scene) return null
    if (!this.tileMapsByTier) {
      const cache = new Map<LayerTier, TileMap>()
      for (const entity of this.scene.world.entityManager.entities) {
        if (!(entity instanceof TileMap)) continue
        const t = entity.get(TileMapTierComponent)?.tier
        if (t) cache.set(t, entity)
      }
      this.tileMapsByTier = cache
    }
    return this.tileMapsByTier.get(tier) ?? null
  }

  /**
   * World point → tile coords, or `null` when the point falls off the
   * map. The tilemap supplies the GEOMETRY (origin + cell size); the
   * BOUNDS come from the persisted `MapData.columns/rows` via the same
   * {@link isTileOutsideMap} the programmatic paths use — the tilemap's
   * own dimensions are derived from those two fields and are only a
   * fallback for a scene with no parsed map data.
   */
  private toTileCoords(tileMap: TileMap, worldPos: Vector): { x: number; y: number } | null {
    const coords = worldToTile(
      worldPos.x - tileMap.pos.x,
      worldPos.y - tileMap.pos.y,
      tileMap.tileWidth,
      tileMap.tileHeight,
    )
    const mapData = (this.scene as MapScene | undefined)?.mapResource?.mapData
    if (isTileOutsideMap(resolveMapBounds(mapData, tileMap), coords.x, coords.y)) return null
    return coords
  }

  private applyHover(hit: TileHit): void {
    this.events.emit(EngineEvent.TILE_HOVERED, {
      coords: hit.coords,
      tileMapId: hit.tileMap.id.toString(),
    })
  }

  /**
   * Route a tap to the active tool. `'select'` returns early: it needs
   * neither an active tile nor an active layer and ignores the lock
   * (selection is read-only), so keeping it out of the way lets the
   * mutating-tool guards below stay tight.
   */
  private applyClick(hit: TileHit): void {
    const scene = this.scene as MapScene | undefined
    if (!scene) return
    const tool: EditorTool = SessionState.get(scene, ActiveToolComponent)?.tool ?? 'select'

    if (tool === 'select') {
      this.applySelect(hit)
      this.emitTileClicked(hit)
      return
    }

    const layerId = this.resolveLayerId(SessionState.get(scene, ActiveLayerComponent)?.layerId ?? null)
    if (!layerId) return
    // Lock guard on mutating tools only — the eyedropper is a read-only
    // sample, so it still works on locked layers (matching most tile
    // editors: you can pick from a locked layer to use its tile
    // elsewhere, you just can't paint into it).
    if (tool !== 'eyedropper' && this.isLayerLocked(layerId)) return

    this.applyMutatingTool(tool, {
      scene,
      hit,
      layerId,
      // Captured once for BOTH the command's revert payload and the
      // eyedropper's read.
      previousSprites: snapshotPreviousSprites(hit.editor, layerId, hit.coords.x, hit.coords.y),
      tileId: SessionState.get(scene, ActiveTileComponent)?.spriteId ?? null,
    })
    this.emitTileClicked(hit)
  }

  private applyMutatingTool(tool: EditorTool, ctx: ToolContext): void {
    switch (tool) {
      // Pencil + fill need an armed tile; the eraser is the one mutating
      // tool that works without one.
      case 'pencil':
        if (ctx.tileId !== null) this.applyPaint(ctx, ctx.tileId)
        break
      case 'eraser':
        this.applyPaint(ctx, null)
        break
      case 'fill':
        if (ctx.tileId !== null) this.applyFill(ctx, ctx.tileId)
        break
      case 'eyedropper':
        this.applyEyedropper(ctx)
        break
      case 'object':
        this.applyObjectStamp(ctx)
        break
    }
  }

  /** Pencil + eraser — one builder; `null` erases, and reports as tile `0`. */
  private applyPaint(ctx: ToolContext, spriteId: number | null): void {
    this.dispatchCommand(
      makeTilePaintCommand(ctx.layerId, ctx.hit.coords.x, ctx.hit.coords.y, spriteId, ctx.previousSprites),
    )
    this.events.emit(EngineEvent.TILE_PLACED, {
      coords: ctx.hit.coords,
      tileId: spriteId ?? 0,
      layerId: ctx.layerId,
    })
  }

  /**
   * Eyedropper: pick the **top** sprite from the active layer at this
   * tile — sprites on a single (tile, layer) slot are stacked
   * back-to-front, so the last entry is what the user actually sees.
   */
  private applyEyedropper(ctx: ToolContext): void {
    const top = ctx.previousSprites[ctx.previousSprites.length - 1]
    if (!top) return
    const mapResource = ctx.scene.mapResource
    if (!mapResource) return
    const globalTileId = findTileIdForSpriteInfo(mapResource, top.spriteSetId, top.spriteId)
    if (globalTileId === null) return
    this.events.emit(EngineEvent.TILE_PICKED, {
      coords: ctx.hit.coords,
      layerId: ctx.layerId,
      spriteSetId: top.spriteSetId,
      localSpriteId: top.spriteId,
      globalTileId,
    })
  }

  /** Object tool: stamp the armed "object brush" (a library entity id) at the clicked tile. */
  private applyObjectStamp(ctx: ToolContext): void {
    const defId = SessionState.get(ctx.scene, ActiveObjectComponent)?.defId ?? null
    if (!defId) return
    this.dispatchCommand(
      new PlaceObjectCommand({
        placement: {
          id: makePlacementId(ctx.hit.coords.x, ctx.hit.coords.y),
          layerId: ctx.layerId,
          tileX: ctx.hit.coords.x,
          tileY: ctx.hit.coords.y,
          defId,
        },
      }),
    )
    this.events.emit(EngineEvent.TILE_PLACED, { coords: ctx.hit.coords, tileId: 0, layerId: ctx.layerId })
  }

  private emitTileClicked(hit: TileHit): void {
    this.events.emit(EngineEvent.TILE_CLICKED, {
      coords: hit.coords,
      tileMapId: hit.tileMap.id.toString(),
    })
  }

  /**
   * Fill-tool click handler. Flood-fills the contiguous region of tiles
   * whose sprite signature (on the active layer) matches the clicked
   * tile, replacing each with `tileId`. The whole region is one atomic
   * {@link FillTileCommand} → a single undo step + a single collab op.
   * No-op when the clicked tile already shows the fill tile.
   */
  private applyFill(ctx: ToolContext, tileId: number): void {
    const mapResource = ctx.scene.mapResource
    if (!mapResource) return
    const command = buildTileFillCommand(
      ctx.hit.editor,
      mapResource,
      // The flood-fill region is bounded by the map's persisted extent,
      // same authority as the hit test above.
      resolveMapBounds(mapResource.mapData, ctx.hit.tileMap),
      ctx.layerId,
      ctx.hit.coords.x,
      ctx.hit.coords.y,
      tileId,
    )
    if (command) this.dispatchCommand(command)
    // Emitted even when the region already showed the fill tile (no
    // command): the host's "a tile was placed here" signal is about the
    // click, not about whether the map changed.
    this.events.emit(EngineEvent.TILE_PLACED, { coords: ctx.hit.coords, tileId, layerId: ctx.layerId })
  }

  /**
   * Select-tool click handler. Writes the pick from
   * {@link pickTopmostPlacementAt} to `SelectedPlacementsComponent` on
   * the session-singleton (the highlight system reacts via its own
   * subscription) and emits {@link EngineEvent.PLACEMENT_SELECTED} for
   * the host UI to mirror in the inspector. An empty-tile click clears
   * the selection.
   */
  private applySelect(hit: TileHit): void {
    if (!this.scene) return
    const placements = (this.scene as MapScene).mapResource?.mapData?.objectPlacements ?? []
    const picked = pickTopmostPlacementAt(placements, hit.coords.x, hit.coords.y)
    SessionState.set(this.scene, new SelectedPlacementsComponent(picked ? [picked.id] : []))
    this.events.emit(EngineEvent.PLACEMENT_SELECTED, {
      placementId: picked?.id ?? null,
      coords: hit.coords,
    })
  }

  /**
   * Route every paint through the shared {@link executeCommandOnScene}
   * helper so apply + undo-stack push + `COMMAND_EXECUTED` emit stay
   * single-source-of-truth. An earlier inline copy of that body in this
   * system silently dropped the `COMMAND_EXECUTED` emit once (2026-06-01
   * hand-test: joiner saw the initial snapshot but no live edits) — the
   * collab path then broke until the mirror was restored. One owner of
   * the command flow eliminates that class of bug.
   */
  private dispatchCommand(command: Command): void {
    if (!this.scene) return
    executeCommandOnScene(this.scene, this.events, command)
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

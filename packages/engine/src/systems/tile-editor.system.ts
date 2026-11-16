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
  EditorModeComponent,
  type EditorTool,
  MapEditorComponent,
  PendingArrivalPickComponent,
  PendingPlacementMoveComponent,
  SelectedPlacementsComponent,
  TileMapPlaneComponent,
} from '../components/index.ts'
import type { TileStamp } from '../resource/tile-stamp.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { executeCommandOnScene } from '../services/command-dispatch.ts'
import { HoverOverlays } from './hover-overlays.ts'
import { pickTopmostPlacementAt } from '../services/placement-picking.ts'
import { makePlacementId } from '../services/placement-id.ts'
import { findTileIdForSpriteInfo } from '../services/sprite-info.resolver.ts'
import { worldToTile } from '../services/tile-geometry.ts'
import { isTileOutsideMap, resolveMapBounds } from '../services/tile-edit-target.ts'
import { buildTileFillCommand } from '../services/tile-fill.service.ts'
import { buildTerrainEraseCommand } from '../services/terrain-paint.service.ts'
import { buildTileStampCommand } from '../services/tile-stamp.service.ts'
import { makeTilePaintCommand, snapshotPreviousSprites } from '../services/tile-paint.service.ts'
import type { LayerPlane } from '../types/data/index.ts'
import { DEFAULT_LAYER_PLANE } from '../types/data/LayerData.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { SessionState } from '../utils/session-state.ts'

/** Everything a mutating tool handler needs about one resolved tap. */
interface ToolContext {
  readonly scene: MapScene
  readonly hit: TileHit
  readonly layerId: string
  readonly previousSprites: PaintTilePayload['previousSprites']
  /**
   * The armed brush's top-left tile sprite id, or `null` when nothing
   * is armed — what the single-tile tools (fill) consume.
   */
  readonly tileId: number | null
  /**
   * The armed brush as a block; a single tile is its 1×1 case. `null`
   * when nothing is armed. The pencil lays this.
   */
  readonly stamp: TileStamp | null
}

interface TileHit {
  tileMap: TileMap
  tile: Tile
  coords: { x: number; y: number }
  editor: MapEditorComponent
}

/**
 * Tools whose long press is an eyedropper pick (REDESIGN §5.5: "pick
 * that tile, then stay on Paint"). Long-press dispatch is tool-first,
 * like {@link TileEditorSystem.applyClick}: with a paint tool armed the
 * pick has to work on every tile, including one an object happens to
 * stand on — a placement menu stealing the press would make the
 * eyedropper unpredictable exactly where the map is busiest. The
 * placement context menu is therefore the long press of the tools that
 * deal in objects (`'select'`, `'object'`).
 */
const LONG_PRESS_PICK_TOOLS: readonly EditorTool[] = ['pencil', 'fill', 'eraser', 'eyedropper']

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
 * scenes, which is why the per-plane lookup below is a lazy cache rather
 * than an eager scan.
 */
export class TileEditorSystem extends System {
  public readonly systemType = SystemType.Update

  private engine?: Engine
  private scene?: Scene

  private readonly overlays = new HoverOverlays()

  /**
   * Per-plane `TileMap` cache. Each `MapScene` is constructed fresh per
   * `Engine.loadMap`, so it lives for one map and dies with the system.
   */
  private tileMapsByPlane: Map<LayerPlane, TileMap> | null = null

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) {
      super.initialize(world, scene)
    }
    this.engine = scene.engine
    this.scene = scene

    this.overlays.attach(scene, this.events)

    // Paint fires on the high-level `POINTER_TAP` from
    // `PointerGestureSystem`, NOT on raw `pointer.on('down')` — the
    // raw down would paint on every left-click-drag pan attempt
    // because the user has to press to start the camera drag.
    // `pointer-tap` only fires when press + release happened without
    // crossing the drag threshold, mirroring `Gtk.GestureClick`'s
    // negotiation with `Gtk.GestureDrag`.
    this.events.on(EngineEvent.POINTER_TAP, ({ screenPos }) => {
      if (!this.isEditingLive()) return
      const hit = this.findTileUnderPointer(vec(screenPos.x, screenPos.y))
      if (hit) this.applyClick(hit)
    })

    // The hold itself is recognised by the host (see
    // `EngineEvent.POINTER_LONG_PRESS`); from here on it resolves to a
    // tile exactly like a tap.
    this.events.on(EngineEvent.POINTER_LONG_PRESS, ({ screenPos }) => {
      if (!this.isEditingLive()) return
      const hit = this.findTileUnderPointer(vec(screenPos.x, screenPos.y))
      if (hit) this.applyLongPress(hit, screenPos)
    })

    // Hover preview still rides on raw `move` — it is independent of
    // any press/drag state (the user hovers over a tile to see what
    // would be placed, with or without a button held).
    const pointer = this.engine.input.pointers.primary
    pointer.on('move', (event) => {
      if (!this.isEditingLive()) {
        this.overlays.setHover(null)
        return
      }
      const hit = this.findTileUnderPointer(vec(event.screenPos.x, event.screenPos.y))
      if (hit) this.applyHover(hit)
      this.overlays.setHover(hit ? { tileMap: hit.tileMap, coords: hit.coords } : null)
    })
  }

  /**
   * Whether the tools are live — `EditorModeComponent` on the session
   * singleton, which is what every mode combination in
   * `docs/concepts/runtime-modes.md` means by "the editor is active".
   *
   * Without this check a Test run still painted: the markers are
   * mutually exclusive (`applyRuntimeMode`), so during a run there is
   * no `EditorMode` at all, yet a tap went straight through to the
   * armed pencil — undoable and broadcast to peers. Harmless while the
   * chrome still showed the armed tool; a trap once the wide run hides
   * the editing pill (REDESIGN § 4.6), because clicking the canvas is
   * exactly what a person does to give the keyboard-driven hero focus.
   *
   * A Live Run — `EditorMode` AND `RuntimeMode` together — passes, which
   * is the Mario-Maker promise this keeps intact for the entry point
   * that will offer it.
   */
  private isEditingLive(): boolean {
    if (!this.scene) return false
    return SessionState.get(this.scene, EditorModeComponent) !== null
  }

  public update(_elapsed: number): void {
    // All work is event-driven.
  }

  private findTileUnderPointer(screenPos: Vector): TileHit | null {
    if (!this.scene?.engine) return null

    const worldPos = this.scene.engine.screen.screenToWorldCoordinates(screenPos)
    // The active layer's plane determines which of the (typically
    // three) tilemaps in the scene this click should land on. All
    // plane tilemaps share identical dimensions + position, so we can
    // compute tile coords from whichever tilemap we look up — the
    // result resolves congruent tiles on every plane.
    const plane = this.resolveActivePlane()
    const tileMap = this.findTileMapForPlane(plane)
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
   * Resolve which plane the active layer maps to. Falls back to
   * `DEFAULT_LAYER_PLANE` when no active layer has been picked yet
   * (typical for a freshly-loaded map before any inspector
   * interaction) or when the active layer id no longer exists in
   * the map data.
   */
  private resolveActivePlane(): LayerPlane {
    if (!this.scene) return DEFAULT_LAYER_PLANE
    const explicitLayerId = SessionState.get(this.scene, ActiveLayerComponent)?.layerId ?? null
    const layerId = this.resolveLayerId(explicitLayerId)
    if (!layerId) return DEFAULT_LAYER_PLANE
    const mapResource = (this.scene as MapScene).mapResource
    const layer = mapResource?.mapData?.layers.find((l) => l.id === layerId)
    return layer?.plane ?? DEFAULT_LAYER_PLANE
  }

  /**
   * Resolve the per-plane `TileMap` for a pointer interaction. There's one
   * `TileMap` per plane per `MapScene`, fixed for the scene's lifetime, so
   * we walk the scene entities exactly once (on first lookup) and cache
   * the `plane → TileMap` mapping. Subsequent pointer moves are O(1).
   */
  private findTileMapForPlane(plane: LayerPlane): TileMap | null {
    if (!this.scene) return null
    if (!this.tileMapsByPlane) {
      const cache = new Map<LayerPlane, TileMap>()
      for (const entity of this.scene.world.entityManager.entities) {
        if (!(entity instanceof TileMap)) continue
        const p = entity.get(TileMapPlaneComponent)?.plane
        if (p) cache.set(p, entity)
      }
      this.tileMapsByPlane = cache
    }
    return this.tileMapsByPlane.get(plane) ?? null
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
    // Pick mode goes FIRST, ahead of the tool: §6.2 says "all tools
    // replaced by one tap", and the only way to keep that promise is to
    // decide it before anything reads `ActiveToolComponent`.
    if (this.consumePendingArrivalPick(scene, hit.coords)) return
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
      stamp: SessionState.get(scene, ActiveTileComponent)?.stamp ?? null,
    })
    this.emitTileClicked(hit)
  }

  /**
   * Route a long press to the active tool — see
   * {@link LONG_PRESS_PICK_TOOLS} for why the tool decides first.
   *
   * A paint tool picks the tile under the finger without switching tool;
   * an object tool selects the placement under the finger and asks the
   * host for a context menu. A long press on empty tile space with an
   * object tool does nothing yet (REDESIGN reserves it for the Phase 4b
   * marquee).
   */
  private applyLongPress(hit: TileHit, screenPos: { x: number; y: number }): void {
    const scene = this.scene as MapScene | undefined
    if (!scene) return
    const tool: EditorTool = SessionState.get(scene, ActiveToolComponent)?.tool ?? 'select'

    if (LONG_PRESS_PICK_TOOLS.includes(tool)) {
      const layerId = this.resolveLayerId(SessionState.get(scene, ActiveLayerComponent)?.layerId ?? null)
      if (!layerId) return
      // No lock guard — a pick only reads, same as the eyedropper's own
      // tap path.
      this.applyEyedropper({
        scene,
        hit,
        layerId,
        previousSprites: snapshotPreviousSprites(hit.editor, layerId, hit.coords.x, hit.coords.y),
        tileId: null,
        stamp: null,
      })
      return
    }

    const placements = scene.mapResource?.mapData?.objectPlacements ?? []
    const picked = pickTopmostPlacementAt(placements, hit.coords.x, hit.coords.y)
    // Deliberately NOT clearing the selection on an empty-space hold:
    // the tap already does that, and a hold that finds nothing should
    // leave the map as the user left it.
    if (!picked) return
    this.selectPlacement(hit.coords, picked.id)
    this.events.emit(EngineEvent.PLACEMENT_CONTEXT_REQUESTED, {
      placementId: picked.id,
      coords: hit.coords,
      screenPos,
    })
  }

  private applyMutatingTool(tool: EditorTool, ctx: ToolContext): void {
    switch (tool) {
      // Pencil + fill need an armed tile; the eraser is the one mutating
      // tool that works without one.
      case 'pencil':
        if (ctx.stamp) this.applyStamp(ctx, ctx.stamp)
        break
      case 'eraser':
        this.applyErase(ctx)
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

  /**
   * Pencil: lay the armed stamp with its top-left on the clicked tile.
   * A 1×1 stamp produces exactly the paint command the pencil has
   * always produced — `buildTileStampCommand` owns that choice, so the
   * pointer path has one branch instead of two.
   */
  private applyStamp(ctx: ToolContext, stamp: TileStamp): void {
    const command = buildTileStampCommand({
      editor: ctx.hit.editor,
      layerId: ctx.layerId,
      originX: ctx.hit.coords.x,
      originY: ctx.hit.coords.y,
      stamp,
      // Same bounds authority as the fill and the hit test: the map's
      // persisted extent, so a stamp at the edge writes what fits.
      bounds: resolveMapBounds(ctx.scene.mapResource?.mapData, ctx.hit.tileMap),
      // Lets the builder resolve the stamp's global ids to refs and see
      // which of them belong to a terrain — a flower stamped into a
      // path closes the path around it (TERRAIN.md §6.2).
      mapResource: ctx.scene.mapResource,
    })
    if (command) this.dispatchCommand(command)
    // Reported as the anchor tile, like every other single-tile event:
    // hosts use this to mirror "a tile was placed here", and the block's
    // extent is already in the command the peers receive.
    this.events.emit(EngineEvent.TILE_PLACED, {
      coords: ctx.hit.coords,
      tileId: stamp.spriteIds[0] ?? 0,
      layerId: ctx.layerId,
    })
  }

  /** Eraser — the one mutating tile tool that needs no armed brush; reports as tile `0`. */
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
   * Eraser. Over a cell whose top sprite belongs to a terrain it takes
   * that ONE sprite off and re-resolves the ring around it, so erasing
   * into a path reshapes its edges instead of leaving a hole with the
   * old corner pieces still pointing at it (TERRAIN.md §6.2). Over
   * anything else it is the plain full-cell erase it has always been.
   */
  private applyErase(ctx: ToolContext): void {
    const terrainErase = buildTerrainEraseCommand({
      editor: ctx.hit.editor,
      mapResource: ctx.scene.mapResource,
      layerId: ctx.layerId,
      tileX: ctx.hit.coords.x,
      tileY: ctx.hit.coords.y,
      bounds: resolveMapBounds(ctx.scene.mapResource?.mapData, ctx.hit.tileMap),
    })
    if (!terrainErase) {
      this.applyPaint(ctx, null)
      return
    }
    this.dispatchCommand(terrainErase)
    this.events.emit(EngineEvent.TILE_PLACED, { coords: ctx.hit.coords, tileId: 0, layerId: ctx.layerId })
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
   *
   * Unless a one-shot move is armed — then this tap is the move's target
   * and {@link consumePendingMove} takes it instead.
   */
  private applySelect(hit: TileHit): void {
    if (!this.scene) return
    if (this.consumePendingMove(hit.coords)) return
    const placements = (this.scene as MapScene).mapResource?.mapData?.objectPlacements ?? []
    const picked = pickTopmostPlacementAt(placements, hit.coords.x, hit.coords.y)
    this.selectPlacement(hit.coords, picked?.id ?? null)
  }

  /**
   * If a placement is armed for a one-shot move, disarm it and ask the
   * host to move it to `coords` — returning `true` so the caller skips
   * the usual selection write.
   *
   * Disarming BEFORE the request is what makes it one-shot even if the
   * host refuses the move (padlocked layer, off-map tile): a second tap
   * must then be an ordinary select, not another move attempt the user
   * has forgotten about.
   */
  private consumePendingMove(coords: { x: number; y: number }): boolean {
    if (!this.scene) return false
    const pending = SessionState.get(this.scene, PendingPlacementMoveComponent)
    if (!pending) return false
    SessionState.unset(this.scene, PendingPlacementMoveComponent)
    this.events.emit(EngineEvent.PLACEMENT_MOVE_REQUESTED, { placementId: pending.placementId, coords })
    return true
  }

  /**
   * If this map is in pick mode, disarm it and ask the host to point the
   * waiting door at `coords` — returning `true` so the caller skips the
   * tool entirely.
   *
   * Disarming BEFORE the request is what makes it one tap even when the
   * host refuses the target (no arrival tile there, the door vanished
   * meanwhile): a second tap must then be an ordinary edit again, not
   * another pick the user has stopped expecting.
   */
  private consumePendingArrivalPick(scene: MapScene, coords: { x: number; y: number }): boolean {
    const pick = SessionState.get(scene, PendingArrivalPickComponent)
    if (!pick) return false
    SessionState.unset(scene, PendingArrivalPickComponent)
    this.events.emit(EngineEvent.ARRIVAL_PICK_REQUESTED, {
      sourceMapId: pick.sourceMapId,
      doorPlacementId: pick.doorPlacementId,
      targetMapId: scene.mapResource?.mapData?.id ?? '',
      coords,
    })
    return true
  }

  /**
   * Make `placementId` (or nothing, for `null`) the selection and mirror
   * it to the host. Shared by the select tap and the long press so both
   * write the component and emit the event in one place.
   */
  private selectPlacement(coords: { x: number; y: number }, placementId: string | null): void {
    if (!this.scene) return
    SessionState.set(this.scene, new SelectedPlacementsComponent(placementId ? [placementId] : []))
    this.events.emit(EngineEvent.PLACEMENT_SELECTED, { placementId, coords })
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

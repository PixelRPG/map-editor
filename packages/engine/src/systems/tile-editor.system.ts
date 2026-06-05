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
  SelectedPlacementsComponent,
  TileMapTierComponent,
} from '../components/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { executeCommandOnScene } from '../services/command-dispatch.ts'
import { getSpritesAt } from '../services/map-editor-shadow.service.ts'
import { createPencilPreviewActor, type PencilPreviewHover, refreshPencilPreview } from '../services/pencil-preview.ts'
import {
  createSelectHoverBorderActor,
  refreshSelectHoverBorder,
  type SelectHoverBorderContext,
} from '../services/select-hover-border.ts'
import { findTileIdForSpriteInfo } from '../services/sprite-info.resolver.ts'
import type { LayerTier } from '../types/data/index.ts'
import { DEFAULT_LAYER_TIER } from '../types/data/LayerData.ts'
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
  private selectHoverBorderActor: Actor | null = null

  /**
   * Lazy cache of the per-tier `TileMap`s. Populated on first lookup
   * (initialize runs before `MapResource.processTileLayer` adds tilemaps
   * for some scenes, so we cannot fill this eagerly). Each `MapScene` is
   * constructed fresh per `Engine.loadMap`, so the cache lives for one
   * map and dies with the system instance.
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

    this.previewActor = createPencilPreviewActor()
    scene.add(this.previewActor)

    this.selectHoverBorderActor = createSelectHoverBorderActor()
    scene.add(this.selectHoverBorderActor)

    // Refresh the preview when the active tool / tile / layer changes,
    // so the user doesn't have to wiggle the mouse to see the effect of
    // switching tool or picking a new swatch. Subscriptions are tied
    // to the scene's lifetime via `SessionState`'s per-scene WeakMap
    // registry, so no explicit teardown is needed.
    SessionState.subscribe(scene, ActiveToolComponent, () => this.refreshPreview())
    SessionState.subscribe(scene, ActiveTileComponent, () => this.refreshPreview())
    SessionState.subscribe(scene, ActiveLayerComponent, () => this.refreshPreview())

    // Tool changes also re-evaluate the select-hover border so
    // switching to / from `'select'` doesn't strand the previous
    // tool's overlay until the next pointer move.
    SessionState.subscribe(scene, ActiveToolComponent, () => this.refreshSelectHoverBorder())

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
      this.hoverContext = hit ? { tileMap: hit.tileMap, coords: hit.coords } : null
      this.refreshPreview()
      this.refreshSelectHoverBorder()
    })
  }

  public update(_elapsed: number): void {
    // All work is event-driven.
  }

  private refreshPreview(): void {
    if (!this.previewActor || !this.scene) return
    refreshPencilPreview(this.previewActor, this.scene, this.hoverContext)
  }

  private refreshSelectHoverBorder(): void {
    if (!this.selectHoverBorderActor || !this.scene) return
    const ctx: SelectHoverBorderContext | null = this.hoverContext
      ? { tileMap: this.hoverContext.tileMap, coords: this.hoverContext.coords }
      : null
    refreshSelectHoverBorder(this.selectHoverBorderActor, this.scene, ctx)
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
    this.events.emit(EngineEvent.TILE_HOVERED, {
      coords: hit.coords,
      tileMapId: hit.tileMap.id.toString(),
    })
  }

  private applyClick(hit: TileHit): void {
    if (!this.scene) return
    const tool: EditorTool = SessionState.get(this.scene, ActiveToolComponent)?.tool ?? 'select'

    // The `'select'` tool is a self-contained branch — it doesn't
    // need an active tile / layer (it picks placements at the
    // clicked coords across all layers) and doesn't care about lock
    // (selection is read-only). Handle it first + early-return so
    // the mutating-tool guards below stay tight.
    if (tool === 'select') {
      this.applySelect(hit)
      this.events.emit(EngineEvent.TILE_CLICKED, {
        coords: hit.coords,
        tileMapId: hit.tileMap.id.toString(),
      })
      return
    }

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
    // can revert. The hit already carries the `MapEditorComponent`
    // resolved by `findTileUnderPointer` — reuse it instead of a
    // second `tileMap.get(MapEditorComponent)` lookup.
    const previousSprites = getSpritesAt(hit.editor, hit.coords.x, hit.coords.y, layerId).map((ref) => ({
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
   * Select-tool click handler. Scans the active map's object
   * placements across every layer for one occupying the clicked tile
   * coords. Picks the topmost (= last in array order, since
   * `MapResource` renders later entries above earlier ones) so
   * stacked placements behave the same way the eyedropper picks the
   * topmost sprite. Mutates `SelectedPlacementsComponent` on the
   * session-singleton (the highlight system reacts via its own
   * subscription) and emits {@link EngineEvent.PLACEMENT_SELECTED} for
   * the host UI to mirror in the inspector. Empty-tile clicks clear
   * the selection by setting an empty array.
   */
  private applySelect(hit: TileHit): void {
    if (!this.scene) return
    const mapResource = (this.scene as MapScene).mapResource
    const placements = mapResource?.mapData?.objectPlacements ?? []
    let picked: { id: string } | null = null
    for (let i = placements.length - 1; i >= 0; i--) {
      const p = placements[i]
      if (p.tileX === hit.coords.x && p.tileY === hit.coords.y) {
        picked = { id: p.id }
        break
      }
    }
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
  private dispatchCommand(command: PaintTileCommand | EraseTileCommand): void {
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

import type { EventEmitter } from 'excalibur'
import {
  ActiveLayerComponent,
  ActiveObjectComponent,
  ActiveTerrainComponent,
  ActiveTileComponent,
  ActiveToolComponent,
  type EditorTool,
  EditorViewModeComponent,
  PendingArrivalPickComponent,
  PendingPlacementMoveComponent,
  SelectedPlacementsComponent,
} from '../components/index.ts'
import type { TerrainAddress } from '../resource/terrain.ts'
import type { TileStamp } from '../resource/tile-stamp.ts'
import { applyEditorViewMode } from '../services/editor-view.ts'
import type { ArrivalPickRequest, EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { type ActiveSceneAccessor, rebindOnMapLoaded } from './scene-binding.ts'

/**
 * The editor's per-scene "what am I about to do" state: active tool,
 * armed tile or terrain, armed object brush, target layer, current
 * selection and a placement armed for a one-shot move.
 *
 * All of them live on the active scene's session-singleton so systems read
 * them through `SessionState` rather than reaching back into the engine
 * — this class is only the typed accessor pair around that, plus the
 * one side effect the raw component write cannot express (re-applying
 * the dimming when the active layer moves).
 *
 * Every write no-ops without an active `MapScene`; every read reports
 * the empty answer. Callers are UI handlers that can fire before the
 * first map is open.
 */
export class EditorSession {
  constructor(
    private readonly activeScene: ActiveSceneAccessor,
    private readonly events: EventEmitter<EngineEventMap>,
  ) {}

  get activeTool(): EditorTool | null {
    const scene = this.activeScene()
    if (!scene) return null
    return SessionState.get(scene, ActiveToolComponent)?.tool ?? null
  }

  set activeTool(tool: EditorTool) {
    const scene = this.activeScene()
    if (!scene) return
    SessionState.set(scene, new ActiveToolComponent(tool))
  }

  /**
   * Global tile sprite id (sprite-set `firstGid` + local index) of the
   * armed brush's TOP-LEFT tile — a lens on {@link activeStamp}, which
   * is where the brush actually lives. Reading it is how every surface
   * that can show only one tile (the context chip, the bucket fill)
   * asks "which tile is armed"; writing it arms a 1×1 stamp.
   */
  get activeTile(): number | null {
    return this.activeStamp?.spriteIds[0] ?? null
  }

  set activeTile(spriteId: number) {
    this.armTileBrush(new ActiveTileComponent(spriteId))
  }

  /**
   * The armed brush as a block of tiles. A single tile is the 1×1 case,
   * so this is the ONE armed-brush state — `activeTile` is a view on
   * it, not a second copy.
   */
  get activeStamp(): TileStamp | null {
    const scene = this.activeScene()
    if (!scene) return null
    return SessionState.get(scene, ActiveTileComponent)?.stamp ?? null
  }

  set activeStamp(stamp: TileStamp) {
    this.armTileBrush(new ActiveTileComponent(stamp))
  }

  /**
   * The armed terrain brush — "the next stroke lays Path" — or `null`
   * when a plain tile is armed instead.
   *
   * Addressed as `(spriteSetId, terrainId)`, never as a tile id: a
   * terrain's table holds the sprite set's LOCAL ids, so unlike
   * {@link activeTile} no `firstGid` offset enters anywhere.
   */
  get activeTerrain(): TerrainAddress | null {
    const scene = this.activeScene()
    if (!scene) return null
    return SessionState.get(scene, ActiveTerrainComponent)?.address ?? null
  }

  /**
   * `null` disarms the terrain and leaves the tile brush empty too, so
   * "nothing armed" is one state rather than two.
   */
  set activeTerrain(address: TerrainAddress | null) {
    const scene = this.activeScene()
    if (!scene) return
    SessionState.unset(scene, ActiveTileComponent)
    if (address === null) {
      SessionState.unset(scene, ActiveTerrainComponent)
      return
    }
    SessionState.set(scene, new ActiveTerrainComponent(address))
  }

  /**
   * The ONE write that arms a tile brush — and the reason the mutual
   * exclusion of TERRAIN.md §6.2 holds: a tile and a terrain are two
   * answers to "what does the next stroke lay", so arming either one
   * clears the other. Every public setter routes through here or
   * through {@link activeTerrain}; nothing else may touch the two
   * components.
   */
  private armTileBrush(component: ActiveTileComponent): void {
    const scene = this.activeScene()
    if (!scene) return
    SessionState.unset(scene, ActiveTerrainComponent)
    SessionState.set(scene, component)
  }

  /** Entity-library definition id the `'object'` tool stamps, or `null`. */
  get objectBrush(): string | null {
    const scene = this.activeScene()
    if (!scene) return null
    return SessionState.get(scene, ActiveObjectComponent)?.defId ?? null
  }

  set objectBrush(defId: string | null) {
    const scene = this.activeScene()
    if (!scene) return
    SessionState.set(scene, new ActiveObjectComponent(defId))
  }

  /** Matches a `LayerData.id` on the active map. */
  get activeLayer(): string | null {
    const scene = this.activeScene()
    if (!scene) return null
    return SessionState.get(scene, ActiveLayerComponent)?.layerId ?? null
  }

  set activeLayer(layerId: string) {
    const scene = this.activeScene()
    if (!scene) return
    SessionState.set(scene, new ActiveLayerComponent(layerId))
    // Switching the active layer changes which layer keeps full
    // opacity, so the dimming has to be re-applied. No-op while the
    // flag is off (the helper's opacity provider returns 1.0 then).
    if (SessionState.get(scene, EditorViewModeComponent)?.dimInactiveLayers) {
      applyEditorViewMode(scene)
    }
  }

  /** Current placement selection; empty array when nothing is selected. */
  get selectedPlacements(): string[] {
    const scene = this.activeScene()
    if (!scene) return []
    return SessionState.get(scene, SelectedPlacementsComponent)?.placementIds ?? []
  }

  /**
   * An empty array clears the selection by dropping the component, so
   * "absent" and "empty" stay one state that {@link selectedPlacements}
   * collapses to `[]`.
   */
  set selectedPlacements(placementIds: readonly string[]) {
    const scene = this.activeScene()
    if (!scene) return
    if (placementIds.length === 0) {
      SessionState.unset(scene, SelectedPlacementsComponent)
      return
    }
    SessionState.set(scene, new SelectedPlacementsComponent([...placementIds]))
  }

  /**
   * The placement armed for a one-shot move, or `null`. See
   * {@link PendingPlacementMoveComponent} for why the arming lives here
   * rather than in the host.
   */
  get pendingPlacementMove(): string | null {
    const scene = this.activeScene()
    if (!scene) return null
    return SessionState.get(scene, PendingPlacementMoveComponent)?.placementId ?? null
  }

  /** `null` disarms, so there is no "armed for nobody" state to get wrong. */
  set pendingPlacementMove(placementId: string | null) {
    const scene = this.activeScene()
    if (!scene) return
    if (placementId === null) {
      SessionState.unset(scene, PendingPlacementMoveComponent)
      return
    }
    SessionState.set(scene, new PendingPlacementMoveComponent(placementId))
  }

  /**
   * The door waiting for an arrival tile on THIS map, or `null`. See
   * {@link PendingArrivalPickComponent} for why pick mode is session
   * state on the target scene rather than a host-side flag.
   */
  get pendingArrivalPick(): ArrivalPickRequest | null {
    const scene = this.activeScene()
    if (!scene) return null
    const pick = SessionState.get(scene, PendingArrivalPickComponent)
    if (!pick) return null
    return { sourceMapId: pick.sourceMapId, doorPlacementId: pick.doorPlacementId }
  }

  /** `null` disarms, so there is no "armed for nobody" state to get wrong. */
  set pendingArrivalPick(request: ArrivalPickRequest | null) {
    const scene = this.activeScene()
    if (!scene) return
    if (request === null) {
      SessionState.unset(scene, PendingArrivalPickComponent)
      return
    }
    SessionState.set(scene, new PendingArrivalPickComponent(request.sourceMapId, request.doorPlacementId))
  }

  /**
   * Subscribe to the selection set. Fires with the current selection
   * immediately and on every change; rebinds across map switches.
   */
  onSelectionChanged(cb: (placementIds: string[]) => void): () => void {
    return rebindOnMapLoaded(this.events, () => {
      const scene = this.activeScene()
      if (!scene) return null
      return SessionState.subscribe(scene, SelectedPlacementsComponent, () => cb(this.selectedPlacements))
    })
  }
}

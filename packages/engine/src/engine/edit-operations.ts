import type { TileMap } from 'excalibur'
import { type Command, PlaceObjectCommand, RemoveObjectCommand } from '../commands/index.ts'
import type { MapEditorComponent } from '../components/index.ts'
import { makePlacementId } from '../services/placement-id.ts'
import { buildTileFillCommand } from '../services/tile-fill.service.ts'
import { buildTilePaintCommand, findTileMapForLayer } from '../services/tile-paint.service.ts'
import {
  isTileOutsideMap,
  resolveEditLayer,
  resolveMapBounds,
  type TileEditTarget,
  resolveTileEditTarget,
} from '../services/tile-edit-target.ts'
import type { PlacementOverrides } from '../entity/placement-overrides.ts'
import type { ObjectPlacement } from '../types/data/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import type { EditorSession } from './editor-session.ts'
import type { LayerOperations } from './layer-operations.ts'
import type { ActiveSceneAccessor } from './scene-binding.ts'

/**
 * What edit operations need from the AI-assistant presence subsystem:
 * the pause gate that refuses its mutations, and the tile flash that
 * attributes an applied one. Narrow so the operations unit-test with a
 * stub instead of a live awareness channel.
 */
export interface EditAttribution {
  isPaused(): boolean
  isActive(): boolean
  flashTile(tileMap: TileMap, tileX: number, tileY: number): void
}

/** A programmatic tile edit: the headless equivalent of a pointer click. */
export interface TileEditRequest {
  /** `null` targets the active layer. */
  readonly layerId: string | null
  readonly tileX: number
  readonly tileY: number
  /**
   * Omitted → the active tile. For a paint, `0` / `null` erases; for a
   * fill, a non-positive sprite is refused (fill is a paint tool).
   */
  readonly spriteId?: number | null
  /** Initiating actor id, stamped onto the outgoing op for attribution. */
  readonly origin?: string
}

/** A programmatic object stamp. */
export interface ObjectPlaceRequest {
  readonly defId: string
  readonly layerId: string | null
  readonly tileX: number
  readonly tileY: number
  readonly origin?: string
}

/** A resolved tile edit: the scene it lands on plus the accepted target. */
interface TileEditContext {
  readonly scene: MapScene
  readonly target: Extract<TileEditTarget<TileMap, MapEditorComponent>, { type: 'resolved' }>
}

export interface EditOperationsOptions {
  readonly activeScene: ActiveSceneAccessor
  readonly session: EditorSession
  readonly layers: LayerOperations
  readonly assistant: EditAttribution
  readonly execute: (command: Command, origin?: string) => void
}

/**
 * Programmatic map edits — what external tooling (D-Bus/MCP) and the AI
 * collaborator drive, as opposed to `TileEditorSystem`'s pointer path.
 *
 * Both paths build the SAME commands through the same builders and
 * route them through the same op-log, so an AI paint undoes and syncs
 * to peers exactly like a human one. What is unique to this side is the
 * guard chain in front of the command — resolved once by
 * {@link resolveEditLayer} / {@link resolveTileEditTarget} rather than
 * re-spelled per operation.
 *
 * **Every public method here is a mutating entry point and MUST run the
 * guard chain**, naming the gates it skips (`AssistantPauseGate`)
 * instead of omitting them. `edit-operations.spec.ts` enumerates this
 * class's public methods and fails on any it does not know about, so a
 * fifth operation cannot quietly ship without its gates — which is
 * exactly how `removeObject` went for as long as it did without a lock
 * check.
 */
export class EditOperations {
  private readonly activeScene: ActiveSceneAccessor
  private readonly session: EditorSession
  private readonly layers: LayerOperations
  private readonly assistant: EditAttribution
  private readonly execute: (command: Command, origin?: string) => void

  constructor(options: EditOperationsOptions) {
    this.activeScene = options.activeScene
    this.session = options.session
    this.layers = options.layers
    this.assistant = options.assistant
    this.execute = options.execute
  }

  /**
   * Paint (or erase) one tile. `false` when the guard chain refuses:
   * assistant paused, no active map, no resolvable / unlocked layer, or
   * out-of-bounds coords.
   */
  paintTile(request: TileEditRequest): boolean {
    const context = this.#resolveContext(request)
    if (!context) return false
    const { target } = context
    const spriteId = this.#resolveSpriteId(request.spriteId)
    this.execute(
      buildTilePaintCommand(target.editor, target.layerId, request.tileX, request.tileY, spriteId ?? null),
      request.origin,
    )
    this.#flash(target.tileMap, request)
    return true
  }

  /**
   * Bucket-fill the contiguous region matching the origin tile, as one
   * atomic command. Additionally `false` when no positive fill sprite
   * resolves (no erase-fill) or the region already shows it.
   */
  fillTile(request: TileEditRequest): boolean {
    const context = this.#resolveContext(request)
    if (!context) return false
    const { scene, target } = context
    const spriteId = this.#resolveSpriteId(request.spriteId)
    if (!spriteId || spriteId <= 0) return false
    const command = buildTileFillCommand(
      target.editor,
      scene.mapResource,
      // Region bounds come from the persisted extent, like every other
      // bounds reader — see `resolveMapBounds`.
      resolveMapBounds(scene.mapResource?.mapData, target.tileMap),
      target.layerId,
      request.tileX,
      request.tileY,
      spriteId,
    )
    if (!command) return false
    this.execute(command, request.origin)
    this.#flash(target.tileMap, request)
    return true
  }

  /**
   * Stamp a library object onto the map. `false` when the guard chain
   * refuses, `defId` isn't in the project's entity library, or the tile
   * is off-map — an off-map placement would spawn an entity the player
   * can never reach and would ride the op-log to peers.
   */
  placeObject(request: ObjectPlaceRequest): boolean {
    const scene = this.activeScene()
    const layer = resolveEditLayer({
      assistantPause: { mode: 'enforce', paused: this.assistant.isPaused() },
      hasActiveMap: scene !== null,
      requestedLayerId: request.layerId,
      activeLayerId: this.session.activeLayer,
      isLayerLocked: (layerId) => this.layers.isLocked(layerId),
    })
    if (layer.type === 'rejected' || !scene) return false
    if (!scene.entityLibrary.some((entity) => entity.id === request.defId)) return false
    // Same bounds predicate + same authoritative source (persisted
    // `MapData.columns/rows`) as the tile paths and the pointer path.
    if (isTileOutsideMap(scene.mapResource?.mapData, request.tileX, request.tileY)) return false
    const placement = {
      id: makePlacementId(request.tileX, request.tileY),
      layerId: layer.layerId,
      tileX: request.tileX,
      tileY: request.tileY,
      defId: request.defId,
    }
    this.execute(new PlaceObjectCommand({ placement }), request.origin)
    return true
  }

  /**
   * Remove an object placement by id, restoring it on undo.
   *
   * Two things make this entry point different from the other three,
   * and both are deliberate:
   *
   * 1. **The assistant-pause gate is skipped** (`{ mode: 'skip' }`).
   *    This is the ONLY remove path and the human's Props "Remove"
   *    button routes through it, so an engine-level gate silently
   *    disabled the user's own button while the AI was paused. The
   *    assistant's access is gated at the maker's Control/D-Bus
   *    boundary instead, where the caller is known to be the assistant.
   * 2. **The layer is dictated by the placement**, not resolved from
   *    the request / active layer. The lock that matters is the one on
   *    `placement.layerId` — the layer that actually owns the object.
   *
   * The lock itself is NOT skipped: a padlocked layer protects its
   * objects exactly as it protects its tiles. It used to not, and the
   * deletion rode the op-log to peers who had set that same padlock.
   */
  removeObject(placementId: string, origin?: string): boolean {
    const scene = this.activeScene()
    if (!scene) return false
    const placement = scene.mapResource?.mapData?.objectPlacements?.find((p) => p.id === placementId)
    if (!placement) return false
    const layer = resolveEditLayer({
      assistantPause: { mode: 'skip' },
      hasActiveMap: true,
      requestedLayerId: placement.layerId,
      activeLayerId: null,
      isLayerLocked: (layerId) => this.layers.isLocked(layerId),
    })
    if (layer.type === 'rejected') return false
    this.execute(new RemoveObjectCommand({ placement }), origin)
    return true
  }

  /**
   * Duplicate a placement onto a neighbouring tile, returning the copy's
   * id (`null` when a guard refused or no neighbour is on the map).
   *
   * The **whole** placement is copied — `defId` *or* `inline`, plus
   * `overrides` — so duplicating an object the user has renamed or
   * re-configured keeps that work. Re-stamping from `defId` alone would
   * hand back a stock library instance and quietly drop the overrides.
   *
   * The copy lands on a neighbour, not the source tile: `makePlacementId`
   * encodes the tile, and two placements stacked on one cell are
   * indistinguishable on the canvas. First in-bounds direction of
   * right / left / down / up wins.
   *
   * Like {@link removeObject}, the layer is dictated by the placement and
   * its padlock still refuses — but the assistant-pause gate is
   * *enforced* here, because this adds an object just as
   * {@link placeObject} does.
   */
  duplicatePlacement(placementId: string, origin?: string): string | null {
    const scene = this.activeScene()
    const mapData = scene?.mapResource?.mapData
    const source = mapData?.objectPlacements?.find((candidate) => candidate.id === placementId)
    if (!source) return null
    const layer = resolveEditLayer({
      assistantPause: { mode: 'enforce', paused: this.assistant.isPaused() },
      hasActiveMap: true,
      requestedLayerId: source.layerId,
      activeLayerId: null,
      isLayerLocked: (layerId) => this.layers.isLocked(layerId),
    })
    if (layer.type === 'rejected') return null
    const spot = [
      { x: source.tileX + 1, y: source.tileY },
      { x: source.tileX - 1, y: source.tileY },
      { x: source.tileX, y: source.tileY + 1 },
      { x: source.tileX, y: source.tileY - 1 },
    ].find((candidate) => !isTileOutsideMap(mapData, candidate.x, candidate.y))
    if (!spot) return null
    // Deep copy via JSON: `overrides` / `inline` are nested objects, and
    // sharing them between two placements would make an edit to one
    // silently rewrite the other. The schema is JSON-serialisable by
    // contract (see AGENTS.md, transport-friendly schema).
    const placement: ObjectPlacement = JSON.parse(JSON.stringify(source))
    placement.id = makePlacementId(spot.x, spot.y)
    placement.tileX = spot.x
    placement.tileY = spot.y
    // An inline definition's id is conventionally the placement's, so
    // the copy needs its own rather than a twin of the source's.
    if (placement.inline) placement.inline = { ...placement.inline, id: placement.id }
    this.execute(new PlaceObjectCommand({ placement }), origin)
    return placement.id
  }

  /**
   * Move a placement to another tile, keeping its id.
   *
   * The id stays: it is the stable key the selection, the save state and
   * every peer address this object by, and `makePlacementId` only
   * encodes coords *for readability* (see that function's note). Minting
   * a new id for a move would break the selection and read as
   * delete-plus-create on the undo stack.
   *
   * Rides a same-id {@link PlaceObjectCommand}, whose apply captures the
   * placement it overwrites in `replaced` — so revert puts the object
   * back on its old tile instead of deleting it, and a peer's revert
   * converges to the same state.
   *
   * Gates like {@link removeObject}: the layer is dictated by the
   * placement (a move stays on its own layer), and the assistant-pause
   * gate is skipped because this is the only move path and the human's
   * "Move" button routes through it — enforcing it would disable the
   * user's own button while they have the AI paused.
   */
  movePlacement(placementId: string, tileX: number, tileY: number, origin?: string): boolean {
    const scene = this.activeScene()
    const mapData = scene?.mapResource?.mapData
    const source = mapData?.objectPlacements?.find((candidate) => candidate.id === placementId)
    if (!source) return false
    const layer = resolveEditLayer({
      assistantPause: { mode: 'skip' },
      hasActiveMap: true,
      requestedLayerId: source.layerId,
      activeLayerId: null,
      isLayerLocked: (layerId) => this.layers.isLocked(layerId),
    })
    if (layer.type === 'rejected') return false
    if (isTileOutsideMap(mapData, tileX, tileY)) return false
    if (source.tileX === tileX && source.tileY === tileY) return false
    this.execute(new PlaceObjectCommand({ placement: { ...source, tileX, tileY } }), origin)
    return true
  }

  /**
   * Replace a placement's per-instance overrides — the Selected page's
   * edits to the name and components of this one object, leaving the
   * library definition it came from untouched.
   *
   * `undefined` clears the block, which is what
   * {@link placementOverridesFrom} returns once the user has set every
   * field back to the library's value. Gates exactly like
   * {@link movePlacement}.
   */
  setPlacementOverrides(placementId: string, overrides: PlacementOverrides | undefined, origin?: string): boolean {
    const scene = this.activeScene()
    const source = scene?.mapResource?.mapData?.objectPlacements?.find((p) => p.id === placementId)
    if (!source) return false
    const layer = resolveEditLayer({
      assistantPause: { mode: 'skip' },
      hasActiveMap: true,
      requestedLayerId: source.layerId,
      activeLayerId: null,
      isLayerLocked: (layerId) => this.layers.isLocked(layerId),
    })
    if (layer.type === 'rejected') return false
    const placement: ObjectPlacement = { ...source }
    // Deleted rather than set to `undefined`: the payload is a wire
    // message, and `JSON.stringify` drops an undefined value anyway —
    // keeping the key would make the local and remote shapes differ.
    if (overrides) placement.overrides = overrides
    else delete placement.overrides
    this.execute(new PlaceObjectCommand({ placement }), origin)
    return true
  }

  /** The scene + resolved tile target, or `null` when a guard refused. */
  #resolveContext(request: TileEditRequest): TileEditContext | null {
    const scene = this.activeScene()
    const target = resolveTileEditTarget<TileMap, MapEditorComponent>({
      assistantPause: { mode: 'enforce', paused: this.assistant.isPaused() },
      hasActiveMap: scene !== null,
      requestedLayerId: request.layerId,
      activeLayerId: this.session.activeLayer,
      isLayerLocked: (layerId) => this.layers.isLocked(layerId),
      tileX: request.tileX,
      tileY: request.tileY,
      findTileMap: (layerId) => (scene ? findTileMapForLayer(scene, layerId) : null),
      mapBounds: scene?.mapResource?.mapData ?? null,
    })
    if (!scene || target.type === 'rejected') return null
    return { scene, target }
  }

  /** `undefined` means "use the armed tile"; an explicit value wins. */
  #resolveSpriteId(spriteId: number | null | undefined): number | null {
    return spriteId === undefined ? this.session.activeTile : spriteId
  }

  /**
   * Flash the edited tile in the assistant's colour so the user sees the
   * AI act. Only while the assistant is present — plain programmatic
   * callers (tests) must not grow stray highlight actors.
   */
  #flash(tileMap: TileMap, request: TileEditRequest): void {
    if (this.assistant.isActive()) this.assistant.flashTile(tileMap, request.tileX, request.tileY)
  }
}

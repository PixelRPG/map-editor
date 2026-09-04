import type { TileMap } from 'excalibur'
import { type Command, PlaceObjectCommand, RemoveObjectCommand } from '../commands/index.ts'
import type { MapEditorComponent } from '../components/index.ts'
import { makePlacementId } from '../services/placement-id.ts'
import { isTileOutOfBounds } from '../services/tile-geometry.ts'
import { buildTileFillCommand } from '../services/tile-fill.service.ts'
import { buildTilePaintCommand, findTileMapForLayer } from '../services/tile-paint.service.ts'
import { resolveEditLayer, type TileEditTarget, resolveTileEditTarget } from '../services/tile-edit-target.ts'
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
 * {@link resolveTileEditTarget} rather than re-spelled per operation.
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
    const context = this.resolveContext(request)
    if (!context) return false
    const { target } = context
    const spriteId = this.resolveSpriteId(request.spriteId)
    this.execute(
      buildTilePaintCommand(target.editor, target.layerId, request.tileX, request.tileY, spriteId ?? null),
      request.origin,
    )
    this.flash(target.tileMap, request)
    return true
  }

  /**
   * Bucket-fill the contiguous region matching the origin tile, as one
   * atomic command. Additionally `false` when no positive fill sprite
   * resolves (no erase-fill) or the region already shows it.
   */
  fillTile(request: TileEditRequest): boolean {
    const context = this.resolveContext(request)
    if (!context) return false
    const { scene, target } = context
    const spriteId = this.resolveSpriteId(request.spriteId)
    if (!spriteId || spriteId <= 0) return false
    const command = buildTileFillCommand(
      target.editor,
      scene.mapResource,
      { columns: target.tileMap.columns, rows: target.tileMap.rows },
      target.layerId,
      request.tileX,
      request.tileY,
      spriteId,
    )
    if (!command) return false
    this.execute(command, request.origin)
    this.flash(target.tileMap, request)
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
      assistantPaused: this.assistant.isPaused(),
      hasActiveMap: scene !== null,
      requestedLayerId: request.layerId,
      activeLayerId: this.session.activeLayer,
      isLayerLocked: (layerId) => this.layers.isLocked(layerId),
    })
    if (layer.type === 'rejected' || !scene) return false
    if (!scene.entityLibrary.some((entity) => entity.id === request.defId)) return false
    const mapData = scene.mapResource?.mapData
    if (mapData && isTileOutOfBounds(request.tileX, request.tileY, mapData.columns, mapData.rows)) return false
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
   * Deliberately NOT assistant-pause-gated (unlike the others): this is
   * the ONLY remove path and the human's Props "Remove" button routes
   * through it, so an engine-level gate silently disabled the user's own
   * button while the AI was paused. The assistant's access is gated at
   * the maker's Control/D-Bus boundary instead, where the caller is
   * known to be the assistant.
   */
  removeObject(placementId: string, origin?: string): boolean {
    const scene = this.activeScene()
    if (!scene) return false
    const placement = scene.mapResource?.mapData?.objectPlacements?.find((p) => p.id === placementId)
    if (!placement) return false
    this.execute(new RemoveObjectCommand({ placement }), origin)
    return true
  }

  /** The scene + resolved tile target, or `null` when a guard refused. */
  private resolveContext(request: TileEditRequest): TileEditContext | null {
    const scene = this.activeScene()
    const target = resolveTileEditTarget<TileMap, MapEditorComponent>({
      assistantPaused: this.assistant.isPaused(),
      hasActiveMap: scene !== null,
      requestedLayerId: request.layerId,
      activeLayerId: this.session.activeLayer,
      isLayerLocked: (layerId) => this.layers.isLocked(layerId),
      tileX: request.tileX,
      tileY: request.tileY,
      findTileMap: (layerId) => (scene ? findTileMapForLayer(scene, layerId) : null),
    })
    if (!scene || target.type === 'rejected') return null
    return { scene, target }
  }

  /** `undefined` means "use the armed tile"; an explicit value wins. */
  private resolveSpriteId(spriteId: number | null | undefined): number | null {
    return spriteId === undefined ? this.session.activeTile : spriteId
  }

  /**
   * Flash the edited tile in the assistant's colour so the user sees the
   * AI act. Only while the assistant is present — plain programmatic
   * callers (tests) must not grow stray highlight actors.
   */
  private flash(tileMap: TileMap, request: TileEditRequest): void {
    if (this.assistant.isActive()) this.assistant.flashTile(tileMap, request.tileX, request.tileY)
  }
}

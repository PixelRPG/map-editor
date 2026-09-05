import { type Scene, TileMap } from 'excalibur'
import { TileMapPlaneComponent } from '../components/index.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { movePlaneOfLayer } from '../services/layer-plane.service.ts'
import { refreshAllTileGraphics } from '../services/tile-graphics.manager.ts'
import type { LayerData, LayerPlane } from '../types/data/index.ts'
import { DEFAULT_LAYER_PLANE } from '../types/data/LayerData.ts'
import type { Command } from './types.ts'

/**
 * Payload of {@link ReorderLayerCommand}. `index` is the layer's
 * position in `MapData.layers` after the move, `previousIndex` the one
 * before it — both captured by the caller at dispatch time so `revert`
 * needs no lookup. Stable `LayerData.id`, never an array slot alone.
 */
export interface ReorderLayerPayload {
  layerId: string
  index: number
  previousIndex: number
}

/**
 * Payload of {@link SetLayerPlaneCommand}. `previousPlane` is the raw
 * field (possibly absent — a legacy layer that relied on the ground
 * default) so `revert` puts the file back exactly, key-less if it was.
 * A change of plane also carries a list position, because a drag from
 * one section of the Layers tab into another lands at a row, and that
 * row is an array index: one command, one undo step.
 */
export interface SetLayerPlanePayload {
  layerId: string
  plane: LayerPlane
  previousPlane: LayerPlane | undefined
  index: number
  previousIndex: number
}

/**
 * Move a layer inside `MapData.layers`. The array position is the one
 * ordering rule inside a plane (`services/layer-order.ts`) — it decides
 * which of two layers' sprites shows on top of a shared cell and which
 * one `WalkOnTileSystem` asks first — so a reorder is document state
 * and rides the op-log (peers + undo), per AGENTS.md § Transport-ready
 * primitives rule 2.
 *
 * `apply` rebuilds the graphics of the layer's plane tilemap, because
 * every cell that stacks this layer with a sibling may now draw in a
 * different order. Idempotent: applying twice leaves the layer at
 * `index`.
 */
export class ReorderLayerCommand implements Command<ReorderLayerPayload> {
  static readonly KIND = 'layer.reorder'
  readonly kind = ReorderLayerCommand.KIND

  constructor(readonly payload: ReorderLayerPayload) {}

  get label(): string {
    return `Move layer "${this.payload.layerId}"`
  }

  apply(scene: Scene): void {
    this.moveTo(scene, this.payload.index)
  }

  revert(scene: Scene): void {
    this.moveTo(scene, this.payload.previousIndex)
  }

  private moveTo(scene: Scene, index: number): void {
    const layers = layersOf(scene)
    if (!layers) return
    const layer = moveLayer(layers, this.payload.layerId, index)
    if (!layer || !(scene instanceof MapScene)) return
    const tileMap = tileMapForPlane(scene, layer.plane ?? DEFAULT_LAYER_PLANE)
    if (tileMap) refreshAllTileGraphics(tileMap, scene.mapResource)
  }
}

/**
 * Move a layer to another plane — the cross-layer half of the depth
 * model, "Below / At / Above the hero". Document state like the flags,
 * so it rides the op-log.
 *
 * Besides the field write, `apply` moves the layer's live tile sprites
 * from the old plane's tilemap shadow to the new one (they are keyed by
 * plane at runtime), re-pins the z of the placement actors that
 * reference the layer, and rebuilds both tilemaps' graphics — the
 * canvas shows the move immediately, on the peer that applied the op
 * as well as the one that dragged. `revert` restores the previous plane
 * field exactly (absent stays absent) and moves everything back.
 */
export class SetLayerPlaneCommand implements Command<SetLayerPlanePayload> {
  static readonly KIND = 'layer.set-plane'
  readonly kind = SetLayerPlaneCommand.KIND

  constructor(readonly payload: SetLayerPlanePayload) {}

  get label(): string {
    return `Move layer "${this.payload.layerId}" to the ${this.payload.plane} plane`
  }

  apply(scene: Scene): void {
    this.transition(scene, this.payload.plane, this.payload.index)
  }

  revert(scene: Scene): void {
    this.transition(scene, this.payload.previousPlane, this.payload.previousIndex)
  }

  private transition(scene: Scene, plane: LayerPlane | undefined, index: number): void {
    const layers = layersOf(scene)
    if (!layers) return
    const layer = moveLayer(layers, this.payload.layerId, index)
    if (!layer) return
    const from = layer.plane ?? DEFAULT_LAYER_PLANE
    const to = plane ?? DEFAULT_LAYER_PLANE
    if (plane === undefined) delete layer.plane
    else layer.plane = plane
    if (!(scene instanceof MapScene)) return
    if (from !== to) movePlaneOfLayer(scene, layer.id, from, to)
    // The destination plane's cell order changed even when the plane
    // did not (a same-plane drop still moved the row); the source's
    // changed when sprites left it.
    for (const p of from === to ? [to] : [from, to]) {
      const tileMap = tileMapForPlane(scene, p)
      if (tileMap) refreshAllTileGraphics(tileMap, scene.mapResource)
    }
  }
}

/** Resolve the active map's mutable `layers` array, or `null` off a realised `MapScene`. */
function layersOf(scene: Scene): LayerData[] | null {
  if (!(scene instanceof MapScene)) return null
  return scene.mapResource?.mapData?.layers ?? null
}

/**
 * Splice `layerId` to `index` (clamped) in place; returns the layer, or
 * `null` for an unknown id — a peer can move a layer this map no longer
 * has, which is non-critical and warned rather than thrown.
 */
function moveLayer(layers: LayerData[], layerId: string, index: number): LayerData | null {
  const current = layers.findIndex((layer) => layer.id === layerId)
  if (current < 0) {
    console.warn(`[LayerOrder] no layer resolves for id "${layerId}" — command skipped`)
    return null
  }
  const [layer] = layers.splice(current, 1)
  const target = Math.max(0, Math.min(index, layers.length))
  layers.splice(target, 0, layer)
  return layer
}

/** The scene's tilemap for `plane`, or `null` before the map is realised. */
function tileMapForPlane(scene: MapScene, plane: LayerPlane): TileMap | null {
  for (const entity of scene.world.entityManager.entities) {
    if (entity instanceof TileMap && entity.get(TileMapPlaneComponent)?.plane === plane) return entity
  }
  return null
}

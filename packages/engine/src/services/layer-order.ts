import { DEFAULT_LAYER_PLANE, LAYER_PLANES, type LayerData } from '../types/data/LayerData.ts'

/**
 * The one ordering rule for layers, in three pure functions.
 *
 * `plane` decides which of the three tilemaps a layer paints to; the
 * layer's POSITION in `MapData.layers` decides the order inside a
 * plane — a later layer draws over an earlier one. Nothing else orders
 * tiles: the per-layer `zIndex`, the per-sprite `zIndex` and the
 * `properties.z` convention were three more answers to the same
 * question and disagreed silently (live paint appended to a cell's ref
 * list while the reload sorted by an all-zero z, so the canvas showed
 * one order until the next open). Every reader of "which is on top"
 * goes through here so there is exactly one answer.
 */

/** Position of every layer id in the map's array order. */
export function layerOrderIndex(layers: readonly Pick<LayerData, 'id'>[]): ReadonlyMap<string, number> {
  const index = new Map<string, number>()
  layers.forEach((layer, i) => {
    index.set(layer.id, i)
  })
  return index
}

/**
 * Sort a cell's sprite refs into draw order: by their layer's position
 * in `MapData.layers`, ascending, so the last layer paints last and
 * shows on top. Stable, and refs whose layer is unknown to the map
 * (a peer painting a layer this map no longer has) sink to the end.
 */
export function sortRefsByLayerOrder<T extends { layerId: string }>(
  refs: readonly T[],
  order: ReadonlyMap<string, number>,
): T[] {
  const rank = (ref: T): number => order.get(ref.layerId) ?? Number.MAX_SAFE_INTEGER
  return [...refs].sort((a, b) => rank(a) - rank(b))
}

/**
 * The layers in the order `WalkOnTileSystem` consults them for "what is
 * the player standing on": the highest plane first, and inside a plane
 * the layer that draws on top first — i.e. (plane descending, array
 * index descending). The first layer with a sprite at the cell wins.
 *
 * Takes the list as a parameter rather than reading `mapData` so the
 * later elevation step can hand it the walker's storey as a FILTER on
 * this list (not a third sort key): with every layer at storey 0 the
 * filtered and unfiltered answers are identical, which the spec pins.
 */
export function orderLayersForWalkOn<T extends Pick<LayerData, 'id' | 'plane'>>(layers: readonly T[]): T[] {
  const planeRank = (layer: T): number => LAYER_PLANES.indexOf(layer.plane ?? DEFAULT_LAYER_PLANE)
  return layers
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => planeRank(b.layer) - planeRank(a.layer) || b.index - a.index)
    .map((entry) => entry.layer)
}

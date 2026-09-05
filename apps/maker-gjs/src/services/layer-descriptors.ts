import { isLayerDataVisible, type MapData } from '@pixelrpg/engine'
import type { LayerDescriptor } from '@pixelrpg/gjs'

/**
 * Project a map's layers onto the inspector's Layers tab.
 *
 * `tileCount` counts both a layer's own sprites and the object placements
 * that reference it via `layerId` — objects no longer live inside
 * `LayerData`, so "what's on this layer" has to add them back.
 */
export function toLayerDescriptors(mapData: MapData): LayerDescriptor[] {
  const placementsByLayer = new Map<string, number>()
  for (const p of mapData.objectPlacements ?? []) {
    placementsByLayer.set(p.layerId, (placementsByLayer.get(p.layerId) ?? 0) + 1)
  }
  return (mapData.layers ?? []).map((layer) => ({
    id: layer.id,
    name: layer.name,
    tileCount: (layer.sprites?.length ?? 0) + (placementsByLayer.get(layer.id) ?? 0),
    // The absent-is-visible rule lives in ONE engine predicate; a second
    // copy here is how the engine's three readers drifted apart.
    visible: isLayerDataVisible(layer),
    locked: layer.locked ?? false,
    // Absent stays absent: the tab applies the engine's ground default
    // itself (`planeOf`), so the descriptor mirrors the file.
    ...(layer.plane ? { plane: layer.plane } : {}),
  }))
}

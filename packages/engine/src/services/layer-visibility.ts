import type { MapResource } from '../resource/MapResource.ts'

/**
 * Visibility helpers shared by every code path that has to ask
 * "is this layer currently rendered?": the initial-render in
 * `MapResource.applyInitialGraphics`, the per-tile rebuild in
 * `rebuildAllTileGraphics`, the placement spawn in
 * `ObjectSpawnSystem.buildEntity`, and the runtime toggle in
 * `SetLayerVisibilityCommand` (dispatched by `Engine.setLayerVisible`).
 *
 * Before this lived in three different inlined for-loops with
 * subtly-different semantics (`layer.visible !== false` vs
 * `layer.visible === true`). Centralised so all four call sites
 * agree on the default: `undefined` counts as visible, only an
 * explicit `false` hides.
 */

/**
 * Read the `visible` flag for a layer on the supplied resource.
 * Returns `true` when the layer is missing — the caller should
 * already have guarded against bad ids elsewhere, but defaulting
 * to "show" keeps the editor's UI surfaces consistent if a stale
 * `layerId` reference leaks through.
 */
export function isLayerVisible(mapResource: MapResource, layerId: string): boolean {
  const layer = mapResource.mapData?.layers.find((l) => l.id === layerId)
  return layer?.visible !== false
}

/**
 * Collect the ids of every explicitly-hidden layer on the supplied
 * resource into a `Set` for O(1) sprite-by-layer filter checks.
 * Use this inside per-tile loops where calling `isLayerVisible`
 * once per sprite would re-scan the layer list and scale badly on
 * large maps.
 */
export function collectHiddenLayerIds(mapResource: MapResource): Set<string> {
  const hidden = new Set<string>()
  for (const layer of mapResource.mapData?.layers ?? []) {
    if (layer.visible === false) hidden.add(layer.id)
  }
  return hidden
}

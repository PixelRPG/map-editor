import type { MapResource } from '../resource/MapResource.ts'
import type { LayerData } from '../types/data/index.ts'

/**
 * THE single answer to "is this layer currently rendered?".
 *
 * Every code path that has to ask goes through {@link isLayerDataVisible}
 * (or one of the two lookups below): the initial render in
 * `MapResource.applyInitialGraphics`, the per-tile rebuild in
 * `rebuildAllTileGraphics`, the placement spawn in
 * `ObjectSpawnSystem.buildEntity`, the runtime toggle in
 * `SetLayerVisibilityCommand` (dispatched by `Engine.setLayerVisible`),
 * the layer picker (`MapResource.getAvailableLayerIds`), the agent
 * walkability projection (`services/agent-map-data.ts`) and the runtime
 * tile-property lookup (`systems/walk-on-tile.system.ts`).
 *
 * Before this lived in inlined loops with subtly-different semantics
 * (`layer.visible !== false` vs `layer.visible === true` vs a plain
 * truthiness test). The truthy readers were WRONG: a layer whose
 * descriptor carries no `visible` key rendered on screen and could be
 * toggled, but vanished from the picker, from the agent's walkability
 * map and from the runtime tile-property scan. One predicate, one
 * default: `undefined` counts as visible, only an explicit `false`
 * hides.
 *
 * The rule is enforced, not merely documented: `layer-visibility.guard.spec.ts`
 * scans `packages/engine/src` and fails on any direct `.visible` read
 * outside this module that does not carry a written exemption.
 */

/**
 * The predicate. `true` for a missing layer / missing flag — see the
 * module note: absent means visible, and defaulting to "show" keeps the
 * editor's UI surfaces consistent if a stale `layerId` leaks through.
 *
 * The parameter is `Partial<...>`, not `Pick<...>`. `LayerData.visible`
 * is declared REQUIRED, so a `Pick` would reject exactly the shape this
 * function exists to decide — a descriptor whose flag is optional or
 * absent — and force every such caller into a cast. `packages/gjs`'s
 * layer-list descriptor hit that and cast around it; a predicate that
 * cannot be called on its own motivating case is a broken signature,
 * not a caller problem.
 */
export function isLayerDataVisible(layer: Partial<Pick<LayerData, 'visible'>> | null | undefined): boolean {
  // layer-visibility-ok: the one place that owns the absent-is-visible default.
  return layer?.visible !== false
}

/**
 * Read the `visible` flag for a layer on the supplied resource.
 * Returns `true` when the layer is missing — the caller should
 * already have guarded against bad ids elsewhere, but defaulting
 * to "show" keeps the editor's UI surfaces consistent if a stale
 * `layerId` reference leaks through.
 */
export function isLayerVisible(mapResource: MapResource, layerId: string): boolean {
  return isLayerDataVisible(mapResource.mapData?.layers.find((l) => l.id === layerId))
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
    if (!isLayerDataVisible(layer)) hidden.add(layer.id)
  }
  return hidden
}

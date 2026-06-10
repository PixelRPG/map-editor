import { Actor, type Scene, TileMap } from 'excalibur'
import { ActiveLayerComponent, EditorViewModeComponent, TileTransformComponent } from '../components/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { SessionState } from '../utils/session-state.ts'
import { isLayerVisible } from './layer-visibility.ts'
import { refreshAllTileGraphics } from './tile-graphics.manager.ts'

/**
 * Opacity applied to **non-active-layer** sprites + placements
 * while `dimInactiveLayers` is on. Picked low enough that the
 * active layer's content is the clearly dominant signal, but high
 * enough that the user can still read what the dimmed layers
 * contain so they can pick a different active layer.
 */
export const GRID_MODE_DIM_OPACITY = 0.25

/**
 * Apply the current `EditorViewModeComponent` flags to every render
 * surface on the active scene. Called whenever a flag changes or —
 * when `dimInactiveLayers` is on — whenever the active layer
 * changes, so the dimming follows the user's focus.
 *
 * Two passes:
 *
 * 1. **Tilemap rebuild.** Each tier's tilemap rebuilds its tile
 *    graphics through the standard `refreshAllTileGraphics`,
 *    passing an opacity function that dims sprites whose
 *    `layerId` doesn't match the active layer. The clone made
 *    inside `rebuildAllTileGraphics` carries the opacity, so
 *    successive rebuilds don't accumulate.
 *
 * 2. **Placement actor opacity.** Decorations (etc.) spawned by
 *    `ObjectSpawnSystem` set `graphics.opacity` directly —
 *    they're per-instance actors, no clone juggling needed.
 *
 * Excalibur's debug renderer (grid lines) is toggled on the engine
 * outside this function (see `Engine.setShowGrid`) because the
 * debug config is engine-scoped, not scene-scoped.
 */
export function applyEditorViewMode(scene: MapScene): void {
  const flags = SessionState.get(scene, EditorViewModeComponent)
  const dim = flags?.dimInactiveLayers ?? false
  const activeLayerId = SessionState.get(scene, ActiveLayerComponent)?.layerId ?? null
  const mapResource = scene.mapResource
  if (!mapResource) return

  const opacityFor = (refLayerId: string): number => {
    if (!dim || activeLayerId === null) return 1
    return refLayerId === activeLayerId ? 1 : GRID_MODE_DIM_OPACITY
  }

  // Pass 1: tilemaps. Rebuild every tile on every tier — the
  // opacity provider runs per sprite during the clone step.
  for (const entity of scene.world.entityManager.entities) {
    if (entity instanceof TileMap) {
      refreshAllTileGraphics(entity, mapResource, (ref) => opacityFor(ref.layerId))
    }
  }

  // Pass 2: placement actors. `GraphicsComponent.opacity` is a
  // simple scalar multiplied into every draw, so flipping it back
  // and forth between toggles is cheap. Visibility combines the
  // global objects toggle with the placement's per-layer flag.
  const objectsVisible = flags?.objectsVisible ?? true
  for (const entity of scene.world.entityManager.entities) {
    if (!(entity instanceof Actor)) continue
    const transform = entity.get(TileTransformComponent)
    if (!transform) continue
    entity.graphics.opacity = opacityFor(transform.layerId)
    entity.graphics.visible = objectsVisible && isLayerVisible(mapResource, transform.layerId)
  }
}

/** Whether object placements are globally visible on this scene (default true). */
export function areObjectsVisible(scene: Scene): boolean {
  return SessionState.get(scene, EditorViewModeComponent)?.objectsVisible ?? true
}

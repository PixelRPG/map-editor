import type { Actor } from 'excalibur'
import { DepthSortComponent } from '../components/depth-sort.component.ts'
import { SpriteRefComponent } from '../components/sprite-ref.component.ts'
import type { LayerPlane } from '../types/data/LayerData.ts'
import { depthZ, isDepthSorted } from './depth-sort.ts'

/**
 * Set an actor's z for the plane it lives on, and mark it for
 * `DepthSortSystem` when that plane sorts. The one entry point for
 * spawn, the hero's spawn and a layer's plane change, so they cannot
 * disagree about the formula. The `visual` component's `depth` override
 * (read off `SpriteRefComponent`) wins over the sort. The foot is the bottom
 * edge of the actor's PICTURE: `footOffset` (distance from the position to it)
 * defaults to half the actor's box, which is the picture for a placement; the
 * hero's box is shrunk to his foot collider, so he passes his sprite height / 2.
 */
export function applyActorDepth(
  actor: Actor,
  plane: LayerPlane,
  mapHeight: number,
  elevation = 0,
  footOffset?: number,
): void {
  // A thing pinned behind / in front is flat like an off-plane one: no
  // marker, so `DepthSortSystem` never revisits it.
  const depth = actor.get(SpriteRefComponent)?.depth ?? 'sorted'
  if (!isDepthSorted(plane) || depth !== 'sorted') {
    actor.removeComponent(DepthSortComponent)
    actor.z = depthZ({ plane, footY: 0, mapHeightPx: mapHeight, elevation, depth })
    return
  }
  const sort =
    actor.get(DepthSortComponent) ?? new DepthSortComponent(footOffset ?? actor.height / 2, actor.pos.y, elevation)
  if (!actor.has(DepthSortComponent)) actor.addComponent(sort)
  sort.lastY = actor.pos.y
  actor.z = depthZ({ plane, footY: actor.pos.y + sort.footOffset, mapHeightPx: mapHeight, elevation })
}

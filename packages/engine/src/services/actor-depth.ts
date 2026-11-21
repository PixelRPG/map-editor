import type { Actor } from 'excalibur'
import { DepthSortComponent } from '../components/depth-sort.component.ts'
import type { LayerPlane } from '../types/data/LayerData.ts'
import { depthZ, isDepthSorted } from './depth-sort.ts'

/**
 * Set an actor's z for the plane it lives on, and mark it for
 * `DepthSortSystem` when that plane sorts. The one entry point for
 * spawn, the hero's spawn and a layer's plane change, so they cannot
 * disagree about the formula. The foot is the bottom edge of the actor's
 * box, which is its picture.
 */
export function applyActorDepth(actor: Actor, plane: LayerPlane, mapHeight: number, elevation = 0): void {
  if (!isDepthSorted(plane)) {
    actor.removeComponent(DepthSortComponent)
    actor.z = depthZ({ plane, footY: 0, mapHeightPx: mapHeight, elevation })
    return
  }
  const sort = actor.get(DepthSortComponent) ?? new DepthSortComponent(actor.height / 2, actor.pos.y, elevation)
  if (!actor.has(DepthSortComponent)) actor.addComponent(sort)
  sort.lastY = actor.pos.y
  actor.z = depthZ({ plane, footY: actor.pos.y + sort.footOffset, mapHeightPx: mapHeight, elevation })
}

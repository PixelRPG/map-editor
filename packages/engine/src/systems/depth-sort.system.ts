import { type Actor, type Query, type Scene, System, SystemPriority, SystemType, type World } from 'excalibur'
import { DepthSortComponent } from '../components/depth-sort.component.ts'
import { MovementComponent } from '../components/movement.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { depthZ, mapHeightPx } from '../services/depth-sort.ts'

type MoverQuery = Query<typeof DepthSortComponent | typeof MovementComponent>

/**
 * Keeps the z of moving hero-plane actors in step with their y, so the
 * hero walks behind what stands south of him and in front of what stands
 * north. Standing things were given their z once at spawn; only actors
 * that also carry `MovementComponent` are visited, and z is written only
 * when y changed, because a z write makes Excalibur re-sort its draw list.
 *
 * Not gated on runtime mode: the editor shows the same order the game does.
 */
export class DepthSortSystem extends System {
  public readonly systemType = SystemType.Update
  // After motion has moved the actors this frame.
  static priority = SystemPriority.Lowest

  private query: MoverQuery | null = null

  constructor(private readonly mapResource: MapResource) {
    super()
  }

  public onInitialize(world: World, scene: Scene): void {
    if (super.onInitialize) super.onInitialize(world, scene)
    this.query = world.queryManager.createQuery([DepthSortComponent, MovementComponent])
  }

  public onUpdate(_elapsedMs: number): void {
    if (!this.query) return
    const height = mapHeightPx(this.mapResource.mapData)
    for (const entity of this.query.entities) {
      const sort = entity.get(DepthSortComponent)
      const actor = entity as Actor
      if (!sort || !actor.pos || actor.pos.y === sort.lastY) continue
      sort.lastY = actor.pos.y
      actor.z = depthZ({
        plane: 'hero',
        footY: actor.pos.y + sort.footOffset,
        mapHeightPx: height,
        elevation: sort.elevation,
      })
    }
  }
}

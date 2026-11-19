import {
  BodyComponent,
  CollisionType,
  type Query,
  type Scene,
  System,
  SystemPriority,
  SystemType,
  type World,
} from 'excalibur'
import { CollisionRegionsComponent } from '../components/collision-regions.component.ts'
import { PlaneTileMap } from '../resource/plane-tile-map.ts'
import {
  COLLISION_LOOKAHEAD_S,
  COLLISION_MARGIN_TILES,
  markRegionsAround,
  masksEqual,
} from '../services/collision-regions.ts'

type BodyQuery = Query<typeof BodyComponent>

/**
 * Keeps solid-tile colliders only in the regions around physics-active
 * bodies (`docs/design/excalibur-1.md` § P4).
 *
 * Excalibur transforms and re-hashes every collider of a tilemap each
 * frame, so one composite for a whole map costs time in proportion to
 * the map. This system marks the regions each `Active` body can reach
 * within a frame (margin plus lookahead along its velocity) and asks the
 * tilemap to rebuild ONLY when that mask changes — a region border
 * crossing, not a frame. A steady frame reads a few bodies, fills a
 * preallocated mask, compares it, and allocates nothing.
 *
 * Runs before motion and collision (`Highest`), so the mask is current
 * when they read the composite. The lookahead covers the frame's own
 * movement, which is why a fast hero cannot reach an unbuilt region.
 */
export class CollisionRegionSystem extends System {
  static priority = SystemPriority.Highest
  public readonly systemType = SystemType.Update

  private scene: Scene | null = null
  private bodies: BodyQuery | null = null

  public onInitialize(world: World, scene: Scene): void {
    if (super.onInitialize) super.onInitialize(world, scene)
    this.scene = scene
    this.bodies = world.queryManager.createQuery([BodyComponent])
  }

  public onUpdate(): void {
    const scene = this.scene
    const bodies = this.bodies
    if (!scene || !bodies || !scene.physics.config.enabled) return
    for (const tileMap of scene.tileMaps) {
      if (tileMap instanceof PlaneTileMap && tileMap.collisionActive) this.refresh(tileMap, bodies)
    }
  }

  private refresh(tileMap: PlaneTileMap, bodies: BodyQuery): void {
    const regions = tileMap.get(CollisionRegionsComponent)
    if (!regions) return
    const { grid, next, active } = regions
    next.fill(0)
    const tw = tileMap.tileWidth * tileMap.scale.x
    const th = tileMap.tileHeight * tileMap.scale.y
    for (const entity of bodies.entities) {
      const body = entity.get(BodyComponent)
      if (!body || body.collisionType !== CollisionType.Active) continue
      const pos = body.globalPos
      const vel = body.vel
      const tileX = (pos.x - tileMap.pos.x) / tw
      const tileY = (pos.y - tileMap.pos.y) / th
      const reachX = (Math.abs(vel.x) * COLLISION_LOOKAHEAD_S) / tw
      const reachY = (Math.abs(vel.y) * COLLISION_LOOKAHEAD_S) / th
      markRegionsAround(grid, next, tileX, tileY, COLLISION_MARGIN_TILES + reachX, COLLISION_MARGIN_TILES + reachY)
    }
    if (masksEqual(active, next)) return
    active.set(next)
    tileMap.applyRegions()
  }
}

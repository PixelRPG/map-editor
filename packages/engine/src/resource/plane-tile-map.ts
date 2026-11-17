import { BodyComponent, TileMap, type TileMapOptions } from 'excalibur'

/**
 * Excalibur's private dirty flag, which the base class re-arms on
 * construction and on position changes. The spec fails if an upgrade
 * renames it, so the gate cannot silently stop gating.
 */
interface TileMapColliderInternals {
  _collidersDirty: boolean
}

/**
 * A `TileMap` that builds its collision geometry only on request.
 *
 * Stock Excalibur rebuilds the tilemap's `CompositeCollider` on the
 * first update and again after every `tile.solid` change — one box per
 * blocking tile, thousands on a ported world — and then re-transforms
 * every one of them each frame in `CollisionSystem`. The editor never
 * simulates, so that is pure cost there (`docs/design/excalibur-1.md`
 * §2.2). Here the build is skipped while {@link collisionActive} is
 * false and replayed in one go when it turns true.
 *
 * Do not flip the flag directly — `setCollisionActive` in
 * `services/collision-mode.ts` is the one switch, so the scene's
 * physics world and its tilemaps cannot disagree.
 */
export class PlaneTileMap extends TileMap {
  private _collisionActive = false

  constructor(options: TileMapOptions) {
    super(options)
    // The base constructor starts dirty; with collision off there is
    // nothing to build until someone asks for it.
    this.internals._collidersDirty = false
    this.sleepBody()
  }

  /**
   * Park the tilemap's `Fixed` body in Excalibur's dormant state, once
   * and for good: a tilemap never moves.
   *
   * This is the whole of O2 (`docs/design/excalibur-1.md` §5). Every one
   * of a tilemap's thousands of tile boxes shares this *single*
   * `BodyComponent` — the composite's member colliders are re-owned by
   * the map when the processor tracks them. `SparseHashGridCollisionProcessor.broadphase`
   * scans the neighbours of every tracked proxy except those whose body
   * is sleeping, so one `sleep()` lifts the entire static grid out of
   * that loop and leaves only the handful of moving bodies in it.
   *
   * Collision is unaffected: a wall still sits in its grid cells and is
   * still found as the *neighbour* of a moving body, and `Pair.isDormant`
   * only cancels a pair when both bodies sleep or the awake one is
   * itself `Fixed` — never for the `Active` hero. `collision-mode.spec.ts`
   * holds that line.
   *
   * Nothing in Excalibur would do this for us: bodies are only put to
   * sleep by the Realistic solver's contact islands, and we run Arcade.
   * `canSleep` is set explicitly because the default comes from the
   * physics config, which a project may turn off for its own actors.
   */
  private sleepBody(): void {
    const body = this.get(BodyComponent)
    if (!body) return
    body.canSleep = true
    body.sleep()
  }

  /** Whether this tilemap currently owns collision geometry. */
  get collisionActive(): boolean {
    return this._collisionActive
  }

  setCollisionActive(active: boolean): void {
    if (active === this._collisionActive) return
    this._collisionActive = active
    if (active) {
      // Built by the next `update()`, i.e. before the collision system
      // of the same frame reads it.
      this.internals._collidersDirty = true
      return
    }
    this.internals._collidersDirty = false
    this.dropColliders()
  }

  override flagCollidersDirty(): void {
    if (this._collisionActive) super.flagCollidersDirty()
  }

  /**
   * Hand the built boxes back so the collision processor tracks nothing
   * from this map. Leaves the same state as a freshly constructed map.
   */
  private dropColliders(): void {
    const composite = this.collider.get()
    if (!composite) return
    this.collider.$colliderRemoved.notifyAll(composite)
    this.collider.useCompositeCollider([])
  }

  private get internals(): TileMapColliderInternals {
    return this as unknown as TileMapColliderInternals
  }
}

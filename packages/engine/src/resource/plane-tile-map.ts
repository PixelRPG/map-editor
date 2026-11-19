import {
  BodyComponent,
  type BoundingBox,
  type Collider,
  Colliders,
  type CompositeCollider,
  type ExcaliburGraphicsContext,
  TileMap,
  type TileMapOptions,
  Vector,
  vec,
} from 'excalibur'
import { CollisionRegionsComponent } from '../components/collision-regions.component.ts'
import { createRegionGrid } from '../services/collision-regions.ts'
import { BakedChunksComponent } from '../components/baked-chunks.component.ts'
import { drawBakedChunks } from '../services/baked-chunks.ts'

/**
 * Excalibur's private dirty flag, which the base class re-arms on
 * construction and on position changes. The spec fails if an upgrade
 * renames it, so the gate cannot silently stop gating.
 */
interface TileMapColliderInternals {
  _collidersDirty: boolean
  _composite: CompositeCollider
  _strategy: CompositeCollider['compositeStrategy']
  _updateColliders: () => void
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
    // Excalibur's own build meshes EVERY solid tile into one composite;
    // ours builds only the regions marked active (§ P4).
    this.internals._updateColliders = () => this.rebuildColliders()
    this.regions = new CollisionRegionsComponent(createRegionGrid(options.columns, options.rows))
    this.addComponent(this.regions)
    this.sleepBody()
  }

  /** Region mask; written by `CollisionRegionSystem`. */
  readonly regions: CollisionRegionsComponent
  private readonly originalOffsets = new WeakMap<Collider, Vector>()

  /**
   * Rebuild the composite from the active regions now (not on the next
   * update), so the collision system of the same frame sees it. Called by
   * the region system when the mask changed.
   */
  applyRegions(): void {
    if (!this._collisionActive) return
    this.internals._collidersDirty = false
    this.rebuildColliders()
  }

  private rebuildColliders(): void {
    const internals = this.internals
    this.collider.$colliderRemoved.notifyAll(internals._composite)
    internals._composite.clearColliders()
    const composite = this.collider.useCompositeCollider([])
    composite.compositeStrategy = internals._strategy
    internals._composite = composite

    const { grid, active } = this.regions
    const boxes: BoundingBox[] = []
    for (let ry = 0; ry < grid.regionRows; ry++) {
      for (let rx = 0; rx < grid.regionColumns; rx++) {
        if (!active[ry * grid.regionColumns + rx]) continue
        this.meshRegion(rx, ry, composite, boxes)
      }
    }
    for (const c of boxes) {
      const box = Colliders.Box(c.width, c.height, Vector.Zero, vec(c.left - this.pos.x, c.top - this.pos.y))
      box.owner = this
      composite.addCollider(box)
    }
    this.collider.update()
    this.collider.$colliderAdded.notifyAll(composite)
  }

  /**
   * Excalibur's meshing, confined to one region: vertical runs of plain
   * solid tiles become one box, and a box merges with a neighbour column's
   * box of the same height. Boxes never cross a region border, so a wall
   * on the border is two boxes sharing an edge — the same shape Excalibur
   * already produces where its look-behind gives up.
   */
  private meshRegion(rx: number, ry: number, composite: CompositeCollider, out: BoundingBox[]): void {
    const { grid } = this.regions
    const x0 = rx * grid.regionTiles
    const y0 = ry * grid.regionTiles
    const x1 = Math.min(grid.columns, x0 + grid.regionTiles)
    const y1 = Math.min(grid.rows, y0 + grid.regionTiles)
    const first = out.length
    let current: BoundingBox | null = null
    const flush = () => {
      if (current && !this.combineBack(current, out, first)) out.push(current)
      current = null
    }
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const tile = this.tiles[x + y * this.columns]
        if (!tile.isSolid) {
          flush()
          continue
        }
        const custom = tile.getColliders()
        if (custom.length > 0) {
          for (const collider of custom) {
            let original = this.originalOffsets.get(collider)
            if (!original) {
              original = collider.offset
              this.originalOffsets.set(collider, original)
            }
            collider.offset = vec(tile.x * this.tileWidth * this.scale.x, tile.y * this.tileHeight * this.scale.y).add(
              original,
            )
            collider.owner = this
            composite.addCollider(collider)
          }
          flush()
        } else {
          current = current ? current.combine(tile.defaultGeometry) : tile.defaultGeometry
        }
      }
      flush()
    }
  }

  private combineBack(current: BoundingBox, out: BoundingBox[], first: number): boolean {
    let lookBack = this.meshingLookBehind
    for (let i = out.length - 1; i >= first; i--) {
      if (lookBack-- < 0) return false
      const prev = out[i]
      if (prev.top === current.top && prev.bottom === current.bottom && prev.right === current.left) {
        out[i] = prev.combine(current)
        return true
      }
    }
    return false
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

  /**
   * Draw from the baked chunk textures when the plane carries a
   * {@link BakedChunksComponent}; otherwise stock per-tile drawing.
   */
  override draw(ctx: ExcaliburGraphicsContext, elapsed: number): void {
    const baked = this.get(BakedChunksComponent)
    if (!baked || !this.isInitialized) {
      super.draw(ctx, elapsed)
      return
    }
    drawBakedChunks(this, baked, ctx, elapsed)
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
    this.regions.active.fill(0)
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

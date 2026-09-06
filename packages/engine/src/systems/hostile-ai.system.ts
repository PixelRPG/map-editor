import { type Actor, type EventEmitter, type Query, type Scene, System, SystemType, type World } from 'excalibur'
import { HostileComponent } from '../components/hostile.component.ts'
import { HostileRuntimeComponent } from '../components/hostile-runtime.component.ts'
import { HurtboxComponent } from '../components/hurtbox.component.ts'
import { MovementComponent } from '../components/movement.component.ts'
import { NpcRouteComponent } from '../components/npc-route.component.ts'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import { StatsComponent } from '../components/stats.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { combatSession, findPlayerActor, isInvulnerable } from '../utils/combat.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { SessionState } from '../utils/session-state.ts'

type HostileQuery = Query<typeof HostileComponent>

/** Speed for a hostile whose definition carries no `movement`, in tiles/sec. */
const FALLBACK_TILES_PER_SEC = 2
/** How close, in tiles, counts as touching for contact damage. */
const CONTACT_TILES = 0.75
/** How close, in tiles, counts as having arrived at a waypoint. */
const WAYPOINT_ARRIVE_TILES = 0.25

/**
 * Drives every hostile: how it moves and what touching it costs.
 *
 * Three behaviours, and the entity's other components supply everything
 * except the aggression itself — `movement` the speed, `npc-route` the
 * patrol path, `stats` the attack bonus, `visual` the look. A hostile is
 * an ordinary placement with one more component on it, which is why it
 * can be built with the object brush and needs no map data of its own.
 *
 * - `stationary` — never moves; still hurts on contact.
 * - `patrol` — walks its `npc-route` waypoints in a loop, ignoring the
 *   player. Falls back to standing still when the route is empty.
 * - `chase` — walks at the player once inside `aggroTiles`, and stands
 *   still outside it.
 *
 * Gated on `RuntimeModeComponent` the way `PlayerSystem` is: enemies must
 * be inert while the map is being edited, or placing one would start a
 * fight in the editor.
 *
 * Stateless — the patrol cursor and attack cooldown live on each
 * hostile's {@link HostileRuntimeComponent}, the clock on the session.
 */
export class HostileAiSystem extends System {
  public readonly systemType = SystemType.Update

  private scene: Scene | null = null
  private hostileQuery: HostileQuery | null = null

  constructor(
    private readonly mapResource: MapResource,
    private readonly events: EventEmitter<EngineEventMap>,
  ) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    this.scene = scene
    this.hostileQuery = world.queryManager.createQuery([HostileComponent])
  }

  public update(_elapsedMs: number): void {
    const scene = this.scene
    if (!scene || !this.hostileQuery) return
    if (!SessionState.get(scene, RuntimeModeComponent)) return

    const player = findPlayerActor(scene)
    const session = combatSession(scene)
    const tileWidth = this.mapResource.mapData?.tileWidth ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE

    for (const entity of this.hostileQuery.entities) {
      const hostile = entity.get(HostileComponent)
      const actor = entity as Actor
      if (!hostile || !actor.pos || !actor.vel) continue

      const runtime = entity.get(HostileRuntimeComponent) ?? seedRuntime(actor, tileWidth)
      this.steer(actor, hostile, runtime, player, tileWidth)
      if (player) this.tryContactHit(actor, hostile, runtime, player, session.nowMs, tileWidth)
    }
  }

  /** Write the hostile's velocity for this tick. */
  private steer(
    actor: Actor,
    hostile: HostileComponent,
    runtime: HostileRuntimeComponent,
    player: Actor | null,
    tileWidth: number,
  ): void {
    if (hostile.behaviour === 'stationary') {
      actor.vel.x = 0
      actor.vel.y = 0
      return
    }

    const target =
      hostile.behaviour === 'patrol'
        ? this.nextWaypoint(actor, runtime)
        : player && distance(actor, player) <= hostile.aggroTiles * tileWidth
          ? { x: player.pos.x, y: player.pos.y }
          : null

    if (!target) {
      actor.vel.x = 0
      actor.vel.y = 0
      return
    }

    const dx = target.x - actor.pos.x
    const dy = target.y - actor.pos.y
    const len = Math.hypot(dx, dy)
    if (len < 0.001) {
      actor.vel.x = 0
      actor.vel.y = 0
      return
    }
    actor.vel.x = (dx / len) * runtime.speedPxPerSec
    actor.vel.y = (dy / len) * runtime.speedPxPerSec
  }

  /**
   * The waypoint the hostile is walking toward, advancing the cursor when
   * it has arrived. `null` when the route is empty — a `patrol` hostile
   * with no route stands still rather than walking to the origin.
   */
  private nextWaypoint(actor: Actor, runtime: HostileRuntimeComponent): { x: number; y: number } | null {
    const waypoints = actor.get(NpcRouteComponent)?.waypoints ?? []
    if (waypoints.length === 0) return null

    const tileWidth = this.mapResource.mapData?.tileWidth ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE
    const tileHeight = this.mapResource.mapData?.tileHeight ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE
    const index = runtime.waypointIndex % waypoints.length
    const waypoint = waypoints[index]
    const target = {
      x: waypoint.tileX * tileWidth + tileWidth / 2,
      y: waypoint.tileY * tileHeight + tileHeight / 2,
    }
    if (Math.hypot(target.x - actor.pos.x, target.y - actor.pos.y) <= WAYPOINT_ARRIVE_TILES * tileWidth) {
      runtime.waypointIndex = (index + 1) % waypoints.length
    }
    return target
  }

  /** Emit contact damage when the hostile is touching a hittable player. */
  private tryContactHit(
    actor: Actor,
    hostile: HostileComponent,
    runtime: HostileRuntimeComponent,
    player: Actor,
    nowMs: number,
    tileWidth: number,
  ): void {
    if (hostile.contactDamage <= 0) return
    // No hurtbox means the hero cannot be hurt at all — the same
    // presence-as-data rule a swing obeys, read from the other side.
    if (!player.get(HurtboxComponent)) return
    if (nowMs < runtime.nextAttackAtMs) return
    if (distance(actor, player) > CONTACT_TILES * tileWidth) return
    if (isInvulnerable(player, nowMs)) return

    runtime.nextAttackAtMs = nowMs + hostile.attackEveryMs
    const amount = hostile.contactDamage + (actor.get(StatsComponent)?.attack ?? 0)
    this.events.emit(EngineEvent.DAMAGE_DEALT, { targetId: player.id, amount, sourceId: actor.id })
  }
}

/** Pixel distance between two actors' centres. */
function distance(a: Actor, b: Actor): number {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y)
}

/** Attach the live AI block, resolving the speed from `movement` once. */
function seedRuntime(actor: Actor, tileWidth: number): HostileRuntimeComponent {
  const tilesPerSec = actor.get(MovementComponent)?.tilesPerSec ?? FALLBACK_TILES_PER_SEC
  const runtime = new HostileRuntimeComponent(tilesPerSec * tileWidth)
  actor.addComponent(runtime)
  return runtime
}

import { type Actor, type EventEmitter, type Query, type Scene, System, SystemType, type World } from 'excalibur'
import { InvulnerableComponent } from '../components/invulnerable.component.ts'
import { InvulnerableUntilComponent } from '../components/invulnerable-until.component.ts'
import { KnockbackComponent } from '../components/knockback.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { WeaponComponent } from '../components/weapon.component.ts'
import { combatSession } from '../utils/combat.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'

type KnockbackQuery = Query<typeof KnockbackComponent>
type InvulnerableQuery = Query<typeof InvulnerableUntilComponent>

/** Knockback for a hit whose source carries no weapon (a body slam), in tiles. */
const CONTACT_KNOCKBACK_TILES = 0.4
/** How long a pushback lasts. Short — this is a flinch, not a launch. */
const KNOCKBACK_MS = 140

/**
 * The hit reaction: what happens to a body the moment it takes damage.
 *
 * Two consequences, both physical and both belonging to the target rather
 * than to whoever swung — which is why they live in one system instead of
 * being duplicated into every damage source:
 *
 * 1. **Pushback.** The target is shoved along the source → target axis
 *    for {@link KNOCKBACK_MS}. It is re-asserted every tick from
 *    {@link KnockbackComponent} rather than applied as a single impulse,
 *    because `PlayerSystem` and `HostileAiSystem` both overwrite their
 *    actor's velocity each frame — a one-shot impulse would be gone
 *    before it moved anything.
 * 2. **Grace period.** A target carrying `invulnerable` becomes
 *    untouchable for its `afterHitMs`. Without it a hostile standing on
 *    the hero drains the whole heart row inside a second, and the player
 *    never sees what killed them.
 *
 * The magnitude comes from the *source's* weapon, so a heavy sword throws
 * a slime further than a light one without either component knowing about
 * the other.
 */
export class KnockbackSystem extends System {
  public readonly systemType = SystemType.Update

  private scene: Scene | null = null
  private knockbackQuery: KnockbackQuery | null = null
  private invulnerableQuery: InvulnerableQuery | null = null

  constructor(
    private readonly mapResource: MapResource,
    private readonly events: EventEmitter<EngineEventMap>,
  ) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    this.scene = scene
    this.knockbackQuery = world.queryManager.createQuery([KnockbackComponent])
    this.invulnerableQuery = world.queryManager.createQuery([InvulnerableUntilComponent])

    this.events.on(EngineEvent.DAMAGE_DEALT, ({ targetId, sourceId }) => {
      const target = world.entityManager.getById(targetId) as Actor | undefined
      if (!target?.pos) return
      const nowMs = combatSession(scene).nowMs

      const grace = target.get(InvulnerableComponent)
      if (grace) {
        const existing = target.get(InvulnerableUntilComponent)
        if (existing) existing.untilMs = nowMs + grace.afterHitMs
        else target.addComponent(new InvulnerableUntilComponent(nowMs + grace.afterHitMs))
      }

      const source = sourceId === undefined ? undefined : (world.entityManager.getById(sourceId) as Actor | undefined)
      if (!source?.pos) return
      const tileWidth = this.mapResource.mapData?.tileWidth ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE
      const tiles = source.get(WeaponComponent)?.knockbackTiles ?? CONTACT_KNOCKBACK_TILES
      if (tiles <= 0) return

      const dx = target.pos.x - source.pos.x
      const dy = target.pos.y - source.pos.y
      const len = Math.hypot(dx, dy)
      // Perfectly overlapping actors have no axis to be pushed along;
      // skipping is better than picking an arbitrary direction.
      if (len < 0.001) return

      const speed = (tiles * tileWidth) / (KNOCKBACK_MS / 1000)
      const push = new KnockbackComponent((dx / len) * speed, (dy / len) * speed, nowMs + KNOCKBACK_MS)
      const existing = target.get(KnockbackComponent)
      if (existing) target.removeComponent(KnockbackComponent, true)
      target.addComponent(push)
    })
  }

  public update(_elapsedMs: number): void {
    const scene = this.scene
    if (!scene) return
    const nowMs = combatSession(scene).nowMs

    for (const entity of this.knockbackQuery?.entities ?? []) {
      const push = entity.get(KnockbackComponent)
      const actor = entity as Actor
      if (!push || !actor.vel) continue
      if (nowMs >= push.untilMs) {
        actor.vel.x = 0
        actor.vel.y = 0
        entity.removeComponent(KnockbackComponent, true)
        continue
      }
      actor.vel.x = push.velX
      actor.vel.y = push.velY
    }

    for (const entity of this.invulnerableQuery?.entities ?? []) {
      const until = entity.get(InvulnerableUntilComponent)
      if (until && nowMs >= until.untilMs) entity.removeComponent(InvulnerableUntilComponent, true)
    }
  }
}

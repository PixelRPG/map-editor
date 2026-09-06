import { type Entity, type EventEmitter, type Query, type Scene, System, SystemType, type World } from 'excalibur'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import { StatsComponent } from '../components/stats.component.ts'
import { StatsRuntimeComponent } from '../components/stats-runtime.component.ts'
import { StatsSessionComponent } from '../components/stats-session.component.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'

type StatsQuery = Query<typeof StatsComponent>

/** How much steeper each level's experience requirement gets. */
const EXP_CURVE = 1.5
/** Hit points a level-up adds to the live maximum. */
const MAX_HP_PER_LEVEL = 1
/** Damage a hit does at minimum, however much armour the target wears. */
const MIN_DAMAGE = 1

/**
 * Owns hit points, experience and levels — the whole of what `stats`
 * does at runtime.
 *
 * Three jobs, in the order they run:
 *
 * 1. **Seed.** Every entity with an authored {@link StatsComponent} gets
 *    a live {@link StatsRuntimeComponent}. Done per tick rather than at
 *    spawn so entities that appear later (a respawned hostile, a
 *    runtime-spawned actor) are covered by the same line of code.
 * 2. **Re-seed on Play.** Entering runtime mode restores every live block
 *    from its authored one, so a second Play starts a fresh playthrough
 *    instead of inheriting the last one's wounds. The scene is not
 *    rebuilt between Pause and Play, so without this the hero would keep
 *    the damage taken before the pause.
 * 3. **Fold events.** `DAMAGE_DEALT` reduces hp (after `defense`), and
 *    reaching zero emits `ENTITY_DEFEATED`. `EXPERIENCE_GAINED` raises
 *    `exp` and emits `LEVEL_UP` for each threshold crossed.
 *
 * What it deliberately does NOT do is decide what a defeat *means* — no
 * drop, no respawn, no game over. Those are `combat-action`'s rules, and
 * they reach this system only as the event it emits. That is what lets a
 * project have hit points with a different combat system on top, and it
 * is why `stats` can be a base system while `combat-action` is a switch.
 *
 * Stateless: the cross-tick mode edge lives on
 * {@link StatsSessionComponent}, the per-entity numbers on the entities.
 */
export class StatsSystem extends System {
  public readonly systemType = SystemType.Update

  private statsQuery: StatsQuery | null = null
  private scene: Scene | null = null

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    this.scene = scene
    this.statsQuery = world.queryManager.createQuery([StatsComponent])
    SessionState.set(scene, new StatsSessionComponent())

    this.events.on(EngineEvent.DAMAGE_DEALT, ({ targetId, amount }) => {
      const entity = world.entityManager.getById(targetId)
      if (!entity) return
      const live = this.liveBlockOf(entity)
      if (!live || live.hp <= 0) return

      const defense = entity.get(StatsComponent)?.defense ?? 0
      const dealt = Math.max(MIN_DAMAGE, Math.floor(amount) - defense)
      live.hp = Math.max(0, live.hp - dealt)
      if (live.hp === 0) this.events.emit(EngineEvent.ENTITY_DEFEATED, { entityId: targetId })
    })

    this.events.on(EngineEvent.EXPERIENCE_GAINED, ({ entityId, amount }) => {
      const entity = world.entityManager.getById(entityId)
      if (!entity) return
      const live = this.liveBlockOf(entity)
      if (!live || amount <= 0) return

      live.exp += Math.floor(amount)
      // `while`, not `if`: one fat reward may cross several thresholds,
      // and a level swallowed silently is worse than two toasts.
      while (live.exp >= live.expToNext) {
        live.exp -= live.expToNext
        live.level += 1
        live.expToNext = Math.max(1, Math.round(live.expToNext * EXP_CURVE))
        live.maxHp += MAX_HP_PER_LEVEL
        live.hp = live.maxHp
        this.events.emit(EngineEvent.LEVEL_UP, { entityId, level: live.level })
      }
    })
  }

  public update(_elapsedMs: number): void {
    const scene = this.scene
    if (!scene || !this.statsQuery) return

    const inRuntime = SessionState.get(scene, RuntimeModeComponent) !== null
    const session = SessionState.get(scene, StatsSessionComponent)
    const startingRun = inRuntime && session !== null && !session.wasInRuntime
    if (session) session.wasInRuntime = inRuntime

    for (const entity of this.statsQuery.entities) {
      const authored = entity.get(StatsComponent)
      if (!authored) continue
      const live = entity.get(StatsRuntimeComponent)
      if (!live) {
        entity.addComponent(seededFrom(authored))
      } else if (startingRun) {
        const fresh = seededFrom(authored)
        live.hp = fresh.hp
        live.maxHp = fresh.maxHp
        live.level = fresh.level
        live.exp = fresh.exp
        live.expToNext = fresh.expToNext
      }
    }
  }

  /**
   * The entity's live block, seeding it on the spot when the per-tick
   * pass has not reached it yet — an entity spawned and hit within the
   * same frame must still take the damage.
   */
  private liveBlockOf(entity: Entity): StatsRuntimeComponent | null {
    const live = entity.get(StatsRuntimeComponent)
    if (live) return live
    const authored = entity.get(StatsComponent)
    if (!authored) return null
    const seeded = seededFrom(authored)
    entity.addComponent(seeded)
    return seeded
  }
}

/** A fresh live block matching `authored`, hp clamped into range. */
function seededFrom(authored: StatsComponent): StatsRuntimeComponent {
  return new StatsRuntimeComponent(
    Math.min(authored.hp, authored.maxHp),
    authored.maxHp,
    authored.level,
    authored.exp,
    authored.expToNext,
  )
}

import { type Actor, type EventEmitter, type Query, type Scene, System, SystemType, type World } from 'excalibur'
import { HurtboxComponent } from '../components/hurtbox.component.ts'
import { InputSourceComponent } from '../components/input-source.component.ts'
import { PlayerActorComponent } from '../components/player-actor.component.ts'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import { StatsComponent } from '../components/stats.component.ts'
import { WeaponComponent } from '../components/weapon.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { boxContains, combatSession, findPlayerActor, isInvulnerable, swingBox } from '../utils/combat.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { SessionState } from '../utils/session-state.ts'

type HurtboxQuery = Query<typeof HurtboxComponent>

/**
 * The hero's swing: reads the attack button, sweeps a box in front of the
 * player, and emits `DAMAGE_DEALT` for every hurtbox it clips.
 *
 * **Input comes from {@link InputSourceComponent}, never the keyboard**
 * (transport rule 3) — the button's rising edge is detected against
 * `CombatSessionComponent.attackWasHeld`, exactly as `PlayerSystem`
 * detects the action button's against `PlayerSessionComponent`.
 *
 * **It also advances the combat clock.** Excalibur hands systems an
 * elapsed delta, not a timestamp; the swing cooldown, the i-frame window
 * and the respawn timer all need one shared now or they drift apart.
 * This is the first system in `combat-action`'s list, so it is the one
 * that ticks `CombatSessionComponent.nowMs` and every later combat system
 * reads it.
 *
 * Gated on `RuntimeModeComponent` like `PlayerSystem` — pressing X while
 * editing must move nothing.
 */
export class MeleeAttackSystem extends System {
  public readonly systemType = SystemType.Update

  private scene: Scene | null = null
  private hurtboxQuery: HurtboxQuery | null = null

  constructor(
    private readonly mapResource: MapResource,
    private readonly events: EventEmitter<EngineEventMap>,
  ) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    this.scene = scene
    this.hurtboxQuery = world.queryManager.createQuery([HurtboxComponent])
    combatSession(scene)
  }

  public update(elapsedMs: number): void {
    const scene = this.scene
    if (!scene || !this.hurtboxQuery) return

    const session = combatSession(scene)
    if (!SessionState.get(scene, RuntimeModeComponent)) {
      // Outside runtime the clock stands still and the button is
      // released, so re-entering Play cannot inherit a half-pressed edge.
      session.attackWasHeld = false
      return
    }
    session.nowMs += elapsedMs

    const input = SessionState.get(scene, InputSourceComponent)
    if (!input) return
    const pressed = input.attackHeld && !session.attackWasHeld
    session.attackWasHeld = input.attackHeld
    if (!pressed || session.nowMs < session.nextSwingAtMs) return

    const player = findPlayerActor(scene)
    const weapon = player?.get(WeaponComponent)
    if (!player || !weapon) return

    session.nextSwingAtMs = session.nowMs + weapon.swingMs
    this.strike(player, weapon, session.nowMs)
  }

  /** Emit a hit for every hurtbox inside the swing box. */
  private strike(player: Actor, weapon: WeaponComponent, nowMs: number): void {
    const facing = player.get(PlayerActorComponent)?.facing ?? 'down'
    const tileWidth = this.mapResource.mapData?.tileWidth ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE
    const tileHeight = this.mapResource.mapData?.tileHeight ?? EDITOR_CONSTANTS.DEFAULT_TILE_SIZE
    const box = swingBox(player.pos.x, player.pos.y, facing, weapon.reachTiles, tileWidth, tileHeight)

    const amount = weapon.damage + (player.get(StatsComponent)?.attack ?? 0)

    for (const target of this.hurtboxQuery?.entities ?? []) {
      if (target.id === player.id) continue // a swing never hits its own owner
      const actor = target as Actor
      if (!actor.pos || !boxContains(box, actor.pos.x, actor.pos.y)) continue
      if (isInvulnerable(target, nowMs)) continue
      this.events.emit(EngineEvent.DAMAGE_DEALT, { targetId: target.id, amount, sourceId: player.id })
    }
  }
}

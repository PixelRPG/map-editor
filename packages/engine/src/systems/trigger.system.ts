import { type Entity, type EventEmitter, type Scene, System, SystemType, type World } from 'excalibur'
import { TileTransformComponent, TriggerComponent } from '../components/index.ts'
import type { Facing } from '../types/data/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'

type FireReason = 'walk-onto' | 'walk-off' | 'action-button' | 'auto'

/**
 * Watches for the player's logical position changes and action-button
 * input, then fires the corresponding {@link TriggerComponent}-bearing
 * entities by emitting `engine.events.emit('trigger-fired', { entityId, by })`.
 *
 * The system is **deliberately movement-agnostic**: it subscribes to
 * the engine event bus instead of polling `player.pos`. Whichever
 * future movement system owns the player position (smooth, grid-step,
 * pathfinder, …) emits `player-tile-changed` and `player-action-pressed`
 * events; this system reacts. That keeps the engine decoupled from
 * any single movement style.
 *
 * Activation handling:
 * - `walk-onto` — fires on the **destination** tile when
 *   `player-tile-changed` arrives.
 * - `walk-off` — fires on the **previous** tile when the same event
 *   arrives, before updating the tracked position.
 * - `action-button` — fires on the tile adjacent to the player in
 *   the facing direction when `player-action-pressed` arrives.
 * - `auto` — fires once on scene activate. Useful for cutscene
 *   intros / scripted spawns.
 * - `none` — never fires (object renders only).
 *
 * Re-fire policy: triggers with `once: true` flip
 * `TriggerComponent.fired` after firing once and are skipped on
 * subsequent attempts within the same scene visit. Scene reload
 * resets state (new spawn = new component instances).
 */
export class TriggerSystem extends System {
  public readonly systemType = SystemType.Update

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)

    // `auto` triggers fire once at activate.
    this.fireAuto(world)

    this.events.on(EngineEvent.PLAYER_TILE_CHANGED, (payload) => {
      // walk-off the previous tile first, then walk-onto the new one
      if (payload.previous) {
        this.fireMatching(world, payload.previous.tileX, payload.previous.tileY, 'walk-off')
      }
      this.fireMatching(world, payload.tileX, payload.tileY, 'walk-onto')
    })

    this.events.on(EngineEvent.PLAYER_ACTION_PRESSED, ({ tileX, tileY, facing }) => {
      const adj = adjacentTile(tileX, tileY, facing)
      this.fireMatching(world, adj.tileX, adj.tileY, 'action-button')
    })
  }

  public update(_elapsed: number): void {
    // No per-frame work — triggers fire from event-bus subscriptions.
  }

  private fireAuto(world: World): void {
    const query = world.queryManager.createQuery([TriggerComponent, TileTransformComponent])
    for (const entity of query.entities) {
      const trigger = entity.get(TriggerComponent)
      if (trigger?.on === 'auto' && !this.isSpent(trigger)) {
        this.fire(entity, trigger, 'auto')
      }
    }
  }

  private fireMatching(world: World, tileX: number, tileY: number, reason: FireReason): void {
    const query = world.queryManager.createQuery([TriggerComponent, TileTransformComponent])
    for (const entity of query.entities) {
      const t = entity.get(TileTransformComponent)
      if (!t || t.tileX !== tileX || t.tileY !== tileY) continue
      const trigger = entity.get(TriggerComponent)
      if (!trigger || trigger.on !== reason || this.isSpent(trigger)) continue
      this.fire(entity, trigger, reason)
    }
  }

  private isSpent(trigger: TriggerComponent): boolean {
    return trigger.once && trigger.fired
  }

  private fire(entity: Entity, trigger: TriggerComponent, by: FireReason): void {
    trigger.fired = true
    this.events.emit(EngineEvent.TRIGGER_FIRED, { entityId: entity.id, by })
  }
}

/** Helper: tile adjacent to (tileX, tileY) in the given facing direction. */
function adjacentTile(tileX: number, tileY: number, facing: Facing): { tileX: number; tileY: number } {
  switch (facing) {
    case 'up':
      return { tileX, tileY: tileY - 1 }
    case 'down':
      return { tileX, tileY: tileY + 1 }
    case 'left':
      return { tileX: tileX - 1, tileY }
    case 'right':
      return { tileX: tileX + 1, tileY }
  }
}

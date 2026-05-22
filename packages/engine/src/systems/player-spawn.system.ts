import { type EventEmitter, type Scene, System, SystemType, type World } from 'excalibur'
import { SpawnPointComponent, TileTransformComponent } from '../components/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'

/**
 * Resolves the player's spawn position by looking for a
 * {@link SpawnPointComponent} entity with `spawnId === 'player'`.
 *
 * For now the system only **emits** a `player-spawned` event with
 * the resolved tile coordinates. Instantiating the actual player
 * actor (animations, input wiring) is a separate concern handled
 * by the project layer / future `PlayerActor`. Keeping the engine
 * agnostic about what "the player" is lets different games swap
 * their character implementations.
 *
 * Runs once at scene activate. If no spawn point is found, falls
 * back to `(0, 0)` and logs a warning.
 */
export class PlayerSpawnSystem extends System {
  public readonly systemType = SystemType.Update
  private hasRun = false

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    if (this.hasRun) return
    this.hasRun = true

    // `world.queryManager.createQuery` returns entities currently
    // matching the component set. `ObjectSpawnSystem.initialize` runs
    // before us (both are SystemType.Update, but ObjectSpawn is added
    // first in MapScene), so the spawn-point entity is already in the
    // world when we look for it.
    const query = world.queryManager.createQuery([SpawnPointComponent, TileTransformComponent])
    const playerSpawn = query.entities.find((e) => e.get(SpawnPointComponent)?.spawnId === 'player')

    if (playerSpawn) {
      const transform = playerSpawn.get(TileTransformComponent)
      const spawn = playerSpawn.get(SpawnPointComponent)
      this.events.emit(EngineEvent.PLAYER_SPAWNED, {
        tileX: transform?.tileX ?? 0,
        tileY: transform?.tileY ?? 0,
        facing: spawn?.facing,
      })
    } else {
      this.events.emit(EngineEvent.PLAYER_SPAWNED, { tileX: 0, tileY: 0 })
    }
  }

  public update(_elapsed: number): void {
    // No per-frame work — spawn resolution is a one-shot.
  }
}

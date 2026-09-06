import { type Entity, type EventEmitter, Logger, type Scene, System, SystemType, type World } from 'excalibur'
import { HostileComponent } from '../components/hostile.component.ts'
import { InvulnerableUntilComponent } from '../components/invulnerable-until.component.ts'
import { PlacementIdComponent } from '../components/placement-id.component.ts'
import { PlayerComponent } from '../components/player-actor.component.ts'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import { StatsComponent } from '../components/stats.component.ts'
import { StatsRuntimeComponent } from '../components/stats-runtime.component.ts'
import { TileTransformComponent } from '../components/tile-transform.component.ts'
import type { ComponentSpecRegistry } from '../entity/component-spec.ts'
import { resolvePlacementDefinition } from '../entity/data-access.ts'
import { buildPlacementEntity } from '../entity/spawn-placement.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { EntityDefinition, ObjectPlacement } from '../types/data/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { combatSession } from '../utils/combat.ts'
import { SessionState } from '../utils/session-state.ts'

/** How long a defeated hostile stays away before coming back. */
const RESPAWN_MS = 5000
/** Breathing room after the hero is defeated, so the killer cannot re-kill instantly. */
const PLAYER_DEFEAT_GRACE_MS = 2000

/**
 * What a defeated body does: pay out, drop, disappear, and — if the
 * author asked for it — come back.
 *
 * Reacts to `ENTITY_DEFEATED`, which `StatsSystem` emits when hit points
 * reach zero. The split matters: "hp hit zero" is a `stats` fact,
 * "it drops a heart and respawns in five seconds" is `combat-action`'s
 * rule, and keeping the second out of the first is what lets a different
 * combat system reuse the same hit points.
 *
 * **Nothing here is a `Command` or a project op, deliberately.** A drop
 * and a respawn are playtest state, not map data: they last as long as
 * the scene, are rebuilt from the map on the next load, and must never
 * reach the undo stack or a remote peer — playing the game is not editing
 * it. The precedent is `PlayerSystem`, which `scene.add`s the hero the
 * same way. The map's `objectPlacements` array is read here and never
 * written.
 *
 * The hero's own defeat is a **placeholder**: full heal plus a grace
 * period, so a playtest cannot dead-end. A real game-over / retry flow
 * needs save-state that survives a scene load, which does not exist yet
 * (TODO.md).
 *
 * Stateless — the respawn queue lives on {@link CombatSessionComponent}.
 */
export class DefeatSystem extends System {
  public readonly systemType = SystemType.Update

  private readonly logger = Logger.getInstance()
  private scene: Scene | null = null

  constructor(
    private readonly mapResource: MapResource,
    private readonly events: EventEmitter<EngineEventMap>,
    private readonly entityLibrary: readonly EntityDefinition[] = [],
    private readonly registry?: ComponentSpecRegistry,
  ) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    this.scene = scene

    this.events.on(EngineEvent.ENTITY_DEFEATED, ({ entityId }) => {
      const entity = world.entityManager.getById(entityId)
      if (!entity) return
      if (entity.get(PlayerComponent)) {
        this.reviveHero(entity, scene)
        return
      }
      if (entity.get(HostileComponent)) this.defeatHostile(entity, scene)
    })
  }

  public update(_elapsedMs: number): void {
    const scene = this.scene
    if (!scene) return
    if (!SessionState.get(scene, RuntimeModeComponent)) return

    const session = combatSession(scene)
    if (session.respawns.length === 0) return

    const due = session.respawns.filter((entry) => entry.atMs <= session.nowMs)
    if (due.length === 0) return
    session.respawns = session.respawns.filter((entry) => entry.atMs > session.nowMs)
    for (const entry of due) this.respawn(entry.placementId, scene)
  }

  /** Pay out, drop, remove, and queue the comeback. */
  private defeatHostile(entity: Entity, scene: Scene): void {
    const hostile = entity.get(HostileComponent)
    if (!hostile) return
    const session = combatSession(scene)

    const player = this.playerId(scene)
    if (player !== null && hostile.expReward > 0) {
      this.events.emit(EngineEvent.EXPERIENCE_GAINED, { entityId: player, amount: hostile.expReward })
    }

    const tile = entity.get(TileTransformComponent)
    if (hostile.dropItemId && tile && Math.random() < hostile.dropChance) {
      this.spawnDrop(hostile.dropItemId, tile, scene)
    }

    const placementId = entity.get(PlacementIdComponent)?.id
    if (hostile.respawn && placementId) {
      session.respawns.push({ placementId, atMs: session.nowMs + RESPAWN_MS })
    }
    scene.world.entityManager.removeEntity(entity)
    this.logger.info(`[DefeatSystem] defeated ${placementId ?? entity.id}`)
  }

  /**
   * Put a pickup on the ground where the hostile fell.
   *
   * Built through the ordinary spawn pipeline from an INLINE definition,
   * so the drop gets the same graphic, tile transform and `item` + walk-
   * onto `trigger` composition an authored pickup would — and
   * `ItemPickupSystem` collects it with no special case. The synthetic
   * placement is never added to the map.
   *
   * **Where the drop's looks come from.** `hostile.dropItemId` is a bare
   * id, so this resolves it against the entity library: an author who
   * makes a `heart` entity with a `visual` gets a heart on the ground,
   * and its `item` / `trigger` components are only filled in when it
   * carries none. Without a match the drop is the bare pair, which in
   * runtime mode renders nothing — an invisible pickup is the honest cost
   * of `dropItemId` having no appearance anywhere until `item-def` ships
   * (TODO.md), and inventing a placeholder icon here would hide it.
   */
  private spawnDrop(itemId: string, tile: TileTransformComponent, scene: Scene): void {
    const id = `drop:${itemId}:${tile.tileX},${tile.tileY}:${Math.floor(Math.random() * 1e9)}`
    const authored = this.entityLibrary.find((candidate) => candidate.id === itemId)
    const components = [...(authored?.components ?? [])]
    if (!components.some((component) => component.type === 'item')) {
      components.push({ type: 'item', itemId, qty: 1 })
    }
    if (!components.some((component) => component.type === 'trigger')) {
      components.push({ type: 'trigger', on: 'walk-onto', once: true })
    }

    const definition: EntityDefinition = { id, name: authored?.name ?? itemId, components }
    const placement: ObjectPlacement = {
      id,
      layerId: tile.layerId,
      tileX: tile.tileX,
      tileY: tile.tileY,
      inline: definition,
    }
    scene.add(this.build(placement, definition))
  }

  /** Rebuild a placement that was defeated earlier. */
  private respawn(placementId: string, scene: Scene): void {
    const placement = this.mapResource.mapData?.objectPlacements?.find((candidate) => candidate.id === placementId)
    if (!placement) return
    const definition = resolvePlacementDefinition(placement, this.entityLibrary)
    if (!definition) return
    scene.add(this.build(placement, definition))
    this.logger.info(`[DefeatSystem] respawned ${placementId}`)
  }

  /**
   * One spawn-pipeline call, with the map's layers resolved.
   *
   * **Always `runtime: true`.** Everything this system spawns is spawned
   * *during play*, so it must never wear the editor's cell frame or its
   * marker diamonds — that chrome is for authoring and the player must
   * not see it. `MapScene.refreshPlacementGraphicsForMode` cannot correct
   * it afterwards either: it only walks placements that exist in the map,
   * and a drop's placement is synthetic by design.
   */
  private build(placement: ObjectPlacement, definition: EntityDefinition): Entity {
    const layersById = new Map((this.mapResource.mapData?.layers ?? []).map((layer) => [layer.id, layer]))
    return buildPlacementEntity(placement, definition, this.mapResource, layersById, this.registry, { runtime: true })
  }

  /** Full heal plus a grace period — the placeholder game-over. */
  private reviveHero(entity: Entity, scene: Scene): void {
    const live = entity.get(StatsRuntimeComponent)
    const authored = entity.get(StatsComponent)
    if (live) live.hp = live.maxHp
    else if (authored)
      entity.addComponent(
        new StatsRuntimeComponent(authored.maxHp, authored.maxHp, authored.level, authored.exp, authored.expToNext),
      )

    const nowMs = combatSession(scene).nowMs
    const until = entity.get(InvulnerableUntilComponent)
    if (until) until.untilMs = nowMs + PLAYER_DEFEAT_GRACE_MS
    else entity.addComponent(new InvulnerableUntilComponent(nowMs + PLAYER_DEFEAT_GRACE_MS))
    this.logger.info('[DefeatSystem] hero defeated — restored (placeholder game-over)')
  }

  /** The player's runtime entity id, or `null` before the hero spawned. */
  private playerId(scene: Scene): number | null {
    for (const entity of scene.entities) {
      if (entity.get(PlayerComponent)) return entity.id
    }
    return null
  }
}

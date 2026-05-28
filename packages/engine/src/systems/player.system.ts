import {
  Actor,
  type Animation,
  BoundingBox,
  CollisionType,
  type EventEmitter,
  Logger,
  type Scene,
  Shape,
  System,
  SystemType,
  vec,
  type World,
} from 'excalibur'
import {
  PlayerActorComponent,
  PlayerComponent,
  RuntimeModeComponent,
  SpawnOverrideComponent,
  SpawnPointComponent,
  TIER_Z,
  TileTransformComponent,
} from '../components/index.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { SpriteSetResource } from '../resource/SpriteSetResource.ts'
import { buildPlaceholderAnimations } from '../runtime/placeholder-character.ts'
import { buildCharacterAnimations } from '../utils/character.ts'
import {
  isActionPressed,
  type KeyboardLike,
  pickFacing,
  readMovementInput,
  roleFromState,
} from '../utils/player-input.ts'
import type { CharacterAnimationRole, CharacterDefinition, Facing } from '../types/data/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'

const DEFAULT_FACING: Facing = 'down'
const DEFAULT_SPEED_TILES_PER_SEC = 2
const FOOT_COLLIDER_MAX_WIDTH = 12
const FOOT_COLLIDER_HEIGHT = 8

/**
 * Spawns and drives the player Actor.
 *
 * Deliberately consolidated (spawn + input + animation + camera) —
 * the player is the only entity needing this stack and per-NPC
 * separation can be extracted later when NPCs need shared logic.
 * For now, splitting earlier would mean three thin systems that
 * always run together.
 *
 * Lifecycle:
 *
 * - **`initialize` (one-shot)** — locate the spawn tile (override →
 *   spawn-point → camera centre → (0,0)), build the Actor at that
 *   position with a foot-sized collider + `CollisionType.Active`,
 *   attach `PlayerComponent` + `PlayerActorComponent`. The actor
 *   starts hidden (editor mode).
 *
 * - **`update` per tick** — split into phases:
 *   - mode-transition handler (re-spawn on editor → runtime, camera
 *     lock / release)
 *   - visibility (actor visible only in runtime)
 *   - input (runtime only — read keyboard, write velocity + facing)
 *   - animation (role swap when facing or motion state changes)
 *   - tile-change emission (engine event for trigger / walk-on-tile
 *     systems)
 *   - action-button (edge-triggered Space/Enter press)
 *
 * - **Mode transitions** are continuous: the actor's position
 *   persists between Pause → Play → Pause so re-entering runtime
 *   feels seamless. The next Play after the user pans the camera
 *   relocates the actor to the new view (Mario-Maker "play from
 *   here" default).
 */
export class PlayerSystem extends System {
  public readonly systemType = SystemType.Update

  private logger = Logger.getInstance()
  private scene: Scene | null = null
  private player: Actor | null = null
  private playerComponent: PlayerActorComponent | null = null
  private cameraLocked = false
  private hasInitialized = false
  private lastTile: { tileX: number; tileY: number } | null = null
  /** Previous-frame runtime state — drives transition detection. */
  private wasInRuntime = false
  /** Tracks Space/Enter held state for edge-trigger semantics. */
  private actionWasHeld = false

  constructor(
    private readonly mapResource: MapResource,
    private readonly events: EventEmitter<EngineEventMap>,
    private readonly playerCharacter?: CharacterDefinition,
    private readonly playerSpriteSet?: SpriteSetResource,
  ) {
    super()
  }

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    this.scene = scene
    if (this.hasInitialized) return
    this.hasInitialized = true
    void world
    this.spawnPlayer(scene)
  }

  public update(_elapsedMs: number): void {
    const scene = this.scene
    const player = this.player
    const pc = this.playerComponent
    if (!scene || !player || !pc) return

    const inRuntime = SessionState.get(scene, RuntimeModeComponent) !== null

    this.handleModeTransition(scene, player, pc, inRuntime)
    player.graphics.visible = inRuntime

    if (!inRuntime) {
      player.vel.x = 0
      player.vel.y = 0
      return
    }

    const kb = (scene.engine as { input?: { keyboard?: KeyboardLike } })?.input?.keyboard
    if (!kb) return

    this.handleInput(player, pc, kb)
    this.emitTileChangeAndAction(player, pc, kb)
  }

  // ─────────────────────────────────────────────────────────── spawn

  private spawnPlayer(scene: Scene): void {
    const tile = this.resolveSpawnTile(scene)
    const tw = this.mapResource.mapData?.tileWidth ?? 16
    const th = this.mapResource.mapData?.tileHeight ?? 16
    const initialFacing: Facing = tile.facing ?? DEFAULT_FACING

    const resolved = this.resolveCharacterAnimations()
    const actorWidth = resolved.spriteWidth ?? tw
    const actorHeight = resolved.spriteHeight ?? th
    const speedPxPerSec =
      (this.playerCharacter?.speedTilesPerSec ?? DEFAULT_SPEED_TILES_PER_SEC) * tw
    const initialRole: CharacterAnimationRole = `idle-${initialFacing}`

    const actor = new Actor({
      name: 'player',
      x: tile.tileX * tw + tw / 2,
      y: tile.tileY * th + th / 2,
      width: actorWidth,
      height: actorHeight,
      // `Active` actors get pushed back by static tilemap colliders
      // (the ones flagged `tile.solid = true`). Default `Passive`
      // would walk through walls.
      collisionType: CollisionType.Active,
    })

    // Foot-sized collider so the sprite-set's `head` half of a
    // 16×32 sprite doesn't bump tiles directly above the player's
    // standing tile. Anchor stays centered (so spawn math is
    // unchanged); the offset pushes the collider down to where the
    // feet are.
    const footWidth = Math.min(FOOT_COLLIDER_MAX_WIDTH, actorWidth - 2)
    actor.collider.set(
      Shape.Box(
        footWidth,
        FOOT_COLLIDER_HEIGHT,
        vec(0.5, 0.5),
        vec(0, actorHeight / 2 - FOOT_COLLIDER_HEIGHT / 2),
      ),
    )

    actor.addComponent(new PlayerComponent())
    const pc = new PlayerActorComponent(resolved.animations, initialFacing, speedPxPerSec, initialRole)
    actor.addComponent(pc)
    const initialGraphic = resolved.animations[initialRole]
    if (initialGraphic) actor.graphics.use(initialGraphic)
    actor.graphics.visible = false
    // Between hero tier (z=100) and overlay tier (z=200) so canopy
    // sprites draw over the player and decoration sprites draw
    // beside them.
    actor.z = TIER_Z.hero + 50

    scene.add(actor)

    this.player = actor
    this.playerComponent = pc
    this.lastTile = { tileX: tile.tileX, tileY: tile.tileY }
  }

  /** Spawn-tile resolution: override → spawn-point → camera centre → (0,0). */
  private resolveSpawnTile(scene: Scene): { tileX: number; tileY: number; facing?: Facing } {
    const override = SessionState.get(scene, SpawnOverrideComponent)
    if (override) {
      return { tileX: override.tileX, tileY: override.tileY, facing: override.facing }
    }
    const query = scene.world.queryManager.createQuery([SpawnPointComponent, TileTransformComponent])
    const playerSpawn = query.entities.find((e) => e.get(SpawnPointComponent)?.spawnId === 'player')
    if (playerSpawn) {
      const t = playerSpawn.get(TileTransformComponent)
      const s = playerSpawn.get(SpawnPointComponent)
      return { tileX: t?.tileX ?? 0, tileY: t?.tileY ?? 0, facing: s?.facing }
    }
    const camera = scene.camera
    const tw = this.mapResource.mapData?.tileWidth
    const th = this.mapResource.mapData?.tileHeight
    if (camera && tw && th) {
      return {
        tileX: Math.floor(camera.pos.x / tw),
        tileY: Math.floor(camera.pos.y / th),
      }
    }
    this.logger.warn('[PlayerSystem] no spawn point and no camera — defaulting to (0, 0)')
    return { tileX: 0, tileY: 0 }
  }

  /**
   * Resolve the player's animation map. Prefers the configured
   * character; falls back to the procedural placeholder if no
   * character is bound or its sprite-set isn't loaded.
   */
  private resolveCharacterAnimations(): {
    animations: Partial<Record<CharacterAnimationRole, Animation>>
    spriteWidth?: number
    spriteHeight?: number
  } {
    const character = this.playerCharacter
    if (!character) return { animations: buildPlaceholderAnimations() }

    // Sprite-set priority: explicit `playerSpriteSet` first (engine
    // injects this for characters whose sprite-set lives on the
    // project but not on the active map — e.g. the bundled
    // scientist), then map-level lookup.
    const spriteSet = this.playerSpriteSet ?? this.mapResource.getSpriteSetResource(character.spriteSetId)
    const built = buildCharacterAnimations(character, spriteSet)
    if (!built) {
      this.logger.warn(
        `[PlayerSystem] character ${character.id} references unknown spriteSetId "${character.spriteSetId}" — placeholder`,
      )
      return { animations: buildPlaceholderAnimations() }
    }
    return built
  }

  // ────────────────────────────────────────────────────── tick phases

  /**
   * On editor → runtime: relocate the player to the current spawn
   * target and lock the camera. On runtime → editor: release the
   * camera. Position is preserved between toggles, so Pause → Play
   * with the camera elsewhere now relocates.
   */
  private handleModeTransition(scene: Scene, player: Actor, pc: PlayerActorComponent, inRuntime: boolean): void {
    if (inRuntime && !this.wasInRuntime) {
      const tile = this.resolveSpawnTile(scene)
      const tw = this.mapResource.mapData?.tileWidth ?? 16
      const th = this.mapResource.mapData?.tileHeight ?? 16
      player.pos.x = tile.tileX * tw + tw / 2
      player.pos.y = tile.tileY * th + th / 2
      pc.facing = tile.facing ?? pc.facing
      const role: CharacterAnimationRole = `idle-${pc.facing}`
      const initialGraphic = pc.animationsByRole[role]
      if (initialGraphic) player.graphics.use(initialGraphic)
      pc.currentRole = role
      this.lastTile = { tileX: tile.tileX, tileY: tile.tileY }
    }
    this.wasInRuntime = inRuntime

    if (inRuntime && !this.cameraLocked) {
      this.lockCamera(scene, player)
      this.cameraLocked = true
    } else if (!inRuntime && this.cameraLocked) {
      scene.camera.clearAllStrategies()
      this.cameraLocked = false
    }
  }

  private lockCamera(scene: Scene, player: Actor): void {
    try {
      scene.camera.strategy.lockToActor(player)
      const mapData = this.mapResource.mapData
      if (!mapData) return
      const tw = mapData.tileWidth ?? 16
      const th = mapData.tileHeight ?? 16
      const bb = new BoundingBox({
        left: 0,
        top: 0,
        right: mapData.columns * tw,
        bottom: mapData.rows * th,
      })
      scene.camera.strategy.limitCameraBounds(bb)
    } catch (err) {
      this.logger.warn('[PlayerSystem] camera lockToActor failed:', err)
    }
  }

  /**
   * Read input, write velocity, swap animation role on facing /
   * motion-state change. Animation role only swaps when it
   * *changes* so we don't restart the Animation's frame cursor
   * every tick.
   */
  private handleInput(player: Actor, pc: PlayerActorComponent, kb: KeyboardLike): void {
    const { dx, dy } = readMovementInput(kb)
    const moving = dx !== 0 || dy !== 0

    player.vel.x = dx * pc.speedPxPerSec
    player.vel.y = dy * pc.speedPxPerSec

    if (moving) pc.facing = pickFacing(dx, dy, pc.facing)

    const role = roleFromState(pc.facing, moving)
    if (role !== pc.currentRole) {
      const anim = pc.animationsByRole[role]
      if (anim) {
        player.graphics.use(anim)
        pc.currentRole = role
      }
    }
  }

  /**
   * Emit `PLAYER_TILE_CHANGED` on tile-boundary crossings + edge-
   * triggered `PLAYER_ACTION_PRESSED` on Space/Enter. Both are
   * consumed by `TriggerSystem` + `WalkOnTileSystem` to fire
   * walk-onto / action-button game events.
   */
  private emitTileChangeAndAction(player: Actor, pc: PlayerActorComponent, kb: KeyboardLike): void {
    const tw = this.mapResource.mapData?.tileWidth ?? 16
    const th = this.mapResource.mapData?.tileHeight ?? 16
    const tileX = Math.floor(player.pos.x / tw)
    const tileY = Math.floor(player.pos.y / th)

    if (!this.lastTile || this.lastTile.tileX !== tileX || this.lastTile.tileY !== tileY) {
      const previous = this.lastTile ? { ...this.lastTile } : null
      this.lastTile = { tileX, tileY }
      this.events.emit(EngineEvent.PLAYER_TILE_CHANGED, { tileX, tileY, previous, facing: pc.facing })
    }

    if (isActionPressed(kb)) {
      if (!this.actionWasHeld) {
        this.actionWasHeld = true
        this.events.emit(EngineEvent.PLAYER_ACTION_PRESSED, { tileX, tileY, facing: pc.facing })
      }
    } else {
      this.actionWasHeld = false
    }
  }
}

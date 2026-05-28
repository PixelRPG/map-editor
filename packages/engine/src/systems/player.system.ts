import {
  Actor,
  Animation,
  AnimationStrategy,
  BoundingBox,
  CollisionType,
  type EventEmitter,
  Keys,
  Logger,
  type Scene,
  Shape,
  type Sprite,
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
import type {
  CharacterAnimation,
  CharacterAnimationRole,
  CharacterDefinition,
  Facing,
} from '../types/data/index.ts'
import { REQUIRED_ROLES } from '../types/data/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'

const DEFAULT_FACING: Facing = 'down'
const DEFAULT_SPEED_TILES_PER_SEC = 4

/**
 * Spawns and drives the player Actor.
 *
 * Responsibilities (deliberately consolidated in a single system — the
 * player is the one entity here and over-decomposition is YAGNI until
 * NPCs need shared animation/movement logic):
 *
 * - **Spawn on scene activate**: locate the spawn tile —
 *   {@link SpawnOverrideComponent} on the session singleton if present
 *   ("play from here"), otherwise the `kind: 'spawn-point'` placement
 *   with `spawnId === 'player'`. Build an `Actor`, attach the placeholder
 *   role-indexed animations (Phase 2 swaps for the configured character),
 *   add it to the scene hidden.
 *
 * - **Per tick (Runtime mode only)**: read held keyboard state, derive a
 *   direction vector, write velocity, update `facing` from dominant
 *   axis, swap the active animation by role only when role changes
 *   (idempotent — preserves Animation frame cursor). Emit
 *   `PLAYER_TILE_CHANGED` whenever the player's tile-grid position
 *   changes so `TriggerSystem` + `WalkOnTileSystem` keep working.
 *
 * - **Mode transitions**: hidden in Editor mode (the spawn-point's
 *   coloured outline marker is the editor-time signifier; this Actor
 *   only appears once the user clicks Play). Camera locks to the actor
 *   on Runtime entry, releases on Runtime exit. Actor position is
 *   continuous between toggles so re-entering Runtime feels seamless.
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
  /** Previous-frame runtime-mode state so we can detect transitions. */
  private wasInRuntime = false

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
    this.spawnPlayer(world, scene)
  }

  public update(elapsedMs: number): void {
    const scene = this.scene
    const player = this.player
    const pc = this.playerComponent
    if (!scene || !player || !pc) return

    const inRuntime = SessionState.get(scene, RuntimeModeComponent) !== null

    // Mario-Maker "Play from here": every transition from editor →
    // runtime re-positions the player at the current spawn target
    // (override > spawn-point > camera center). This makes Play feel
    // like "start playtest at where I'm looking", not "respawn at
    // some hidden origin". Pause → Play → Pause keeps the camera
    // wherever the player ended up; the next Play after the user
    // pans elsewhere relocates the actor to the new view.
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

    // Visibility tracks mode. The spawn-point's outline marker (from
    // ObjectSpawnSystem) is the editor-time signifier; the player actor
    // only shows up once the user clicks Play.
    player.graphics.visible = inRuntime

    // Camera follow: lock on Runtime entry, release on exit. Bound
    // the camera to the map's pixel rectangle so the hero can walk to
    // the edge without revealing the void outside the map.
    if (inRuntime && !this.cameraLocked) {
      try {
        scene.camera.strategy.lockToActor(player)
        const mapData = this.mapResource.mapData
        if (mapData) {
          const tw = mapData.tileWidth ?? 16
          const th = mapData.tileHeight ?? 16
          const bb = new BoundingBox({
            left: 0,
            top: 0,
            right: mapData.columns * tw,
            bottom: mapData.rows * th,
          })
          scene.camera.strategy.limitCameraBounds(bb)
        }
      } catch (err) {
        this.logger.warn('[PlayerSystem] camera lockToActor failed:', err)
      }
      this.cameraLocked = true
    } else if (!inRuntime && this.cameraLocked) {
      scene.camera.clearAllStrategies()
      this.cameraLocked = false
    }

    if (!inRuntime) {
      // Editor mode — stop the actor, leave its position alone, no input.
      player.vel.x = 0
      player.vel.y = 0
      return
    }

    // --- Runtime input ---
    const kb = (scene.engine as { input?: { keyboard?: { isHeld: (k: Keys) => boolean } } })?.input?.keyboard
    if (!kb) return

    let dx = 0
    let dy = 0
    if (kb.isHeld(Keys.Up) || kb.isHeld(Keys.W)) dy -= 1
    if (kb.isHeld(Keys.Down) || kb.isHeld(Keys.S)) dy += 1
    if (kb.isHeld(Keys.Left) || kb.isHeld(Keys.A)) dx -= 1
    if (kb.isHeld(Keys.Right) || kb.isHeld(Keys.D)) dx += 1

    // Normalise diagonals so going NE isn't sqrt(2)× faster than going N.
    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2
      dx *= inv
      dy *= inv
    }

    const moving = dx !== 0 || dy !== 0
    // Velocity-only — Excalibur's ArcadeSolver handles collision with
    // solid tilemap tiles. The player Actor has
    // `CollisionType.Active` + a foot-sized collider; tiles flagged
    // `tile.solid = true` (set in MapResource based on the sprite-set
    // definition's `solid` flag) push the actor back during the
    // physics integrator's per-axis sweep. No manual tile probe
    // needed — Excalibur slides along walls for free.
    const tw = this.mapResource.mapData?.tileWidth ?? 16
    const th = this.mapResource.mapData?.tileHeight ?? 16
    player.vel.x = dx * pc.speedPxPerSec
    player.vel.y = dy * pc.speedPxPerSec

    // Facing: prefer the dominant axis; ties favour vertical so up/down
    // walk animations dominate over the diagonal horizontal twitch.
    if (moving) {
      pc.facing = pickFacing(dx, dy, pc.facing)
    }

    const role: CharacterAnimationRole = moving ? `walk-${pc.facing}` : `idle-${pc.facing}`
    if (role !== pc.currentRole) {
      const anim = pc.animationsByRole[role]
      if (anim) {
        player.graphics.use(anim)
        pc.currentRole = role
      }
    }

    // Emit PLAYER_TILE_CHANGED when the actor crosses a tile boundary
    // so trigger / walk-on-tile systems keep firing.
    const tileX = Math.floor(player.pos.x / tw)
    const tileY = Math.floor(player.pos.y / th)
    if (!this.lastTile || this.lastTile.tileX !== tileX || this.lastTile.tileY !== tileY) {
      const previous = this.lastTile ? { ...this.lastTile } : null
      this.lastTile = { tileX, tileY }
      this.events.emit(EngineEvent.PLAYER_TILE_CHANGED, {
        tileX,
        tileY,
        previous,
        facing: pc.facing,
      })
    }

    // Action button — Space / Enter — emits PLAYER_ACTION_PRESSED once
    // per press. Use wasPressed semantics by tracking the previous state
    // ourselves; Excalibur's `wasPressed` exists but isn't typed here.
    if (kb.isHeld(Keys.Space) || kb.isHeld(Keys.Enter)) {
      if (!this.actionWasHeld) {
        this.actionWasHeld = true
        this.events.emit(EngineEvent.PLAYER_ACTION_PRESSED, {
          tileX,
          tileY,
          facing: pc.facing,
        })
      }
    } else {
      this.actionWasHeld = false
    }
    void elapsedMs
  }

  private actionWasHeld = false

  private spawnPlayer(world: World, scene: Scene): void {
    // World param kept for future per-system query needs; spawn lookup
    // currently routes through scene + mapResource.
    void world
    const tile = this.resolveSpawnTile(scene)
    const tw = this.mapResource.mapData?.tileWidth ?? 16
    const th = this.mapResource.mapData?.tileHeight ?? 16
    const initialFacing: Facing = tile.facing ?? DEFAULT_FACING

    // Prefer the configured player character's sprite + animations
    // when available — falls back to the procedural placeholder so
    // playtest is never blocked by missing Cast setup.
    const resolved = this.resolveCharacterAnimations()
    const animations = resolved.animations
    const actorWidth = resolved.spriteWidth ?? tw
    const actorHeight = resolved.spriteHeight ?? th
    const speedTilesPerSec = this.playerCharacter?.speedTilesPerSec ?? DEFAULT_SPEED_TILES_PER_SEC
    const speedPxPerSec = speedTilesPerSec * tw

    const initialRole: CharacterAnimationRole = `idle-${initialFacing}`

    const actor = new Actor({
      name: 'player',
      x: tile.tileX * tw + tw / 2,
      y: tile.tileY * th + th / 2,
      width: actorWidth,
      height: actorHeight,
      // `Active` actors are pushed back by static colliders (the
      // tilemap's `tile.solid = true` ones). Without this Excalibur's
      // physics integrator never resolves collisions for the actor —
      // it would happily walk through walls. The default
      // `CollisionType.Passive` is for pass-through triggers, not
      // characters that should respect obstacles.
      collisionType: CollisionType.Active,
    })

    // Replace the default sprite-sized collider with a foot box: a
    // narrow rectangle sitting at the bottom of the actor. Inspired
    // by PixelRPG/excalibur-version's character actor (width 12 /
    // height 12 / anchor 0.5,1) — same intent, but here we keep the
    // actor's center anchor (so spawn math stays unchanged) and push
    // the collider DOWN to the feet via an offset.
    //
    // Why feet-only:
    //   - The scientist sprite is 16×32 — a sprite-sized 16×32
    //     collider would overlap any solid tile directly above the
    //     player's feet (head bumps obstacles you should walk past).
    //   - "Feet-only" matches the player's mental model of where the
    //     character "is" — top-down RPGs treat the bottom row of
    //     pixels as the position.
    const footWidth = Math.min(12, actorWidth - 2)
    const footHeight = 8
    actor.collider.set(Shape.Box(footWidth, footHeight, vec(0.5, 0.5), vec(0, actorHeight / 2 - footHeight / 2)))

    actor.addComponent(new PlayerComponent())
    const pc = new PlayerActorComponent(animations, initialFacing, speedPxPerSec, initialRole)
    actor.addComponent(pc)
    const initialGraphic = animations[initialRole]
    if (initialGraphic) actor.graphics.use(initialGraphic)
    actor.graphics.visible = false // hidden until Runtime mode
    // Place the actor BETWEEN the hero tier (z=100) and the overlay
    // tier (z=200) so:
    //   - Hero-tier decorations (rocks, signs) draw side-by-side with
    //     the player at their natural z.
    //   - Overlay-tier sprites (treetops, ceiling canopies) draw ABOVE
    //     the player → the player walks "underneath" them, the
    //     classic top-down RPG depth illusion.
    actor.z = TIER_Z.hero + 50

    scene.add(actor)

    this.player = actor
    this.playerComponent = pc
    this.lastTile = { tileX: tile.tileX, tileY: tile.tileY }
  }

  /**
   * Build the role-indexed animation map for the player actor. If a
   * {@link CharacterDefinition} was passed in *and* its sprite-set is
   * loaded, use the character's frame timeline. Otherwise fall back
   * to the procedural placeholder (8 colored squares with a walk-bob).
   *
   * Returns the animation map plus the sprite dimensions inferred from
   * the sprite-set (so the actor's width/height matches the character —
   * the scientist is 16×32 while the placeholder is 16×16).
   */
  private resolveCharacterAnimations(): {
    animations: Partial<Record<CharacterAnimationRole, Animation>>
    spriteWidth?: number
    spriteHeight?: number
  } {
    const character = this.playerCharacter
    if (!character) {
      return { animations: buildPlaceholderAnimations() }
    }
    // Sprite-set resolution priority:
    //   1. `playerSpriteSet` passed in by the engine — set when the
    //      character's sprite-set lives on the project but not on the
    //      map (e.g. the bundled scientist, since maps only declare
    //      the sprite-sets their tiles use).
    //   2. `mapResource.getSpriteSetResource` — for characters that
    //      share a sprite-set with the map's tiles.
    const spriteSet =
      this.playerSpriteSet ?? this.mapResource.getSpriteSetResource(character.spriteSetId)
    if (!spriteSet) {
      this.logger.warn(
        `[PlayerSystem] character ${character.id} references unknown spriteSetId "${character.spriteSetId}" — falling back to placeholder`,
      )
      return { animations: buildPlaceholderAnimations() }
    }

    const animations: Partial<Record<CharacterAnimationRole, Animation>> = {}
    for (const anim of character.animations) {
      if (!REQUIRED_ROLES.includes(anim.id as CharacterAnimationRole)) continue
      const built = this.buildAnimationFromCharacter(anim, spriteSet.sprites)
      if (built) animations[anim.id as CharacterAnimationRole] = built
    }

    // Plug holes with the placeholder so the controller can always
    // swap to *some* graphic when a role transition happens — better
    // than freezing the actor mid-walk if the user hasn't defined all
    // 8 required animations yet.
    const placeholder = buildPlaceholderAnimations()
    for (const role of REQUIRED_ROLES) {
      if (!animations[role]) animations[role] = placeholder[role]
    }

    return {
      animations,
      spriteWidth: spriteSet.data?.spriteWidth,
      spriteHeight: spriteSet.data?.spriteHeight,
    }
  }

  private buildAnimationFromCharacter(
    anim: CharacterAnimation,
    sprites: Record<number, Sprite>,
  ): Animation | null {
    const frames = anim.frames
      .map((spriteId) => sprites[spriteId])
      .filter((s): s is Sprite => s != null)
      .map((sprite) => ({ graphic: sprite.clone(), duration: anim.durationMs }))
    if (frames.length === 0) return null
    return new Animation({
      frames,
      strategy: (anim.loop ?? true) ? AnimationStrategy.Loop : AnimationStrategy.End,
    })
  }

  /**
   * Resolve the spawn tile. Priority:
   *
   *   1. {@link SpawnOverrideComponent} on the session singleton —
   *      explicit "play from here" set by the host (right-click a
   *      tile → Play from here, etc.).
   *   2. Map's `spawn-point` placement with `spawnId === 'player'`.
   *   3. **Camera center** — Mario-Maker convenience so playtest
   *      starts where the editor user is currently looking, not at
   *      the map origin. Read live from the active scene's camera
   *      pos each time so panning between Plays moves the spawn
   *      with it.
   *   4. `(0, 0)` final fallback if even the camera isn't usable.
   */
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
}

/**
 * Choose the facing direction from the input vector. Prefers the
 * dominant axis (greater absolute component wins). On exact ties
 * (perfect diagonal), keep the previous facing — this prevents
 * "flickering" between two facings when the user holds two keys
 * exactly.
 */
function pickFacing(dx: number, dy: number, previous: Facing): Facing {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax === 0 && ay === 0) return previous
  if (ay > ax) return dy < 0 ? 'up' : 'down'
  if (ax > ay) return dx < 0 ? 'left' : 'right'
  return previous
}

/**
 * `combat-action` end to end: swing, damage, hearts, defeat, drop,
 * respawn — the loop a player actually experiences, driven through the
 * same event bus the shipped systems use.
 *
 * The rig deliberately assembles the five ECS systems in the order the
 * game system registers them, because that order is load-bearing:
 * `MeleeAttackSystem` advances the clock the rest read, and
 * `KnockbackSystem` re-asserts velocity after the movement writers.
 */

import { describe, expect, it } from '@gjsify/unit'
import { Actor, EventEmitter, Scene, vec } from 'excalibur'
import { CombatSessionComponent } from '../components/combat-session.component.ts'
import { HostileRuntimeComponent } from '../components/hostile-runtime.component.ts'
import { HudHeartComponent } from '../components/hud-heart.component.ts'
import { InputSourceComponent } from '../components/input-source.component.ts'
import { InvulnerableUntilComponent } from '../components/invulnerable-until.component.ts'
import { ItemComponent } from '../components/item.component.ts'
import { KnockbackComponent } from '../components/knockback.component.ts'
import { PlacementIdComponent } from '../components/placement-id.component.ts'
import { PlayerActorComponent, PlayerComponent } from '../components/player-actor.component.ts'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import { StatsRuntimeComponent } from '../components/stats-runtime.component.ts'
import { TileTransformComponent } from '../components/tile-transform.component.ts'
import { buildHostileComponent } from '../entity/specs/hostile.ts'
import { buildInvulnerableComponent } from '../entity/specs/invulnerable.ts'
import { buildStatsComponent } from '../entity/specs/stats.ts'
import { buildWeaponComponent } from '../entity/specs/weapon.ts'
import { HurtboxComponent } from '../components/hurtbox.component.ts'
import { MovementComponent } from '../components/movement.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { Facing, ObjectPlacement } from '../types/data/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { swingBox } from '../utils/combat.ts'
import { SessionState } from '../utils/session-state.ts'
import { DefeatSystem } from './defeat.system.ts'
import { HostileAiSystem } from './hostile-ai.system.ts'
import { HEART_POINTS, HudSystem } from './hud.system.ts'
import { KnockbackSystem } from './knockback.system.ts'
import { MeleeAttackSystem } from './melee-attack.system.ts'
import { StatsSystem } from './stats.system.ts'

const TILE = 16

/**
 * Rasterising a graphic needs a canvas. GJS — the production runtime —
 * has one; the Node leg of the suite does not, so the systems and
 * assertions that draw are skipped there rather than faked. Same guard
 * `spawn-placement.spec.ts` and `placement-graphic.spec.ts` use.
 */
const DOM_AVAILABLE = typeof document !== 'undefined'

interface RigOptions {
  /** Where the slime stands, in tiles, relative to a hero at (2,2). */
  hostileTile?: { x: number; y: number }
  hostileHp?: number
  behaviour?: 'stationary' | 'patrol' | 'chase'
  dropItemId?: string
  dropChance?: number
  respawn?: boolean
  heroFacing?: Facing
  heroMaxHp?: number
  contactDamage?: number
  weaponDamage?: number
  reachTiles?: number
}

/**
 * A hero at tile (2,2) facing right, a slime one tile to its right, and
 * the whole `combat-action` stack initialised over a two-layer map with
 * the slime registered as a real placement (so respawn has something to
 * rebuild from).
 */
function rig(options: RigOptions = {}) {
  const hostileTile = options.hostileTile ?? { x: 3, y: 2 }
  const placement: ObjectPlacement = {
    id: 'slime-1',
    layerId: 'objects',
    tileX: hostileTile.x,
    tileY: hostileTile.y,
    defId: 'slime',
  }
  const mapResource = {
    mapData: {
      tileWidth: TILE,
      tileHeight: TILE,
      columns: 16,
      rows: 16,
      layers: [{ id: 'objects', tier: 'hero', visible: true }],
      objectPlacements: [placement],
    },
    getSpriteSetResource: () => undefined,
  } as unknown as MapResource

  const entityLibrary = [
    {
      id: 'slime',
      name: 'Slime',
      components: [
        { type: 'movement', tilesPerSec: 2 },
        { type: 'stats', maxHp: options.hostileHp ?? 2 },
        { type: 'hostile', behaviour: options.behaviour ?? 'chase' },
        { type: 'hurtbox' },
      ],
    },
  ]

  const events = new EventEmitter<EngineEventMap>()
  const scene = new Scene()
  SessionState.set(scene, new RuntimeModeComponent())
  const input = new InputSourceComponent()
  SessionState.set(scene, input)

  const hero = new Actor({ name: 'player', x: 2 * TILE + TILE / 2, y: 2 * TILE + TILE / 2, width: TILE, height: TILE })
  hero.addComponent(new PlayerComponent())
  hero.addComponent(new PlayerActorComponent({}, options.heroFacing ?? 'right', 6 * TILE, 'idle-right'))
  hero.addComponent(buildStatsComponent({ type: 'stats', maxHp: options.heroMaxHp ?? 3, attack: 0 }))
  hero.addComponent(
    buildWeaponComponent({
      type: 'weapon',
      damage: options.weaponDamage ?? 1,
      reachTiles: options.reachTiles ?? 1,
      swingMs: 250,
    }),
  )
  hero.addComponent(new HurtboxComponent())
  hero.addComponent(buildInvulnerableComponent({ type: 'invulnerable', afterHitMs: 800 }))
  scene.add(hero)

  const slime = makeSlime(scene, placement, options)

  const systems = [
    new StatsSystem(events),
    new MeleeAttackSystem(mapResource, events),
    new HostileAiSystem(mapResource, events),
    new KnockbackSystem(mapResource, events),
    new DefeatSystem(mapResource, events, entityLibrary as never),
    ...(DOM_AVAILABLE ? [new HudSystem()] : []),
  ]
  for (const system of systems) system.initialize(scene.world, scene)

  const seen: string[] = []
  events.on(EngineEvent.DAMAGE_DEALT, (p) => seen.push(`dmg:${p.targetId}:${p.amount}`))
  events.on(EngineEvent.ENTITY_DEFEATED, (p) => seen.push(`defeat:${p.entityId}`))
  events.on(EngineEvent.LEVEL_UP, (p) => seen.push(`level:${p.level}`))

  /**
   * Advance every system one frame, in registration order, then drain the
   * deferred entity removals the way `Scene.update` does — removal is
   * deferred on purpose (a damage source is iterating a query when it
   * emits, and pulling an entity out from under that loop is how you get
   * a skipped enemy), so a rig that never drains would see defeated
   * hostiles linger for ever.
   */
  const tick = (ms = 16) => {
    for (const system of systems) system.update(ms)
    scene.world.entityManager.processEntityRemovals()
  }
  /** Press and release the attack button across two frames. */
  const swing = () => {
    input.attackHeld = true
    tick()
    input.attackHeld = false
    tick()
  }
  const session = () => SessionState.get(scene, CombatSessionComponent)
  const hearts = () => [...scene.entities].filter((e) => e.get(HudHeartComponent))
  const drops = () => [...scene.entities].filter((e) => e.get(ItemComponent))
  const hostiles = () => [...scene.entities].filter((e) => e.get(PlacementIdComponent)?.id === 'slime-1')

  return { events, scene, hero, slime, input, seen, tick, swing, session, hearts, drops, hostiles, systems }
}

/** Build the slime actor from the same data the library carries. */
function makeSlime(scene: Scene, placement: ObjectPlacement, options: RigOptions): Actor {
  const slime = new Actor({
    name: 'slime',
    x: placement.tileX * TILE + TILE / 2,
    y: placement.tileY * TILE + TILE / 2,
    width: TILE,
    height: TILE,
  })
  slime.addComponent(new TileTransformComponent(placement.tileX, placement.tileY, placement.layerId))
  slime.addComponent(new PlacementIdComponent(placement.id))
  slime.addComponent(new MovementComponent(2))
  slime.addComponent(buildStatsComponent({ type: 'stats', maxHp: options.hostileHp ?? 2 }))
  slime.addComponent(
    buildHostileComponent({
      type: 'hostile',
      behaviour: options.behaviour ?? 'chase',
      contactDamage: options.contactDamage ?? 1,
      dropItemId: options.dropItemId,
      dropChance: options.dropChance,
      respawn: options.respawn,
      attackEveryMs: 1000,
    }),
  )
  slime.addComponent(new HurtboxComponent())
  scene.add(slime)
  return slime
}

export default async () => {
  await describe('combat-action — the hero swings', async () => {
    await it('hits what is in front and takes its hit points', async () => {
      const { swing, slime, tick } = rig({ hostileHp: 3 })
      tick()
      expect(slime.get(StatsRuntimeComponent)?.hp).toBe(3)
      swing()
      expect(slime.get(StatsRuntimeComponent)?.hp).toBe(2)
    })

    await it('misses what is behind it', async () => {
      // The swing box starts at the hero's edge and runs along the
      // facing, so a slime standing behind is untouched however close.
      const { swing, slime, tick } = rig({ heroFacing: 'left', hostileHp: 3 })
      tick()
      swing()
      expect(slime.get(StatsRuntimeComponent)?.hp).toBe(3)
    })

    await it('misses what is out of reach, and reaches it with a longer weapon', async () => {
      const short = rig({ hostileTile: { x: 4, y: 2 }, hostileHp: 3, reachTiles: 1 })
      short.tick()
      short.swing()
      expect(short.slime.get(StatsRuntimeComponent)?.hp).toBe(3)

      const long = rig({ hostileTile: { x: 4, y: 2 }, hostileHp: 3, reachTiles: 3 })
      long.tick()
      long.swing()
      expect(long.slime.get(StatsRuntimeComponent)?.hp).toBe(2)
    })

    await it('needs a fresh press, not a held button', async () => {
      // Holding X must not machine-gun: the edge is what fires, and the
      // cooldown is what spaces the swings out.
      const { input, tick, slime } = rig({ hostileHp: 9 })
      tick()
      input.attackHeld = true
      tick()
      tick()
      tick()
      expect(slime.get(StatsRuntimeComponent)?.hp).toBe(8)
    })

    await it('respects the swing cooldown between presses', async () => {
      const { swing, tick, slime } = rig({ hostileHp: 9 })
      tick()
      swing()
      swing() // still inside the 250 ms cooldown
      expect(slime.get(StatsRuntimeComponent)?.hp).toBe(8)
      for (let frame = 0; frame < 20; frame += 1) tick()
      swing()
      expect(slime.get(StatsRuntimeComponent)?.hp).toBe(7)
    })

    await it('never hits the hero holding the weapon', async () => {
      const { swing, hero, tick } = rig()
      tick()
      swing()
      expect(hero.get(StatsRuntimeComponent)?.hp).toBe(3)
    })

    await it('does nothing at all outside runtime mode', async () => {
      const { scene, swing, slime, tick } = rig({ hostileHp: 3 })
      tick()
      SessionState.unset(scene, RuntimeModeComponent)
      swing()
      expect(slime.get(StatsRuntimeComponent)?.hp).toBe(3)
    })
  })

  await describe('combat-action — the hostile fights back', async () => {
    await it('chases the player and stops when it is out of aggro range', async () => {
      const near = rig({ hostileTile: { x: 5, y: 2 }, behaviour: 'chase' })
      near.tick()
      expect(near.slime.vel.x < 0).toBe(true) // walking left, toward the hero

      const far = rig({ hostileTile: { x: 12, y: 2 }, behaviour: 'chase' })
      far.tick()
      expect(far.slime.vel.x).toBe(0)
      expect(far.slime.vel.y).toBe(0)
    })

    await it('stands still when it is stationary, however close the hero is', async () => {
      const { slime, tick } = rig({ behaviour: 'stationary' })
      tick()
      expect(slime.vel.x).toBe(0)
      expect(slime.vel.y).toBe(0)
    })

    await it('resolves its speed from `movement` rather than a field of its own', async () => {
      const { slime, tick } = rig({ hostileTile: { x: 5, y: 2 } })
      tick()
      expect(slime.get(HostileRuntimeComponent)?.speedPxPerSec).toBe(2 * TILE)
      expect(Math.round(Math.hypot(slime.vel.x, slime.vel.y))).toBe(2 * TILE)
    })

    await it('hurts the hero on contact, then honours the grace period', async () => {
      const { hero, tick, seen } = rig({ hostileTile: { x: 2, y: 2 }, behaviour: 'stationary' })
      tick()
      expect(hero.get(StatsRuntimeComponent)?.hp).toBe(2)
      // Standing on the hero must not drain the row: i-frames gate it.
      for (let frame = 0; frame < 10; frame += 1) tick()
      expect(hero.get(StatsRuntimeComponent)?.hp).toBe(2)
      expect(seen.filter((entry) => entry.startsWith('dmg:')).length).toBe(1)
    })

    await it('leaves a hero with no hurtbox alone', async () => {
      const { hero, tick } = rig({ hostileTile: { x: 2, y: 2 }, behaviour: 'stationary' })
      hero.removeComponent(HurtboxComponent, true)
      tick()
      expect(hero.get(StatsRuntimeComponent)?.hp).toBe(3)
    })
  })

  await describe('combat-action — the hit reaction', async () => {
    await it('pushes the target away from whatever hit it', async () => {
      const { swing, slime, tick } = rig({ hostileHp: 3 })
      tick()
      swing()
      expect(slime.get(KnockbackComponent)).toBeDefined()
      // The hero faces right, so the slime is thrown further right.
      expect((slime.get(KnockbackComponent)?.velX ?? 0) > 0).toBe(true)
    })

    await it('grants and then expires the grace period', async () => {
      const { hero, tick } = rig({ hostileTile: { x: 2, y: 2 }, behaviour: 'stationary' })
      tick()
      expect(hero.get(InvulnerableUntilComponent)).toBeDefined()
      // 800 ms of i-frames at 16 ms a frame.
      for (let frame = 0; frame < 60; frame += 1) tick()
      expect(hero.get(InvulnerableUntilComponent)).toBeUndefined()
    })

    await it('lets the pushback expire and hands movement back', async () => {
      const { swing, slime, tick } = rig({ hostileHp: 3, behaviour: 'stationary' })
      tick()
      swing()
      for (let frame = 0; frame < 15; frame += 1) tick()
      expect(slime.get(KnockbackComponent)).toBeUndefined()
    })
  })

  await describe('combat-action — defeat, drops and respawn', async () => {
    await it('removes the hostile and pays out experience', async () => {
      const { swing, tick, seen, hostiles } = rig({ hostileHp: 1 })
      tick()
      swing()
      expect(seen.some((entry) => entry.startsWith('defeat:'))).toBe(true)
      tick()
      expect(hostiles().length).toBe(0)
      // One slime is worth one point, and the hero needs ten to level.
      expect(seen.filter((entry) => entry.startsWith('level:')).length).toBe(0)
    })

    await it('drops its item where it fell', async () => {
      if (!DOM_AVAILABLE) return
      const { swing, tick, drops } = rig({ hostileHp: 1, dropItemId: 'heart', dropChance: 1 })
      tick()
      swing()
      tick()
      expect(drops().length).toBe(1)
      expect(drops()[0]?.get(ItemComponent)?.itemId).toBe('heart')
      expect(drops()[0]?.get(TileTransformComponent)?.tileX).toBe(3)
    })

    await it('drops nothing when the roll misses', async () => {
      const { swing, tick, drops } = rig({ hostileHp: 1, dropItemId: 'heart', dropChance: 0 })
      tick()
      swing()
      tick()
      expect(drops().length).toBe(0)
    })

    await it('brings the hostile back from its placement when told to', async () => {
      if (!DOM_AVAILABLE) return
      const { swing, tick, hostiles } = rig({ hostileHp: 1, respawn: true })
      tick()
      swing()
      tick()
      expect(hostiles().length).toBe(0)
      // Five seconds at 16 ms a frame, with margin.
      for (let frame = 0; frame < 330; frame += 1) tick()
      expect(hostiles().length).toBe(1)
    })

    await it('leaves it dead when the author said so', async () => {
      const { swing, tick, hostiles } = rig({ hostileHp: 1, respawn: false })
      tick()
      swing()
      for (let frame = 0; frame < 330; frame += 1) tick()
      expect(hostiles().length).toBe(0)
    })

    await it('restores the hero instead of dead-ending the playtest', async () => {
      // Placeholder game-over — deliberately not a real one, which needs
      // save-state that survives a scene load (TODO.md).
      const { hero, events, tick } = rig({ heroMaxHp: 2 })
      tick()
      events.emit(EngineEvent.DAMAGE_DEALT, { targetId: hero.id, amount: 99 })
      expect(hero.get(StatsRuntimeComponent)?.hp).toBe(2)
      expect(hero.get(InvulnerableUntilComponent)).toBeDefined()
    })
  })

  await describe('combat-action — the session state', async () => {
    await it('advances one shared clock, and freezes it outside play', async () => {
      const { scene, session, tick } = rig()
      tick(100)
      expect(session()?.nowMs).toBe(100)
      SessionState.unset(scene, RuntimeModeComponent)
      tick(100)
      expect(session()?.nowMs).toBe(100)
    })

    await it('forgets a half-pressed button across a pause', async () => {
      // Otherwise the release that happened while paused would register
      // as a press the moment Play resumes.
      const { scene, input, session, tick } = rig()
      input.attackHeld = true
      tick()
      expect(session()?.attackWasHeld).toBe(true)
      SessionState.unset(scene, RuntimeModeComponent)
      tick()
      expect(session()?.attackWasHeld).toBe(false)
    })
  })

  await describe('combat-action — the heart row', async () => {
    await it('draws one heart per point of the hero maximum', async () => {
      if (!DOM_AVAILABLE) return
      const { hearts, tick } = rig({ heroMaxHp: 4 })
      tick()
      expect(hearts().length).toBe(4)
    })

    await it('is empty while the map is being edited', async () => {
      if (!DOM_AVAILABLE) return
      const { scene, hearts, tick } = rig({ heroMaxHp: 3 })
      tick()
      SessionState.unset(scene, RuntimeModeComponent)
      tick()
      for (const heart of hearts()) expect((heart as Actor).graphics.visible).toBe(false)
    })

    await it('grows the row when a level-up raises the maximum', async () => {
      if (!DOM_AVAILABLE) return
      const { hero, events, hearts, tick } = rig({ heroMaxHp: 3 })
      tick()
      expect(hearts().length).toBe(3)
      events.emit(EngineEvent.EXPERIENCE_GAINED, { entityId: hero.id, amount: 100 })
      tick()
      expect(hearts().length > 3).toBe(true)
    })
  })

  await describe('combat-action — the HUD raster', async () => {
    await it('describes the heart on whole pixels', async () => {
      // Excalibur sizes a Polygon's raster from its points
      // (`width = maxX - minX`). Fractional points therefore ask for a
      // bitmap 20.7 pixels wide, which under GJS throws inside
      // `getImageData` mid-frame and kills the render loop — the game
      // stops drawing because of the health bar. Caught only by running
      // it, so it is pinned here rather than left to the next reader.
      for (const point of HEART_POINTS) {
        expect(Number.isInteger(point.x)).toBe(true)
        expect(Number.isInteger(point.y)).toBe(true)
      }
      const width = Math.max(0, ...HEART_POINTS.map((p) => p.x)) - Math.min(...HEART_POINTS.map((p) => p.x))
      const height = Math.max(0, ...HEART_POINTS.map((p) => p.y)) - Math.min(...HEART_POINTS.map((p) => p.y))
      expect(Number.isInteger(width)).toBe(true)
      expect(Number.isInteger(height)).toBe(true)
      expect(width > 0 && height > 0).toBe(true)
    })
  })

  await describe('combat-action — geometry', async () => {
    await it('places a swing box in front of the attacker, never behind', async () => {
      const centre = vec(2 * TILE + TILE / 2, 2 * TILE + TILE / 2)
      const right = swingBoxOf(centre.x, centre.y, 'right')
      expect(right.left >= centre.x).toBe(true)
      const up = swingBoxOf(centre.x, centre.y, 'up')
      expect(up.bottom <= centre.y).toBe(true)
    })
  })
}

/** One-tile reach box, for the geometry assertions. */
function swingBoxOf(x: number, y: number, facing: Facing) {
  return swingBox(x, y, facing, 1, TILE, TILE)
}

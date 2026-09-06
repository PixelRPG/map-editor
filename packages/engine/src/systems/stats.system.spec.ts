/**
 * `StatsSystem` — what hit points, damage and experience actually do.
 *
 * Pins the boundary that lets `stats` be a base system while
 * `combat-action` is a switch: this system announces a defeat and never
 * decides what one means. Nothing here knows about drops, respawns or a
 * game over.
 */

import { describe, expect, it } from '@gjsify/unit'
import { Entity, EventEmitter, Scene } from 'excalibur'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import { StatsComponent } from '../components/stats.component.ts'
import { StatsRuntimeComponent } from '../components/stats-runtime.component.ts'
import { buildStatsComponent } from '../entity/specs/stats.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { StatsSystem } from './stats.system.ts'

/** A scene with one statted actor and the system wired to a bus. */
function rig(stats: Partial<{ maxHp: number; hp: number; defense: number; expToNext: number }> = {}, runtime = true) {
  const events = new EventEmitter<EngineEventMap>()
  const scene = new Scene()
  if (runtime) SessionState.set(scene, new RuntimeModeComponent())

  const actor = new Entity()
  actor.addComponent(
    buildStatsComponent({
      type: 'stats',
      maxHp: stats.maxHp ?? 3,
      hp: stats.hp,
      defense: stats.defense,
      expToNext: stats.expToNext,
    }),
  )
  scene.world.add(actor)

  const system = new StatsSystem(events)
  system.initialize(scene.world, scene)

  const defeated: number[] = []
  const levels: number[] = []
  events.on(EngineEvent.ENTITY_DEFEATED, ({ entityId }) => defeated.push(entityId))
  events.on(EngineEvent.LEVEL_UP, ({ level }) => levels.push(level))

  const tick = () => system.update(16)
  const hit = (amount: number) => events.emit(EngineEvent.DAMAGE_DEALT, { targetId: actor.id, amount })
  const reward = (amount: number) => events.emit(EngineEvent.EXPERIENCE_GAINED, { entityId: actor.id, amount })
  const live = () => actor.get(StatsRuntimeComponent) ?? null
  return { events, scene, actor, system, defeated, levels, tick, hit, reward, live }
}

export default async () => {
  await describe('StatsSystem — hit points', async () => {
    await it('seeds a live block from the authored one', async () => {
      const { tick, live } = rig({ maxHp: 5, hp: 4 })
      tick()
      expect(live()?.hp).toBe(4)
      expect(live()?.maxHp).toBe(5)
    })

    await it('defaults starting hp to the maximum, and never above it', async () => {
      expect(buildStatsComponent({ type: 'stats', maxHp: 6 }).hp).toBe(6)
      const { tick, live } = rig({ maxHp: 3, hp: 99 })
      tick()
      expect(live()?.hp).toBe(3)
    })

    await it('applies damage and announces a defeat at zero', async () => {
      const { tick, hit, live, defeated, actor } = rig({ maxHp: 3 })
      tick()
      hit(1)
      expect(live()?.hp).toBe(2)
      expect(defeated).toStrictEqual([])
      hit(2)
      expect(live()?.hp).toBe(0)
      expect(defeated).toStrictEqual([actor.id])
    })

    await it('subtracts defense but never below one point of damage', async () => {
      // Armour that made a hero untouchable would turn a tuning slider
      // into an invincibility switch — the fight has to stay winnable.
      const { tick, hit, live } = rig({ maxHp: 10, defense: 2 })
      tick()
      hit(5)
      expect(live()?.hp).toBe(7)
      hit(1)
      expect(live()?.hp).toBe(6)
    })

    await it('announces a defeat exactly once, however many hits land', async () => {
      const { tick, hit, defeated } = rig({ maxHp: 1 })
      tick()
      hit(1)
      hit(1)
      hit(1)
      expect(defeated.length).toBe(1)
    })

    await it('damages an actor that appeared this frame, before the seeding pass', async () => {
      const { scene, events, tick } = rig({ maxHp: 3 })
      tick()
      const latecomer = new Entity()
      latecomer.addComponent(buildStatsComponent({ type: 'stats', maxHp: 2 }))
      scene.world.add(latecomer)
      events.emit(EngineEvent.DAMAGE_DEALT, { targetId: latecomer.id, amount: 1 })
      expect(latecomer.get(StatsRuntimeComponent)?.hp).toBe(1)
    })
  })

  await describe('StatsSystem — Play resets the playthrough', async () => {
    await it('restores full hit points when runtime mode is re-entered', async () => {
      // Pause and Play do not rebuild the scene, so without this the hero
      // would carry the previous run's wounds into the next one.
      const { scene, tick, hit, live } = rig({ maxHp: 3 })
      tick()
      hit(2)
      expect(live()?.hp).toBe(1)

      SessionState.unset(scene, RuntimeModeComponent)
      tick()
      SessionState.set(scene, new RuntimeModeComponent())
      tick()
      expect(live()?.hp).toBe(3)
    })

    await it('leaves hit points alone while the run continues', async () => {
      const { tick, hit, live } = rig({ maxHp: 3 })
      tick()
      hit(1)
      tick()
      tick()
      expect(live()?.hp).toBe(2)
    })
  })

  await describe('StatsSystem — experience', async () => {
    await it('folds a reward into exp and levels up across the threshold', async () => {
      const { tick, reward, live, levels } = rig({ maxHp: 3, expToNext: 10 })
      tick()
      reward(4)
      expect(live()?.exp).toBe(4)
      expect(levels).toStrictEqual([])

      reward(6)
      expect(levels).toStrictEqual([2])
      expect(live()?.level).toBe(2)
      expect(live()?.exp).toBe(0)
      // A level restores the hero and widens the heart row.
      expect(live()?.maxHp).toBe(4)
      expect(live()?.hp).toBe(4)
    })

    await it('crosses several thresholds from one fat reward', async () => {
      // `while`, not `if`: a level swallowed silently is worse than two
      // toasts, and a big payout must not strand exp above the threshold.
      const { tick, reward, live, levels } = rig({ maxHp: 3, expToNext: 10 })
      tick()
      reward(100)
      expect(levels.length > 1).toBe(true)
      expect(live()?.exp < (live()?.expToNext ?? 0)).toBe(true)
    })

    await it('ignores an empty reward', async () => {
      const { tick, reward, live, levels } = rig({ maxHp: 3 })
      tick()
      reward(0)
      expect(live()?.exp).toBe(0)
      expect(levels).toStrictEqual([])
    })
  })

  await describe('StatsSystem — what it refuses to know', async () => {
    await it('does nothing to an actor with no stats at all', async () => {
      const { scene, events } = rig({ maxHp: 3 })
      const scenery = new Entity()
      scene.world.add(scenery)
      events.emit(EngineEvent.DAMAGE_DEALT, { targetId: scenery.id, amount: 5 })
      expect(scenery.get(StatsRuntimeComponent)).toBeUndefined()
    })

    await it('leaves the authored block untouched by a playthrough', async () => {
      // A playtest must never rewrite the project's data — that is the
      // whole reason live values live on a separate component.
      const { actor, tick, hit } = rig({ maxHp: 5, hp: 5 })
      tick()
      hit(3)
      expect(actor.get(StatsComponent)?.hp).toBe(5)
      expect(actor.get(StatsComponent)?.maxHp).toBe(5)
    })
  })
}

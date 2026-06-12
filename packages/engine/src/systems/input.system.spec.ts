/**
 * `InputSystem` — the single device-facing system. Pins the
 * transport-ready rule-3 contract: the keyboard is polled HERE and
 * published as pure data (`InputSourceComponent` on the session
 * singleton); gameplay systems never see the device. Covers runtime
 * gating (neutral intent outside play mode / without a keyboard)
 * and diagonal normalisation via `readMovementInput`.
 */

import { describe, expect, it } from '@gjsify/unit'
import type { Entity, Scene, World } from 'excalibur'
import { Keys } from 'excalibur'

import { InputSourceComponent, RuntimeModeComponent } from '../components/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { InputSystem } from './input.system.ts'

interface InputFixture {
  scene: Scene
  system: InputSystem
  held: Set<Keys>
  input: () => InputSourceComponent | null
}

/**
 * Minimal duck-typed scene sufficient for `SessionState` (iterable
 * `entities` + synchronous `add`) plus a fake keyboard — the repo's
 * established spec pattern (see tile-editor.system.spec.ts); a full
 * `new Scene()` would require an engine context.
 */
function makeInputScene(): InputFixture {
  const entities: Entity[] = []
  const held = new Set<Keys>()
  const scene = {
    entities,
    add(entity: Entity) {
      entities.push(entity)
    },
    engine: { input: { keyboard: { isHeld: (key: Keys) => held.has(key) } } },
  } as unknown as Scene
  const system = new InputSystem()
  system.initialize(undefined as unknown as World, scene)
  return { scene, system, held, input: () => SessionState.get(scene, InputSourceComponent) }
}

export default async () => {
  await describe('InputSystem — keyboard → InputSourceComponent', async () => {
    await it('publishes a neutral component on initialize', async () => {
      const { input } = makeInputScene()
      expect(input()?.moveX).toBe(0)
      expect(input()?.moveY).toBe(0)
      expect(input()?.actionHeld).toBe(false)
    })

    await it('stays neutral outside runtime mode even with keys held', async () => {
      const { system, held, input } = makeInputScene()
      held.add(Keys.Right)
      system.update(16)
      expect(input()?.moveX).toBe(0)
    })

    await it('publishes movement + action intent in runtime mode', async () => {
      const { scene, system, held, input } = makeInputScene()
      SessionState.set(scene, new RuntimeModeComponent())
      held.add(Keys.Right)
      held.add(Keys.Space)
      system.update(16)
      expect(input()?.moveX).toBe(1)
      expect(input()?.moveY).toBe(0)
      expect(input()?.actionHeld).toBe(true)
    })

    await it('normalises diagonals (no sqrt(2) speed boost)', async () => {
      const { scene, system, held, input } = makeInputScene()
      SessionState.set(scene, new RuntimeModeComponent())
      held.add(Keys.Right)
      held.add(Keys.Down)
      system.update(16)
      const i = input()
      expect(Math.abs((i?.moveX ?? 0) - 1 / Math.SQRT2) < 1e-9).toBe(true)
      expect(Math.abs((i?.moveY ?? 0) - 1 / Math.SQRT2) < 1e-9).toBe(true)
    })

    await it('resets to neutral when runtime mode ends mid-hold', async () => {
      const { scene, system, held, input } = makeInputScene()
      SessionState.set(scene, new RuntimeModeComponent())
      held.add(Keys.Left)
      system.update(16)
      expect(input()?.moveX).toBe(-1)

      SessionState.unset(scene, RuntimeModeComponent)
      system.update(16)
      expect(input()?.moveX).toBe(0)
      expect(input()?.actionHeld).toBe(false)
    })
  })
}

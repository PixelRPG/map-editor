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

import {
  ControlLockComponent,
  InputSourceComponent,
  RuntimeModeComponent,
  TouchInputComponent,
} from '../components/index.ts'
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
  system.onInitialize(undefined as unknown as World, scene)
  return { scene, system, held, input: () => SessionState.get(scene, InputSourceComponent) }
}

export default async () => {
  await describe('InputSystem — keyboard → InputSourceComponent', async () => {
    await it('publishes a neutral component on initialize', async () => {
      const { input } = makeInputScene()
      expect(input()?.moveX).toBe(0)
      expect(input()?.moveY).toBe(0)
      expect(input()?.actionHeld).toBe(false)
      expect(input()?.attackHeld).toBe(false)
    })

    await it('stays neutral while the controls are locked, and steers again once released', async () => {
      const { scene, system, held, input } = makeInputScene()
      SessionState.set(scene, new RuntimeModeComponent())
      held.add(Keys.Right)
      SessionState.set(scene, new ControlLockComponent())
      system.onUpdate(16)
      expect(input()?.moveX).toBe(0)
      SessionState.unset(scene, ControlLockComponent)
      system.onUpdate(16)
      expect(input()?.moveX).toBe(1)
    })

    await it('stays neutral outside runtime mode even with keys held', async () => {
      const { system, held, input } = makeInputScene()
      held.add(Keys.Right)
      system.onUpdate(16)
      expect(input()?.moveX).toBe(0)
    })

    await it('publishes movement + action intent in runtime mode', async () => {
      const { scene, system, held, input } = makeInputScene()
      SessionState.set(scene, new RuntimeModeComponent())
      held.add(Keys.Right)
      held.add(Keys.Space)
      system.onUpdate(16)
      expect(input()?.moveX).toBe(1)
      expect(input()?.moveY).toBe(0)
      expect(input()?.actionHeld).toBe(true)
    })

    await it('keeps publishing confirm while the controls are locked, but not steering', async () => {
      const { scene, system, held, input } = makeInputScene()
      SessionState.set(scene, new RuntimeModeComponent())
      SessionState.set(scene, new ControlLockComponent())
      held.add(Keys.Right)
      held.add(Keys.Enter)
      system.onUpdate(16)
      expect(input()?.moveX).toBe(0)
      expect(input()?.actionHeld).toBe(false)
      expect(input()?.confirmHeld).toBe(true)
    })

    await it('publishes the attack button on its own key, not the action one', async () => {
      // The second button of the transport-rule-3 contract: combat reads
      // `attackHeld` off this component, never the keyboard. Keeping it
      // off Space/Enter is what stops the hero swinging at every sign.
      const { scene, system, held, input } = makeInputScene()
      SessionState.set(scene, new RuntimeModeComponent())

      held.add(Keys.Space)
      system.onUpdate(16)
      expect(input()?.actionHeld).toBe(true)
      expect(input()?.attackHeld).toBe(false)

      held.clear()
      held.add(Keys.X)
      system.onUpdate(16)
      expect(input()?.actionHeld).toBe(false)
      expect(input()?.attackHeld).toBe(true)

      held.clear()
      held.add(Keys.J)
      system.onUpdate(16)
      expect(input()?.attackHeld).toBe(true)
    })

    await it('releases the attack button when runtime mode ends mid-hold', async () => {
      const { scene, system, held, input } = makeInputScene()
      SessionState.set(scene, new RuntimeModeComponent())
      held.add(Keys.X)
      system.onUpdate(16)
      expect(input()?.attackHeld).toBe(true)

      SessionState.unset(scene, RuntimeModeComponent)
      system.onUpdate(16)
      expect(input()?.attackHeld).toBe(false)
    })

    await it('normalises diagonals (no sqrt(2) speed boost)', async () => {
      const { scene, system, held, input } = makeInputScene()
      SessionState.set(scene, new RuntimeModeComponent())
      held.add(Keys.Right)
      held.add(Keys.Down)
      system.onUpdate(16)
      const i = input()
      expect(Math.abs((i?.moveX ?? 0) - 1 / Math.SQRT2) < 1e-9).toBe(true)
      expect(Math.abs((i?.moveY ?? 0) - 1 / Math.SQRT2) < 1e-9).toBe(true)
    })

    await it('steers from the touch producer when the stick is active', async () => {
      // The phone path: no keys held at all, intent arrives through
      // `TouchInputComponent` and still lands on the one component
      // gameplay reads.
      const { scene, system, input } = makeInputScene()
      SessionState.set(scene, new RuntimeModeComponent())
      SessionState.set(scene, new TouchInputComponent(0, -1, true, false, true))
      system.onUpdate(16)
      expect(input()?.moveY).toBe(-1)
      expect(input()?.actionHeld).toBe(true)
    })

    await it('ignores a touch producer that is not on screen', async () => {
      // `active: false` is a hidden control, not a centred one — stale
      // vector and all, it must not steer.
      const { scene, system, input } = makeInputScene()
      SessionState.set(scene, new RuntimeModeComponent())
      SessionState.set(scene, new TouchInputComponent(1, 0, true, true, false))
      system.onUpdate(16)
      expect(input()?.moveX).toBe(0)
      expect(input()?.actionHeld).toBe(false)
    })

    await it('stays neutral outside runtime mode even with touch held', async () => {
      const { scene, system, input } = makeInputScene()
      SessionState.set(scene, new TouchInputComponent(1, 0, true, false, true))
      system.onUpdate(16)
      expect(input()?.moveX).toBe(0)
      expect(input()?.actionHeld).toBe(false)
    })

    await it('resets to neutral when runtime mode ends mid-hold', async () => {
      const { scene, system, held, input } = makeInputScene()
      SessionState.set(scene, new RuntimeModeComponent())
      held.add(Keys.Left)
      system.onUpdate(16)
      expect(input()?.moveX).toBe(-1)

      SessionState.unset(scene, RuntimeModeComponent)
      system.onUpdate(16)
      expect(input()?.moveX).toBe(0)
      expect(input()?.actionHeld).toBe(false)
    })
  })
}

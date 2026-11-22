import { type Scene, System, SystemType, type World } from 'excalibur'
import { ControlLockComponent } from '../components/control-lock.component.ts'
import { InputSourceComponent } from '../components/input-source.component.ts'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import { TouchInputComponent } from '../components/touch-input.component.ts'
import {
  type InputIntent,
  isActionPressed,
  isAttackPressed,
  isCancelPressed,
  isConfirmTapped,
  type GamepadLike,
  readGamepadMenu,
  type KeyboardLike,
  mergeInputIntents,
  readMovementInput,
} from '../utils/player-input.ts'
import { SessionState } from '../utils/session-state.ts'

const NEUTRAL: InputIntent = { moveX: 0, moveY: 0, actionHeld: false, attackHeld: false }

/**
 * Polls the LOCAL input devices each tick and publishes the result as
 * the session-singleton's {@link InputSourceComponent} — the single
 * device-facing system. Everything gameplay-side (`PlayerSystem`)
 * reads the component, never a device (transport-ready rule 3:
 * remote/replay/AI input sources write the same component).
 *
 * Two local producers exist: the host keyboard, polled here, and the
 * on-screen touch controls, which publish {@link TouchInputComponent}
 * from the GTK side (`Engine.setTouchInput`). This system is the one
 * place they are combined, via the pure `mergeInputIntents` — so a
 * phone and a keyboard cannot each half-write the contract.
 *
 * Runs BEFORE `PlayerSystem` (registration order in `MapScene`), so
 * the component always carries the current frame's intent when the
 * player consumes it.
 *
 * Outside runtime mode, while the controls are locked (or with no keyboard, e.g. headless specs)
 * the intent resets to neutral so a mode exit also stops the player.
 */
export class InputSystem extends System {
  public readonly systemType = SystemType.Update

  private scene: Scene | null = null

  public onInitialize(world: World, scene: Scene): void {
    if (super.onInitialize) super.onInitialize(world, scene)
    void world
    this.scene = scene
    SessionState.set(scene, new InputSourceComponent())
    // Seed the touch producer too, so the GTK host can mutate it in
    // place from its first event instead of racing scene setup.
    SessionState.set(scene, new TouchInputComponent())
  }

  public onUpdate(_elapsedMs: number): void {
    const scene = this.scene
    if (!scene) return
    const input = SessionState.get(scene, InputSourceComponent)
    if (!input) return

    const inRuntime = SessionState.get(scene, RuntimeModeComponent) !== null
    if (!inRuntime) {
      this.publish(input, NEUTRAL)
      input.confirmHeld = false
      input.menuY = 0
      input.cancelHeld = false
      return
    }

    // No keyboard is normal, not an error: the headless specs have none,
    // and neither does a phone. Touch alone has to be able to drive the
    // hero, so a missing keyboard contributes neutral rather than
    // short-circuiting the whole merge.
    const kb = (scene.engine as { input?: { keyboard?: KeyboardLike } })?.input?.keyboard
    const keyboard = kb ? this.readKeyboard(kb) : NEUTRAL
    const touch = SessionState.get(scene, TouchInputComponent)
    const merged = mergeInputIntents(keyboard, touch?.active ? touch : null)
    // A sequenced action list holds the controls (`ControlLockComponent`):
    // steering stops, everything else keeps ticking. Confirm still gets
    // through so the text box a locked list opened can be closed.
    const locked = SessionState.get(scene, ControlLockComponent) !== null
    this.publish(input, locked ? NEUTRAL : merged)
    const pad = readGamepadMenu(
      (scene.engine as { input?: { gamepads?: { at?: (i: number) => GamepadLike } } })?.input?.gamepads?.at?.(0),
    )
    input.confirmHeld = merged.actionHeld || (kb ? isConfirmTapped(kb) : false) || pad.confirm
    // Menus read the pre-lock movement: the lock silences steering, not choosing.
    const keyY = Math.abs(merged.moveY) > 0.5 ? Math.sign(merged.moveY) : 0
    input.menuY = keyY !== 0 ? keyY : pad.menuY
    input.cancelHeld = (kb ? isCancelPressed(kb) : false) || pad.cancel
  }

  private readKeyboard(kb: KeyboardLike): InputIntent {
    const { dx, dy } = readMovementInput(kb)
    return {
      moveX: dx,
      moveY: dy,
      actionHeld: isActionPressed(kb),
      attackHeld: isAttackPressed(kb),
    }
  }

  private publish(input: InputSourceComponent, intent: InputIntent): void {
    input.moveX = intent.moveX
    input.moveY = intent.moveY
    input.actionHeld = intent.actionHeld
    input.attackHeld = intent.attackHeld
  }
}

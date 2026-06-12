import { type Scene, System, SystemType, type World } from 'excalibur'
import { InputSourceComponent } from '../components/input-source.component.ts'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import { isActionPressed, type KeyboardLike, readMovementInput } from '../utils/player-input.ts'
import { SessionState } from '../utils/session-state.ts'

/**
 * Polls the LOCAL keyboard each tick and publishes the result as the
 * session-singleton's {@link InputSourceComponent} — the single
 * device-facing system. Everything gameplay-side (`PlayerSystem`)
 * reads the component, never the keyboard (transport-ready rule 3:
 * remote/replay/AI input sources write the same component).
 *
 * Runs BEFORE `PlayerSystem` (registration order in `MapScene`), so
 * the component always carries the current frame's intent when the
 * player consumes it.
 *
 * Outside runtime mode (or with no keyboard, e.g. headless specs)
 * the intent resets to neutral so a mode exit also stops the player.
 */
export class InputSystem extends System {
  public readonly systemType = SystemType.Update

  private scene: Scene | null = null

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    void world
    this.scene = scene
    SessionState.set(scene, new InputSourceComponent())
  }

  public update(_elapsedMs: number): void {
    const scene = this.scene
    if (!scene) return
    const input = SessionState.get(scene, InputSourceComponent)
    if (!input) return

    const inRuntime = SessionState.get(scene, RuntimeModeComponent) !== null
    const kb = (scene.engine as { input?: { keyboard?: KeyboardLike } })?.input?.keyboard
    if (!inRuntime || !kb) {
      input.moveX = 0
      input.moveY = 0
      input.actionHeld = false
      return
    }

    const { dx, dy } = readMovementInput(kb)
    input.moveX = dx
    input.moveY = dy
    input.actionHeld = isActionPressed(kb)
  }
}

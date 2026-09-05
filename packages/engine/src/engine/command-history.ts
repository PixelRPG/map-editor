import type { EventEmitter } from 'excalibur'
import type { Command } from '../commands/index.ts'
import { UndoStackComponent } from '../components/index.ts'
import { executeCommandOnScene } from '../services/command-dispatch.ts'
import { layerFlagChange, layerListChange } from '../services/layer-flag-event.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { canRedo, canUndo } from '../utils/undo-stack.utils.ts'
import { type ActiveSceneAccessor, rebindOnMapLoaded } from './scene-binding.ts'

/**
 * The op-log: every mutation of scene/map state enters here as a
 * {@link Command}, so undo, redo and the peer relay all read from one
 * vocabulary (see AGENTS.md § Transport-ready primitives).
 *
 * Four entry points apply or revert a command — local execute, undo,
 * redo, and the two remote-op paths — and each has its own emit
 * contract:
 *
 *  - local execute / redo emit `COMMAND_EXECUTED`, undo emits
 *    `COMMAND_REVERTED`: the collab `SessionController` relays those to
 *    peers.
 *  - the remote paths emit `REMOTE_COMMAND_APPLIED` instead, and push
 *    nothing onto the stack — relaying a received op back would bounce
 *    indefinitely, and each peer owns its own undo history.
 *
 * All four end with the layer mirror, because the inspector's
 * eye/padlock — and, for add / reorder / change-of-plane, its row
 * order — has to follow a layer change regardless of which path
 * produced it — including the remote ones that deliberately stay off
 * `COMMAND_EXECUTED`.
 */
export class CommandHistory {
  constructor(
    private readonly activeScene: ActiveSceneAccessor,
    private readonly events: EventEmitter<EngineEventMap>,
  ) {}

  /**
   * Apply `command` and push it onto the undo stack, truncating any
   * abandoned redo tail. `origin` attributes the mutation to an actor
   * other than the local user; it rides `COMMAND_EXECUTED` so peers can
   * show "AI" instead of the hosting user. The stack push stays
   * origin-agnostic — AI edits land on the host's stack so the human
   * can Ctrl+Z an AI mistake.
   */
  execute(command: Command, origin?: string): void {
    const scene = this.activeScene()
    if (!scene) return
    executeCommandOnScene(scene, this.events, command, origin)
    this.mirrorLayerChange(command, 'apply')
  }

  /** Apply a command received from a peer: no stack push, no relay. */
  applyRemote(command: Command, origin?: string): void {
    const scene = this.activeScene()
    if (!scene) return
    command.apply(scene)
    this.events.emit(EngineEvent.REMOTE_COMMAND_APPLIED, { command, direction: 'apply', origin })
    this.mirrorLayerChange(command, 'apply')
  }

  /** Revert a command received from a peer that undid it on its side. */
  revertRemote(command: Command, origin?: string): void {
    const scene = this.activeScene()
    if (!scene) return
    command.revert(scene)
    this.events.emit(EngineEvent.REMOTE_COMMAND_APPLIED, { command, direction: 'revert', origin })
    this.mirrorLayerChange(command, 'revert')
  }

  /** Revert the most recent applied command. No-op at the stack floor. */
  undo(origin?: string): boolean {
    const ctx = this.context()
    if (!ctx || !canUndo(ctx.stack)) return false
    const command = ctx.stack.commands[ctx.stack.cursor - 1]
    if (!command) return false
    command.revert(ctx.scene)
    ctx.stack.cursor -= 1
    SessionState.notifyMutation(ctx.scene, ctx.stack)
    this.events.emit(EngineEvent.COMMAND_REVERTED, { command, origin })
    this.mirrorLayerChange(command, 'revert')
    return true
  }

  /**
   * Re-apply the next command in the stack. Bypasses
   * {@link executeCommandOnScene} because the command is already on the
   * stack — only the apply + relay halves are wanted, not a fresh push.
   */
  redo(origin?: string): boolean {
    const ctx = this.context()
    if (!ctx || !canRedo(ctx.stack)) return false
    const command = ctx.stack.commands[ctx.stack.cursor]
    if (!command) return false
    command.apply(ctx.scene)
    ctx.stack.cursor += 1
    SessionState.notifyMutation(ctx.scene, ctx.stack)
    this.events.emit(EngineEvent.COMMAND_EXECUTED, { command, origin })
    this.mirrorLayerChange(command, 'apply')
    return true
  }

  canUndo(): boolean {
    const stack = this.context()?.stack
    return stack ? canUndo(stack) : false
  }

  canRedo(): boolean {
    const stack = this.context()?.stack
    return stack ? canRedo(stack) : false
  }

  /**
   * Subscribe to stack changes on the active scene. Fires once with the
   * present snapshot (`false, false` without a scene) and again on every
   * mutation; rebinds across map switches so subscribers keep
   * `win.undo` / `win.redo` enabled-state in sync without re-registering.
   */
  onChanged(cb: (state: { canUndo: boolean; canRedo: boolean }) => void): () => void {
    return rebindOnMapLoaded(this.events, () => {
      const scene = this.activeScene()
      if (!scene) {
        cb({ canUndo: false, canRedo: false })
        return null
      }
      return SessionState.subscribe(scene, UndoStackComponent, (stack) => {
        cb({ canUndo: stack ? canUndo(stack) : false, canRedo: stack ? canRedo(stack) : false })
      })
    })
  }

  /** `(scene, stack)` for the active map, or `null` when either is missing. */
  private context(): { scene: MapScene; stack: UndoStackComponent } | null {
    const scene = this.activeScene()
    if (!scene) return null
    const stack = SessionState.get(scene, UndoStackComponent)
    if (!stack) return null
    return { scene, stack }
  }

  /**
   * Mirror a layer command to the host's Layers tab: a flag command's
   * effective value, or the fact that the layer list changed. The
   * command→payload mappings are the pure {@link layerFlagChange} /
   * {@link layerListChange}; this only owns the emits. No-op for
   * non-layer commands.
   */
  private mirrorLayerChange(command: Command, direction: 'apply' | 'revert'): void {
    const flag = layerFlagChange(command, direction)
    if (flag) this.events.emit(EngineEvent.LAYER_FLAG_CHANGED, flag)
    const list = layerListChange(command)
    if (list) this.events.emit(EngineEvent.LAYER_LIST_CHANGED, list)
  }
}

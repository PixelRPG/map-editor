import type { EventEmitter, Scene } from 'excalibur'
import type { Command } from '../commands/types.ts'
import { UndoStackComponent } from '../components/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'

/**
 * Single-owner command dispatch: apply the command, push it onto the
 * session-singleton's `UndoStackComponent`, notify subscribers, and
 * emit `COMMAND_EXECUTED` so the collab `SessionController` can relay
 * the operation to peers.
 *
 * `Engine.executeCommand` and `TileEditorSystem.dispatchCommand` both
 * call this helper instead of inlining the body. An earlier inline
 * copy in the editor system dropped the `COMMAND_EXECUTED` emit once
 * (2026-06-01 hand-test: joiner saw the initial snapshot but no live
 * edits) — sharing the body across both call sites prevents that
 * class of drift from recurring.
 *
 * Mid-stack truncation: if the user previously undid and the cursor
 * is short of `commands.length`, the redo tail is dropped (the
 * abandoned branch cannot be re-redone).
 *
 * Mutation strategy: when an existing stack is present, the helper
 * mutates `commands` + `cursor` in place and uses
 * `SessionState.notifyMutation` rather than re-`set`ing the wrapper.
 * Same-instance equality on the undo bus drops redundant updates and
 * one paint per click would otherwise allocate fresh wrappers.
 */
export function executeCommandOnScene(
  scene: Scene,
  events: EventEmitter<EngineEventMap>,
  command: Command,
): void {
  command.apply(scene)

  const existing = SessionState.get(scene, UndoStackComponent)
  if (existing) {
    existing.commands = existing.commands.slice(0, existing.cursor)
    existing.commands.push(command)
    existing.cursor = existing.commands.length
    SessionState.notifyMutation(scene, existing)
  } else {
    SessionState.set(scene, new UndoStackComponent([command], 1))
  }

  events.emit(EngineEvent.COMMAND_EXECUTED, { command })
}

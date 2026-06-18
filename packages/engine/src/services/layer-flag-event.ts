import { type Command, SetLayerLockedCommand, SetLayerVisibilityCommand } from '../commands/index.ts'
import type { EngineEvent, EngineEventMap } from '../types/index.ts'

/** The `LAYER_FLAG_CHANGED` event payload shape, re-exported for callers. */
export type LayerFlagChange = EngineEventMap[EngineEvent.LAYER_FLAG_CHANGED]

/**
 * Map a layer-flag command + the direction it is being applied in to the
 * `LAYER_FLAG_CHANGED` payload the host's Layers tab mirrors — or `null`
 * for any command that isn't a layer-flag toggle.
 *
 * Pure counterpart of `Engine._emitLayerFlagChanged`: the engine emits
 * `LAYER_FLAG_CHANGED` after EVERY path that applies/reverts a command
 * (local execute, undo, redo, remote apply, remote revert) so the
 * inspector's eye/padlock follows changes the inspector didn't originate
 * — remote ops in particular deliberately don't emit `COMMAND_EXECUTED`.
 *
 * The reported `value` is the flag's effective value AFTER the change:
 *  - `'apply'`  → the command's target value (`visible` / `locked`).
 *  - `'revert'` → the captured previous value the undo restores.
 */
export function layerFlagChange(command: Command, direction: 'apply' | 'revert'): LayerFlagChange | null {
  if (command instanceof SetLayerVisibilityCommand) {
    const { layerId, visible, previousVisible } = command.payload
    return { layerId, flag: 'visible', value: direction === 'apply' ? visible : previousVisible }
  }
  if (command instanceof SetLayerLockedCommand) {
    const { layerId, locked, previousLocked } = command.payload
    return { layerId, flag: 'locked', value: direction === 'apply' ? locked : previousLocked }
  }
  return null
}

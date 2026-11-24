import type { EventEmitter, Scene } from 'excalibur'
import type { FlagValue } from '../types/data/EntityDefinition.ts'
import { type FlagData, flagValueFitsKind } from '../types/data/FlagData.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { isRuntimeModeActive } from './runtime-mode.ts'

/**
 * Write one flag of the running game, the way a `set-flag` action does.
 *
 * The write is an `EngineEvent.FLAG_SET`, not a poke at the save record:
 * `FlagSystem` is the one writer of that record, so a value set from the
 * Game memory panel lands in the same bag, notifies the same readers and
 * is announced to the same listeners as one the game itself set.
 * `StateSystem` then re-resolves every placement on its next frame.
 *
 * Refused (returns `false`) rather than thrown, because the caller is a
 * UI row that can be one frame behind the run: outside a run (there is
 * no save to write to), for a flag the project never declared, and for a
 * value of the wrong type for the flag's kind.
 *
 * Not a `Command`: a run's flag values are local, un-persisted runtime
 * state, not part of the shared document (`docs/concepts/save-record.md`).
 */
export function writeFlag(
  events: EventEmitter<EngineEventMap>,
  scene: Scene,
  flagDefs: readonly FlagData[],
  flag: string,
  value: FlagValue,
  thing?: string,
): boolean {
  if (!isRuntimeModeActive(scene)) return false
  const def = flagDefs.find((f) => f.id === flag)
  if (!def || !flagValueFitsKind(value, def.kind)) return false
  events.emit(EngineEvent.FLAG_SET, { flag, value, thing: def.scope === 'thing' ? thing : undefined })
  return true
}

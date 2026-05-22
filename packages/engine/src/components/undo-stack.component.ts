import { Component } from 'excalibur'
import type { Command } from '../commands/types.ts'

/**
 * Editor undo / redo history. Lives on the session-singleton.
 *
 * Layout:
 *
 * ```
 *   commands:  [ c0, c1, c2, c3 ]
 *                       ^
 *                    cursor
 * ```
 *
 * `cursor` points one **past** the last applied command — same
 * convention as a JS `Array.length` for "what's filled". Undo
 * decrements `cursor` after calling `commands[cursor-1].revert(...)`;
 * redo increments after calling `commands[cursor].apply(...)`.
 *
 * Executing a new command when `cursor < commands.length` truncates
 * the redo tail — once you act after an undo, you can't re-redo the
 * branch you abandoned. Standard editor convention.
 *
 * `notifyMutation` is the right signal channel for "stack changed"
 * updates — listeners (Undo/Redo button enabled-state in the
 * floating-history widget) subscribe to the component and observe
 * the cursor + length via the same payload they get on add.
 */
export class UndoStackComponent extends Component {
  constructor(
    public commands: Command[] = [],
    public cursor: number = 0,
  ) {
    super()
  }

  get canUndo(): boolean {
    return this.cursor > 0
  }

  get canRedo(): boolean {
    return this.cursor < this.commands.length
  }
}

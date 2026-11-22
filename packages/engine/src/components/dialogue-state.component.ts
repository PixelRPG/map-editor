import { Component } from 'excalibur'

/**
 * The text box that is open right now — pure data on the session
 * singleton, written only by `DialogueSystem`. Runtime and local: each
 * player reads their own text at their own pace, so it never travels
 * over the wire (the same rule as {@link ControlLockComponent}).
 *
 * `pages` are the wrapped lines of the whole text; `revealed` counts the
 * characters of the current page already shown, fractional so a slow
 * frame does not drop a character. The two input flags carry what the
 * devices said since the last tick: `confirmWasHeld` is the previous
 * tick's held confirm (for edge detection), `tapQueued` a pointer tap
 * that has not been consumed yet.
 */
export class DialogueStateComponent extends Component {
  public page = 0
  public revealed = 0
  public confirmWasHeld = true
  public tapQueued = false

  constructor(
    public readonly pages: readonly (readonly string[])[],
    public readonly speaker: string | null,
    /** An `ask` prompt: the box stays open after its last page, the rows take over. */
    public readonly hold = false,
  ) {
    super()
  }
}

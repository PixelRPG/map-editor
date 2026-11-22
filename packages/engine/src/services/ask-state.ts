import { type DialogueData, isPageRevealed } from './dialogue-state.ts'

/**
 * The `ask` answers as a state machine: highlight, move, pick, cancel.
 * Pure functions over {@link AskData}, so the whole flow is specified
 * without a scene, a canvas or a clock. No timer: a question waits for
 * as long as the player takes.
 */

/** The fields of `AskStateComponent` the machine reads and writes. */
export interface AskData {
  readonly count: number
  /** Index of the option a confirm would pick. */
  highlight: number
  /** The option a cancel picks, or `null` when the player cannot back out. */
  readonly cancelIndex: number | null
  confirmWasHeld: boolean
  cancelWasHeld: boolean
  /** The previous tick's menu direction (-1, 0, 1), for edge detection. */
  menuWas: number
}

/** What the devices said this tick. */
export interface AskInput {
  /** -1 up, 1 down, 0 neither. */
  menuY: number
  confirmHeld: boolean
  cancelHeld: boolean
}

/** The text box that carries the prompt, as far as the rows need to know. */
export type AskBoxData = DialogueData & { readonly hold: boolean }

/**
 * Are the rows visible and live? Only once the prompt's last page is fully
 * revealed: before that the box is an ordinary text box, and a confirm
 * finishes the reveal instead of picking.
 */
export function optionsOpen(box: AskBoxData): boolean {
  return box.hold && box.page + 1 >= box.pages.length && isPageRevealed(box)
}

/**
 * A fresh answer state. Confirm and cancel start as "held": the press
 * that revealed the last page must be released before it can pick.
 */
export function newAskData(count: number, cancelIndex: number | null): AskData {
  return { count, highlight: 0, cancelIndex, confirmWasHeld: true, cancelWasHeld: true, menuWas: 0 }
}

/**
 * One tick of input. Up/down move the highlight once per press (wrapping);
 * a confirm press picks it; a cancel press picks the cancel option when
 * there is one. Returns the picked index, or `null`.
 */
export function stepAsk(data: AskData, input: AskInput): number | null {
  const dir = Math.sign(input.menuY)
  if (dir !== 0 && dir !== data.menuWas && data.count > 0) {
    data.highlight = (data.highlight + dir + data.count) % data.count
  }
  data.menuWas = dir

  const confirmPressed = input.confirmHeld && !data.confirmWasHeld
  const cancelPressed = input.cancelHeld && !data.cancelWasHeld
  data.confirmWasHeld = input.confirmHeld
  data.cancelWasHeld = input.cancelHeld

  if (confirmPressed) return data.highlight
  if (cancelPressed && data.cancelIndex !== null) return data.cancelIndex
  return null
}

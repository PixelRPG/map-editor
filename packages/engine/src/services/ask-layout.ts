import { DIALOGUE_FONT_SIZE, DIALOGUE_LINE_HEIGHT, type DialogueGeometry } from './dialogue-layout.ts'
import { layoutText } from './text-layout.ts'

/**
 * Where the `ask` rows sit: a stack above the text box, as wide as the
 * box. Sizes are UI pixels (× `k` for device pixels); the position of the
 * stack follows the box, so it clears the same bottom inset. Pure.
 */

/** A row is never shorter than this: a finger-sized target at every `k`. */
export const ASK_ROW_MIN_HEIGHT = 44
export const ASK_ROW_PADDING_X = 14
export const ASK_ROW_PADDING_Y = 6
export const ASK_ROW_GAP = 6
/** Gap between the stack and the box under it. */
export const ASK_STACK_GAP = 4
/** A label longer than this many lines is cut, so four rows always fit a phone. */
export const ASK_ROW_MAX_LINES = 3

export interface AskRowLayout {
  readonly index: number
  readonly lines: readonly string[]
  /** Device pixels, top-left of the row on the drawing surface. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface AskLayout {
  readonly rows: readonly AskRowLayout[]
  /** Bounding rectangle of the stack, device pixels. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** False when the stack would stick out over the top edge. */
  readonly fits: boolean
}

/** Rows for `labels`, stacked upwards from the box `geometry` describes. */
export function askLayout(
  geometry: DialogueGeometry,
  labels: readonly string[],
  advance: (char: string) => number,
): AskLayout {
  const k = geometry.k
  const maxWidth = geometry.boxWidth - 2 * ASK_ROW_PADDING_X
  const wrapped = labels.map((label) => {
    const page = layoutText(label, { maxWidth, maxLines: ASK_ROW_MAX_LINES, advance })[0]
    return page?.lines ?? ['']
  })
  const heights = wrapped.map((lines) =>
    Math.max(ASK_ROW_MIN_HEIGHT, lines.length * DIALOGUE_LINE_HEIGHT + 2 * ASK_ROW_PADDING_Y),
  )
  const total = heights.reduce((sum, h) => sum + h, 0) + Math.max(0, labels.length - 1) * ASK_ROW_GAP
  const stackTop = geometry.originY - (ASK_STACK_GAP + total) * k
  let y = Math.max(0, stackTop)
  const rows = wrapped.map((lines, index): AskRowLayout => {
    const row = { index, lines, x: geometry.originX, y, width: geometry.boxWidth * k, height: heights[index] * k }
    y += (heights[index] + ASK_ROW_GAP) * k
    return row
  })
  return {
    rows,
    x: geometry.originX,
    y: Math.max(0, stackTop),
    width: geometry.boxWidth * k,
    height: total * k,
    fits: stackTop >= 0,
  }
}

/** The row under the device-pixel point (x, y), or -1. */
export function hitRow(layout: AskLayout, x: number, y: number): number {
  for (const row of layout.rows) {
    if (x >= row.x && x < row.x + row.width && y >= row.y && y < row.y + row.height) return row.index
  }
  return -1
}

/** Y offset in UI pixels of the first text line inside a row of `lines` lines. */
export function rowTextTop(height: number, lines: number): number {
  return (height - lines * DIALOGUE_LINE_HEIGHT) / 2 + (DIALOGUE_LINE_HEIGHT - DIALOGUE_FONT_SIZE) / 2
}

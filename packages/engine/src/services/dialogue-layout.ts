import type { Extent } from '../utils/play-camera.ts'
import { uiScale } from '../utils/pixel-scale.ts'

/**
 * Where the text box sits and how big it is, in UI pixels (one UI pixel
 * is `k` whole device pixels, so the pixel font stays crisp at every
 * display scale). Pure: the viewport goes in, rectangles come out.
 */

/** The size the box is laid out for; `k` is the largest whole fit. */
export const DIALOGUE_DESIGN: Extent = { width: 640, height: 360 }
export const DIALOGUE_FONT_SIZE = 12
export const DIALOGUE_LINE_HEIGHT = 16
export const DIALOGUE_LINES = 3
export const DIALOGUE_PADDING_X = 8
export const DIALOGUE_PADDING_Y = 6
export const DIALOGUE_MARGIN = 6
/** Gap under the box, so it reads as a box and not a strip. */
export const DIALOGUE_BOTTOM_MARGIN = 14
export const DIALOGUE_TAB_HEIGHT = 14
export const DIALOGUE_TAB_PADDING_X = 6
export const DIALOGUE_MAX_WIDTH = 400
const MIN_WIDTH = 64

export interface DialogueGeometry {
  /** Device pixels per UI pixel (a whole number ≥ 1). */
  readonly k: number
  /** Box size in UI pixels. */
  readonly boxWidth: number
  readonly boxHeight: number
  /** Inner text width in UI pixels, what the text wraps to. */
  readonly textWidth: number
  /** Top-left of the speaker tab (the whole picture) in DEVICE pixels. */
  readonly originX: number
  readonly originY: number
}

/**
 * The box for a drawing surface of `viewport` device pixels. `bottomInset`
 * is the part of the bottom edge host chrome covers (device pixels) — the
 * box stays above it.
 */
export function dialogueGeometry(viewport: Extent, bottomInset = 0): DialogueGeometry {
  const k = uiScale(viewport, DIALOGUE_DESIGN)
  const uiWidth = Math.floor(viewport.width / k)
  const boxWidth = Math.max(MIN_WIDTH, Math.min(DIALOGUE_MAX_WIDTH, uiWidth - 2 * DIALOGUE_MARGIN))
  const boxHeight = DIALOGUE_LINES * DIALOGUE_LINE_HEIGHT + 2 * DIALOGUE_PADDING_Y
  const inset = Math.max(0, Math.round(bottomInset))
  const originX = Math.max(0, Math.floor((viewport.width - boxWidth * k) / 2))
  const bottom = Math.max(0, viewport.height - inset - DIALOGUE_BOTTOM_MARGIN * k)
  const originY = Math.max(0, bottom - (boxHeight + DIALOGUE_TAB_HEIGHT) * k)
  return { k, boxWidth, boxHeight, textWidth: boxWidth - 2 * DIALOGUE_PADDING_X, originX, originY }
}

/**
 * Width in UI pixels of each line's visible part when `visible`
 * characters of the page are shown. Lines before the cut are whole, the
 * line holding it is cut after the last visible glyph, later lines are 0.
 * This is what the typewriter clips the pre-drawn page with.
 */
export function revealWidths(lines: readonly string[], visible: number, advance: (char: string) => number): number[] {
  let left = Math.max(0, Math.floor(visible))
  return lines.map((line) => {
    let width = 0
    for (const ch of line) {
      if (left <= 0) break
      width += advance(ch)
      left -= 1
    }
    return width
  })
}

import {
  DIALOGUE_FONT_SIZE,
  DIALOGUE_LINE_HEIGHT,
  DIALOGUE_LINES,
  DIALOGUE_PADDING_X,
  DIALOGUE_PADDING_Y,
  DIALOGUE_TAB_HEIGHT,
  DIALOGUE_TAB_PADDING_X,
  type DialogueGeometry,
} from './dialogue-layout.ts'
import { PIXEL_FONT_FAMILY } from './pixel-font.ts'

/** The font family the shipped pixel font registers under (registered with `FontFace` by `loadPixelFont`, in the maker and in a browser alike). */
export const DIALOGUE_FONT_FAMILY = `"${PIXEL_FONT_FAMILY}", sans-serif`

/** Dark blue-black panel with cream text: contrast ≈ 15:1, readable on any map and in either app theme. */
const PANEL = '#15192b'
const BORDER = '#f2e8cf'
const TEXT = '#fff8e6'
const TAB = '#f2e8cf'
const TAB_TEXT = '#15192b'

export interface RasterSize {
  readonly width: number
  readonly height: number
}

/** Device-pixel size of the frame and text images for `geometry` (whole numbers). */
export function rasterSize(geometry: DialogueGeometry): RasterSize {
  return { width: geometry.boxWidth * geometry.k, height: (geometry.boxHeight + DIALOGUE_TAB_HEIGHT) * geometry.k }
}

function makeCanvas(size: RasterSize): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas') as HTMLCanvasElement
  canvas.width = Math.max(1, Math.round(size.width))
  canvas.height = Math.max(1, Math.round(size.height))
  const ctx = canvas.getContext('2d')
  return ctx ? { canvas, ctx } : null
}

/** Draw `text` with its top-left at UI pixel (x, y), one UI pixel = `k` device pixels. */
function drawLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, k: number): void {
  ctx.font = `${DIALOGUE_FONT_SIZE * k}px ${DIALOGUE_FONT_FAMILY}`
  ctx.textBaseline = 'top'
  ctx.fillText(text, Math.round(x * k), Math.round(y * k))
}

/** The panel, border, and the speaker's tab. Drawn once when the box opens. */
export function rasterFrame(
  geometry: DialogueGeometry,
  speaker: string | null,
  advance: (ch: string) => number,
): HTMLCanvasElement | null {
  const made = makeCanvas(rasterSize(geometry))
  if (!made) return null
  const { canvas, ctx } = made
  const k = geometry.k
  const top = DIALOGUE_TAB_HEIGHT
  ctx.fillStyle = BORDER
  ctx.fillRect(0, top * k, geometry.boxWidth * k, geometry.boxHeight * k)
  ctx.fillStyle = PANEL
  ctx.fillRect(2 * k, (top + 2) * k, (geometry.boxWidth - 4) * k, (geometry.boxHeight - 4) * k)
  if (speaker) {
    let width = 0
    for (const ch of speaker) width += advance(ch)
    const tabWidth = Math.min(geometry.boxWidth, Math.ceil(width) + 2 * DIALOGUE_TAB_PADDING_X)
    ctx.fillStyle = TAB
    ctx.fillRect(0, 0, tabWidth * k, (top + 2) * k)
    ctx.fillStyle = TAB_TEXT
    drawLine(ctx, speaker, DIALOGUE_TAB_PADDING_X, (top - DIALOGUE_FONT_SIZE) / 2 + 1, k)
  }
  return canvas
}

/** One page's lines on a transparent image, laid out at the box's text origin. Drawn once per page. */
export function rasterPage(geometry: DialogueGeometry, lines: readonly string[]): HTMLCanvasElement | null {
  const made = makeCanvas(rasterSize(geometry))
  if (!made) return null
  const { canvas, ctx } = made
  ctx.fillStyle = TEXT
  const y0 = DIALOGUE_TAB_HEIGHT + DIALOGUE_PADDING_Y
  for (let i = 0; i < Math.min(lines.length, DIALOGUE_LINES); i++) {
    drawLine(
      ctx,
      lines[i],
      DIALOGUE_PADDING_X,
      y0 + i * DIALOGUE_LINE_HEIGHT + (DIALOGUE_LINE_HEIGHT - DIALOGUE_FONT_SIZE) / 2,
      geometry.k,
    )
  }
  return canvas
}

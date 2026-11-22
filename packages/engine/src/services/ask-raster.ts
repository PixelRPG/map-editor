import { DIALOGUE_FONT_FAMILY } from './dialogue-raster.ts'
import { DIALOGUE_FONT_SIZE, DIALOGUE_LINE_HEIGHT } from './dialogue-layout.ts'
import { ASK_ROW_PADDING_X, type AskRowLayout } from './ask-layout.ts'

const PANEL = '#15192b'
const BORDER = '#f2e8cf'
const TEXT = '#fff8e6'
const HIGHLIGHT_TEXT = '#15192b'

/** One row drawn once, in the idle or the highlighted look. Device-pixel canvas of the row's size. */
export function rasterAskRow(row: AskRowLayout, k: number, highlighted: boolean): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas') as HTMLCanvasElement
  canvas.width = Math.max(1, Math.round(row.width))
  canvas.height = Math.max(1, Math.round(row.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = BORDER
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = highlighted ? BORDER : PANEL
  ctx.fillRect(2 * k, 2 * k, canvas.width - 4 * k, canvas.height - 4 * k)
  ctx.fillStyle = highlighted ? HIGHLIGHT_TEXT : TEXT
  if (highlighted) ctx.fillRect(6 * k, canvas.height / 2 - 2 * k, 4 * k, 4 * k)
  ctx.font = `${DIALOGUE_FONT_SIZE * k}px ${DIALOGUE_FONT_FAMILY}`
  ctx.textBaseline = 'top'
  const top =
    (canvas.height / k - row.lines.length * DIALOGUE_LINE_HEIGHT) / 2 + (DIALOGUE_LINE_HEIGHT - DIALOGUE_FONT_SIZE) / 2
  row.lines.forEach((line, i) => {
    ctx.fillText(line, Math.round(ASK_ROW_PADDING_X * k), Math.round((top + i * DIALOGUE_LINE_HEIGHT) * k))
  })
  return canvas
}

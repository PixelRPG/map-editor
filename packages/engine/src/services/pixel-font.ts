import { createAdvanceFn } from './font-metrics.ts'
import { FUSION_PIXEL_12_METRICS } from './fusion-pixel-12-metrics.ts'
import { PIXEL_FONT_BASE64 } from './pixel-font-data.ts'
import type { AdvanceFn } from './text-layout.ts'

/** The family the built-in pixel font registers under. */
export const PIXEL_FONT_FAMILY = 'Fusion Pixel 12px Prop latin'

/** Wide enough to hit every advance width the table holds: umlauts, ß, digits, dashes, quotes. */
const PROBE = 'Hamburg, Öl & Wörter: ÄÖÜ äöüß 0123456789 — „x“ »y«'
const PROBE_SIZE = 12
/** Canvas backends round advances differently (320 vs 321 px over the probe); a fallback sans is off by far more. */
const TOLERANCE_RATIO = 0.02

const staticAdvance: AdvanceFn = createAdvanceFn(FUSION_PIXEL_12_METRICS)

type Measure = (text: string) => number

export interface AdvanceChoice {
  readonly advance: AdvanceFn
  /** True when the canvas draws the font at other widths than the table, so the table was dropped. */
  readonly mismatch: boolean
  /** Probe width the canvas measured, and the table's. */
  readonly drawn: number
  readonly expected: number
}

/**
 * Decide which advances layout may trust. `measure` is the canvas's width of a
 * string at {@link PROBE_SIZE}px. A canvas that agrees with the table keeps the
 * table (cheap, needs no canvas); one that does not is drawing some other font,
 * and lines laid out with the table would be cut off, so layout uses what the
 * canvas measures.
 */
export function chooseAdvance(measure: Measure): AdvanceChoice {
  const expected = [...PROBE].reduce((sum, ch) => sum + staticAdvance(ch), 0)
  const drawn = measure(PROBE)
  if (Math.abs(drawn - expected) <= expected * TOLERANCE_RATIO)
    return { advance: staticAdvance, mismatch: false, drawn, expected }
  const cache = new Map<string, number>()
  const measured: AdvanceFn = (ch) => {
    let width = cache.get(ch)
    if (width === undefined) {
      width = measure(ch)
      cache.set(ch, width)
    }
    return width
  }
  return { advance: measured, mismatch: true, drawn, expected }
}

function canvasMeasure(): Measure | null {
  if (typeof document === 'undefined') return null
  const ctx = (document.createElement('canvas') as HTMLCanvasElement).getContext('2d')
  if (!ctx) return null
  ctx.font = `${PROBE_SIZE}px "${PIXEL_FONT_FAMILY}", sans-serif`
  return (text) => ctx.measureText(text).width
}

function decode(base64: string): Uint8Array {
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

let loading: Promise<void> | null = null
let ready = false
let chosen: AdvanceChoice = { advance: staticAdvance, mismatch: false, drawn: 0, expected: 0 }

/**
 * Register the built-in pixel font with `FontFace` — the same code under GJS
 * (`@gjsify/dom-elements`) and in a browser — and wait until it can draw. Nothing
 * may rasterise a dialogue page before this resolves: a canvas asked for an
 * unregistered family draws the fallback sans, and Pango remembers that answer.
 * Safe to call again; failures resolve (with one warning) so the game still opens.
 */
export function loadPixelFont(): Promise<void> {
  loading ??= (async () => {
    try {
      if (typeof FontFace !== 'undefined' && typeof document !== 'undefined' && document.fonts) {
        const bytes = decode(PIXEL_FONT_BASE64)
        const face = new FontFace(PIXEL_FONT_FAMILY, bytes.buffer as ArrayBuffer)
        document.fonts.add(face)
        await face.load()
      }
      const measure = canvasMeasure()
      if (measure) {
        chosen = chooseAdvance(measure)
        if (chosen.mismatch) {
          console.warn(
            `[engine] the canvas does not draw "${PIXEL_FONT_FAMILY}" at its known widths; laying text out with measured widths (probe ${chosen.drawn} vs ${chosen.expected})`,
          )
        }
      }
    } catch (error) {
      console.warn('[engine] the built-in pixel font could not be registered:', error)
    }
    ready = true
  })()
  return loading
}

/** True once {@link loadPixelFont} has settled. */
export function pixelFontReady(): boolean {
  return ready
}

/** Advance of one character at the dialogue font size, in UI pixels. Valid after {@link loadPixelFont}. */
export const pixelAdvance: AdvanceFn = (ch) => chosen.advance(ch)

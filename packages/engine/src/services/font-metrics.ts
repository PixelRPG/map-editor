import type { AdvanceFn } from './text-layout'

/**
 * Glyph advances of one bitmap font at its native size, in UI pixels.
 * Generated at build time (`scripts/fonts/build-fusion-pixel.py`) and
 * shipped as source, so measuring text costs one Map lookup per character
 * and needs no font file, no canvas and no GTK.
 */
export interface FontMetricsData {
  readonly id: string
  /** The size in px the advances are for. */
  readonly size: number
  /** Advance of a character the font has no glyph for (its `.notdef`). */
  readonly fallbackAdvance: number
  /** Advance in px (as a string key) → every character that has it. */
  readonly advances: Readonly<Record<string, string>>
}

/** An {@link AdvanceFn} backed by `data`; unknown characters get `fallbackAdvance`. */
export function createAdvanceFn(data: FontMetricsData): AdvanceFn {
  const table = new Map<string, number>()
  for (const [advance, chars] of Object.entries(data.advances)) {
    for (const ch of chars) table.set(ch, Number(advance))
  }
  return (ch) => table.get(ch) ?? data.fallbackAdvance
}

/** True when `data` has a glyph for every code point of `text`. */
export function coversText(data: FontMetricsData, text: string): boolean {
  const all = new Set<string>()
  for (const chars of Object.values(data.advances)) for (const ch of chars) all.add(ch)
  for (const ch of text) if (!all.has(ch)) return false
  return true
}

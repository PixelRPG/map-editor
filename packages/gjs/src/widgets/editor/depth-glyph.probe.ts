import { DepthGlyph } from './depth-glyph.ts'
import { depthGlyphProbes, GLYPH_PLANES, type GlyphPlane } from './depth-glyph.geometry.ts'
import { type Rgb, renderSquare } from './pixel-probe.ts'

/**
 * Display-backed half of the glyph's "distinguishable at 14 px" claim:
 * render a real `PixelRpgDepthGlyph` through the window's GSK renderer
 * and read the three probe pixels of `depth-glyph.geometry.ts` back.
 * `depth-glyph.geometry.spec.ts` proves the probes cannot overlap on
 * paper; this proves the rendered pixels carry the colour where the
 * paper says. GTK-only — `depth-glyph.probe.spec.ts` loads this module
 * lazily so the node test bundle never evaluates it. The window pumping
 * and pixel download live in `pixel-probe.ts`, shared with the brush
 * badge.
 */

export interface GlyphProbeResult {
  plane: GlyphPlane
  size: number
  /** The probe pixel of every plane's element, for the glyph highlighting `plane`. */
  pixels: Record<GlyphPlane, Rgb>
}

/** Render one glyph state at `size` and sample the three probes. */
export function renderGlyphProbe(plane: GlyphPlane, size: number, pngPath?: string): GlyphProbeResult {
  const reader = renderSquare(() => new DepthGlyph({ plane, size }), size, pngPath)
  const pixels = {} as Record<GlyphPlane, Rgb>
  const probes = depthGlyphProbes(size)
  for (const p of GLYPH_PLANES) {
    const { x, y } = probes[p]
    pixels[p] = reader.at(x, y)
  }
  return { plane, size, pixels }
}

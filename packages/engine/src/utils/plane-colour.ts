import type { LayerPlane } from '../types/data/LayerData.ts'

/**
 * The one home for "green is below the hero, orange is the hero's own
 * plane, blue is above it".
 *
 * Plain hex rather than Adwaita palette names because the canvas is
 * Excalibur, not GTK: the paint ghost is tinted by multiplying a
 * `Color`, and there is no style context out there to resolve a named
 * colour against. The GTK side (`depth-glyph.geometry.ts`) still looks
 * the names up and uses these as its fallbacks, so both surfaces agree
 * on the same three values.
 *
 * FIXED, not derived from the accent: under a colourful accent in a dark
 * theme all three would collapse into one hue.
 */
export const PLANE_TINT: Record<LayerPlane, string> = {
  ground: '#33d17a',
  hero: '#ff7800',
  overlay: '#3584e4',
}

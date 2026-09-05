// Pure geometry behind `PixelRpgDepthGlyph`: where each element of the
// side-view sits inside a `size × size` square, and one probe pixel per
// plane that lies inside that plane's element and outside every other
// drawn shape. GTK-free so the "three states are distinguishable at
// 14 px" claim is a unit test, not an assumption — the widget draws from
// exactly these rectangles and the display-backed pixel probe reads the
// same points back.

/** The three planes the glyph can highlight, in render order (low → high). */
export type GlyphPlane = 'ground' | 'hero' | 'overlay'

export const GLYPH_PLANES: readonly GlyphPlane[] = ['ground', 'hero', 'overlay'] as const

/** Sizes the glyph is used at: section header, row badge / popover row, top-bar chip. */
export const GLYPH_SIZES = { header: 40, row: 24, chip: 14 } as const

/** Axis-aligned rectangle in glyph pixels. */
export interface GlyphRect {
  x: number
  y: number
  w: number
  h: number
}

/** Every drawn shape of the glyph, in draw order, for one `size`. */
export interface DepthGlyphGeometry {
  size: number
  /** Ground slab — the "Below the hero" element (drawn first). */
  ground: GlyphRect
  /** Corner radius of both slabs. */
  slabRadius: number
  /** Box the hero sprite is fitted into, feet on the ground slab. */
  heroBox: GlyphRect
  /** Fallback silhouette: head disc … */
  heroHead: { cx: number; cy: number; r: number }
  /** … and rounded body, when no sprite paintable is set. */
  heroBody: GlyphRect
  /** Block beside the hero's legs — the "At hero height" element. */
  hero: GlyphRect
  /** Roof slab — the "Above the hero" element (drawn last, cuts the head). */
  overlay: GlyphRect
}

const rect = (size: number, x0: number, y0: number, x1: number, y1: number): GlyphRect => ({
  x: x0 * size,
  y: y0 * size,
  w: (x1 - x0) * size,
  h: (y1 - y0) * size,
})

/** The glyph's layout for a given side length. All coordinates relative to `size`. */
export function depthGlyphGeometry(size: number): DepthGlyphGeometry {
  return {
    size,
    ground: rect(size, 0.08, 0.72, 0.92, 0.86),
    slabRadius: 0.06 * size,
    heroBox: rect(size, 0.3, 0.18, 0.7, 0.74),
    heroHead: { cx: 0.5 * size, cy: 0.3 * size, r: 0.1 * size },
    heroBody: rect(size, 0.37, 0.4, 0.63, 0.74),
    hero: rect(size, 0.72, 0.56, 0.9, 0.74),
    overlay: rect(size, 0.08, 0.06, 0.92, 0.22),
  }
}

/** The element a plane highlights — the rect that carries the plane colour. */
export function highlightRect(geometry: DepthGlyphGeometry, plane: GlyphPlane): GlyphRect {
  return geometry[plane]
}

/**
 * One pixel per plane (integer coordinates of the pixel's top-left)
 * that a screenshot can read to tell which band carries the colour:
 * the middle of the ground slab, the middle of the hero-height block,
 * the middle of the roof slab.
 */
export function depthGlyphProbes(size: number): Record<GlyphPlane, { x: number; y: number }> {
  return {
    ground: { x: Math.floor(0.5 * size), y: Math.floor(0.79 * size) },
    hero: { x: Math.floor(0.81 * size), y: Math.floor(0.65 * size) },
    overlay: { x: Math.floor(0.5 * size), y: Math.floor(0.14 * size) },
  }
}

/** Whether the whole unit pixel at `(px, py)` lies inside `r`. */
export function pixelInside(r: GlyphRect, px: number, py: number): boolean {
  return px >= r.x && px + 1 <= r.x + r.w && py >= r.y && py + 1 <= r.y + r.h
}

/** Whether the unit pixel at `(px, py)` touches `r` at all. */
export function pixelOverlaps(r: GlyphRect, px: number, py: number): boolean {
  return px < r.x + r.w && px + 1 > r.x && py < r.y + r.h && py + 1 > r.y
}

/** Bounding box of the silhouette's head disc, for conservative overlap checks. */
export function headBounds(geometry: DepthGlyphGeometry): GlyphRect {
  const { cx, cy, r } = geometry.heroHead
  return { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }
}

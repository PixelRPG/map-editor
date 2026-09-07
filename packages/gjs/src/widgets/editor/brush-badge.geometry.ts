// Pure geometry behind `PixelRpgBrushBadge`: where the tile picture, the
// plane ring, the tool disc and the tool icon sit inside a `size × size`
// square, plus one probe pixel per element that a screenshot can read
// back. GTK-free, so "the disc never covers enough of the tile to hide
// it" and "the ring, the disc and the picture never overlap at their
// probes" are unit tests rather than assumptions — the widget draws from
// exactly these rectangles and `brush-badge.probe.ts` reads the same
// points out of a rendered texture.

import type { EditorTool } from '@pixelrpg/engine'

/** The two sizes the badge ships at: the wide pill's chip and the phone bar's. */
export const BADGE_SIZES = { wide: 32, phone: 44 } as const

/** Fraction of the square the tool disc may cover before it hides the tile. */
export const MAX_DISC_COVERAGE = 0.2

/** Axis-aligned rectangle in badge pixels. */
export interface BadgeRect {
  x: number
  y: number
  w: number
  h: number
}

/** A filled circle in badge pixels. */
export interface BadgeDisc {
  cx: number
  cy: number
  r: number
}

/** Every drawn element of the badge, in draw order, for one `size`. */
export interface BrushBadgeGeometry {
  size: number
  /** The rounded square everything is clipped to — well, picture and ring share it. */
  frame: BadgeRect
  /** Corner radius of the frame. */
  radius: number
  /** Width of the plane ring, drawn as an inset border on `frame`. */
  ringWidth: number
  /** The tile picture, drawn inside a rounded clip of `frame`. */
  picture: BadgeRect
  /** Side of one checkerboard cell of the Erase state's "empty" pattern. */
  checkerCell: number
  /** The tool disc in the bottom-right corner. */
  disc: BadgeDisc
  /** The symbolic tool icon, centred in the disc. */
  icon: BadgeRect
}

/**
 * The badge's layout for a given side length. Every coordinate is a
 * fraction of `size`, so the 32 px chip and the 44 px phone badge are
 * the same picture at two scales.
 *
 * The disc is inscribed in the corner — centre at `size − r − 1` — not
 * at the `size − 0.22 · size` of the design sketch. With the sketch's
 * centre the disc's right edge lands at `1.03 · size`, about 1 px
 * outside the widget at 32 px and 1.3 px at 44 px, where the rounded
 * clip cuts it into a lens; `discFitsInside` is the assertion that
 * caught it. The `−1` is the disc's own outline, which has to fit too.
 */
export function brushBadgeGeometry(size: number): BrushBadgeGeometry {
  const frame: BadgeRect = { x: 0, y: 0, w: size, h: size }
  const discR = 0.25 * size
  const discC = size - discR - 1
  const iconSide = 0.3 * size
  return {
    size,
    frame,
    radius: 0.19 * size,
    ringWidth: 2,
    picture: frame,
    checkerCell: Math.max(2, Math.round(size / 8)),
    disc: { cx: discC, cy: discC, r: discR },
    icon: { x: discC - iconSide / 2, y: discC - iconSide / 2, w: iconSide, h: iconSide },
  }
}

/** Fraction of the square the tool disc covers. */
export function discCoverage(geometry: BrushBadgeGeometry): number {
  const { r } = geometry.disc
  return (Math.PI * r * r) / (geometry.size * geometry.size)
}

/** Whether the whole disc (plus its 1 px outline) lies inside the square. */
export function discFitsInside(geometry: BrushBadgeGeometry): boolean {
  const { cx, cy, r } = geometry.disc
  const outer = r + 1
  return cx - outer >= 0 && cy - outer >= 0 && cx + outer <= geometry.size && cy + outer <= geometry.size
}

/** Integer pixel coordinates a screenshot reads back. */
export interface BadgeProbe {
  x: number
  y: number
}

/**
 * One probe pixel per element:
 *
 * - `ring` — the middle of the top border band, where the plane colour
 *   is and where neither the disc nor the icon can reach.
 * - `discFill` — inside the disc, to the right of the icon box, so it
 *   reads the disc's near-white fill and never the icon's ink.
 * - `picture` — upper-left quadrant of the tile, clear of the border
 *   band and of the disc.
 */
export function brushBadgeProbes(size: number): Record<'ring' | 'discFill' | 'picture', BadgeProbe> {
  const g = brushBadgeGeometry(size)
  return {
    ring: { x: Math.floor(0.5 * size), y: Math.floor(g.ringWidth / 2) },
    discFill: { x: Math.floor(g.disc.cx + 0.19 * size), y: Math.floor(g.disc.cy) },
    picture: { x: Math.floor(0.3 * size), y: Math.floor(0.3 * size) },
  }
}

/** Whether the unit pixel at `(px, py)` lies inside the disc. */
export function pixelInDisc(disc: BadgeDisc, px: number, py: number): boolean {
  const dx = px + 0.5 - disc.cx
  const dy = py + 0.5 - disc.cy
  return dx * dx + dy * dy <= disc.r * disc.r
}

/** Whether the unit pixel at `(px, py)` touches the tool icon's box. */
export function pixelInIconBox(geometry: BrushBadgeGeometry, px: number, py: number): boolean {
  const r = geometry.icon
  return px < r.x + r.w && px + 1 > r.x && py < r.y + r.h && py + 1 > r.y
}

/** Whether the unit pixel at `(px, py)` lies inside the ring's border band. */
export function pixelInRing(geometry: BrushBadgeGeometry, px: number, py: number): boolean {
  const { size, ringWidth } = geometry
  if (px < 0 || py < 0 || px >= size || py >= size) return false
  return px + 1 <= ringWidth || py + 1 <= ringWidth || px >= size - ringWidth || py >= size - ringWidth
}

/**
 * How the badge renders the tile picture for each tool. The badge answers
 * "what will a drag do", so the picture is the tool's subject:
 *
 * - `tile` — the active tile as it is (Paint, Fill, Pick).
 * - `object` — the armed object brush, contain-fitted.
 * - `empty` — no picture: a checkerboard meaning "this removes tiles".
 * - `ghost` — the tile at reduced opacity, because Select lays nothing.
 */
export type BadgeSubject = 'tile' | 'object' | 'empty' | 'ghost'

/** Opacity of the `ghost` subject. */
export const GHOST_OPACITY = 0.4

/** What the badge draws in the picture slot for `tool`. */
export function subjectFor(tool: EditorTool): BadgeSubject {
  switch (tool) {
    case 'eraser':
      return 'empty'
    case 'select':
      return 'ghost'
    case 'object':
      return 'object'
    default:
      return 'tile'
  }
}

/**
 * Symbolic icon per tool — the same table the tool chooser uses, so the
 * disc and the checked toggle always show the same glyph.
 * `color-fill-symbolic` is a bundled app icon (the Adwaita theme has no
 * bucket-fill glyph).
 */
export const TOOL_ICONS: Record<EditorTool, string> = {
  select: 'edit-select-symbolic',
  pencil: 'document-edit-symbolic',
  fill: 'color-fill-symbolic',
  eraser: 'edit-clear-all-symbolic',
  eyedropper: 'color-select-symbolic',
  object: 'view-grid-symbolic',
}

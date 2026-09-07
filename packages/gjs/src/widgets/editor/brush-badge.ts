import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import type { EditorTool, LayerPlane } from '@pixelrpg/engine'

import {
  BADGE_SIZES,
  type BadgeRect,
  type BrushBadgeGeometry,
  brushBadgeGeometry,
  GHOST_OPACITY,
  subjectFor,
  TOOL_ICONS,
} from './brush-badge.geometry.ts'
import { PLANE_COLOR } from './depth-glyph.geometry.ts'

const FG_FALLBACK = '#000000'
/** Alpha of the empty well, visible only under a transparent tile. */
const WELL_ALPHA = 0.08
/** The disc is near-white so a dark symbolic icon reads on it over any tile. */
const DISC_ALPHA = 0.92
/** A hairline dark ring keeps the disc's edge visible over a white tile. */
const DISC_OUTLINE = 'rgba(0,0,0,0.5)'
const ICON_ALPHA = 0.8
/** The two greys of the Erase state's "nothing here" checkerboard. */
const CHECKER_LIGHT = 'rgba(255,255,255,0.30)'
const CHECKER_DARK = 'rgba(0,0,0,0.30)'

/**
 * The one glyph that answers "what will a drag do": *this picture*,
 * *this way*, *on this plane*.
 *
 * Three facts a person needs on every stroke, in one 32 px (wide) or
 * 44 px (phone) square, so they do not need three labelled containers:
 *
 * - **which tile** — the tile paintable fills the square, at 2× a 16 px
 *   tile, which is larger than the 22 px swatch it replaces;
 * - **which tool** — a white corner disc carrying the tool's symbolic
 *   icon, covering under a fifth of the square so the tile stays
 *   identifiable ({@link discCoverage} asserts the bound);
 * - **which layer** — a 2 px ring in the active layer's plane colour,
 *   the same fixed green / orange / blue the depth glyph, the Layers
 *   tab headers and the plane chips use.
 *
 * Raw `Gtk.Widget` with a single `vfunc_snapshot`, the pattern of
 * {@link DepthGlyph}. All geometry comes from `brush-badge.geometry.ts`,
 * whose spec proves the three elements stay separable at both sizes and
 * whose probes `brush-badge.probe.ts` reads back from real pixels.
 */
export class BrushBadge extends Gtk.Widget {
  private _size: number = BADGE_SIZES.wide
  private _tool: EditorTool = 'select'
  private _plane: LayerPlane = 'ground'
  private _tilePaintable: Gdk.Paintable | null = null
  private _iconCache = new Map<string, Gtk.IconPaintable>()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgBrushBadge',
        CssName: 'brushbadge',
        Properties: {
          size: GObject.ParamSpec.int(
            'size',
            'Size',
            'Side length of the badge in pixels',
            GObject.ParamFlags.READWRITE,
            16,
            96,
            BADGE_SIZES.wide,
          ),
          tool: GObject.ParamSpec.string(
            'tool',
            'Tool',
            'The armed editor tool, drawn as the icon in the corner disc',
            GObject.ParamFlags.READWRITE,
            'select',
          ),
          plane: GObject.ParamSpec.string(
            'plane',
            'Plane',
            "The active layer's plane, drawn as the ring colour",
            GObject.ParamFlags.READWRITE,
            'ground',
          ),
          'tile-paintable': GObject.ParamSpec.object(
            'tile-paintable',
            'Tile Paintable',
            'The active tile (or armed object) drawn as the picture',
            GObject.ParamFlags.READWRITE,
            Gdk.Paintable.$gtype,
          ),
        },
      },
      BrushBadge,
    )
  }

  constructor(
    params: Partial<{
      size: number
      tool: EditorTool
      plane: LayerPlane
      tilePaintable: Gdk.Paintable | null
    }> = {},
  ) {
    super()
    this.halign = Gtk.Align.CENTER
    this.valign = Gtk.Align.CENTER
    if (params.size !== undefined) this.size = params.size
    if (params.tool !== undefined) this.tool = params.tool
    if (params.plane !== undefined) this.plane = params.plane
    if (params.tilePaintable !== undefined) this.tilePaintable = params.tilePaintable
    this.width_request = this._size
    this.height_request = this._size
    this.update_property([Gtk.AccessibleProperty.LABEL], ['Brush'])
  }

  get size(): number {
    return this._size ?? BADGE_SIZES.wide
  }

  set size(value: number) {
    if (this._size === value) return
    this._size = value
    this.width_request = value
    this.height_request = value
    this.notify('size')
    this.queue_resize()
    this.queue_draw()
  }

  get tool(): EditorTool {
    return this._tool ?? 'select'
  }

  set tool(value: EditorTool) {
    if (this._tool === value) return
    this._tool = value
    this.notify('tool')
    this.queue_draw()
  }

  get plane(): LayerPlane {
    return this._plane ?? 'ground'
  }

  set plane(value: LayerPlane) {
    if (this._plane === value) return
    this._plane = value
    this.notify('plane')
    this.queue_draw()
  }

  get tilePaintable(): Gdk.Paintable | null {
    return this._tilePaintable ?? null
  }

  set tilePaintable(value: Gdk.Paintable | null) {
    if (this._tilePaintable === value) return
    this._tilePaintable = value
    this.notify('tile-paintable')
    this.queue_draw()
  }

  /** The accessible description the pill's tooltip also carries ("Paint · Ground"). */
  setAccessibleLabel(label: string): void {
    this.update_property([Gtk.AccessibleProperty.LABEL], [label])
  }

  vfunc_measure(_orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    return [this._size, this._size, -1, -1]
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const size = this._size
    const g = brushBadgeGeometry(size)
    const fg = this._namedColor('window_fg_color', FG_FALLBACK)

    snapshot.save()
    snapshot.translate(
      new Graphene.Point({
        x: Math.floor((this.get_width() - size) / 2),
        y: Math.floor((this.get_height() - size) / 2),
      }),
    )

    // 1. The well — visible only where the tile is transparent.
    fillRounded(snapshot, g.frame, g.radius, withAlpha(fg, WELL_ALPHA))
    // 2. The picture: what the tool lays.
    this._drawSubject(snapshot, g)
    // 3. The plane ring, over the picture so the colour always reads.
    this._drawRing(snapshot, g)
    // 4. The tool disc, last, in the corner.
    this._drawDisc(snapshot, g)

    snapshot.restore()
  }

  private _drawSubject(snapshot: Gtk.Snapshot, g: BrushBadgeGeometry): void {
    const subject = subjectFor(this._tool)
    if (subject === 'empty') {
      this._drawChecker(snapshot, g)
      return
    }
    const paintable = this._tilePaintable
    if (!paintable) return
    const rect = toRect(g.picture)
    const rounded = new Gsk.RoundedRect()
    rounded.init_from_rect(rect, g.radius)
    snapshot.push_rounded_clip(rounded)
    if (subject === 'ghost') snapshot.push_opacity(GHOST_OPACITY)
    if (subject === 'object') {
      // An object sprite is not tile-shaped; contain-fit it so it is not
      // stretched, exactly as the object palette cells do.
      const iw = paintable.get_intrinsic_width()
      const ih = paintable.get_intrinsic_height()
      const scale = iw > 0 && ih > 0 ? Math.min(g.picture.w / iw, g.picture.h / ih) : 1
      const w = iw > 0 ? iw * scale : g.picture.w
      const h = ih > 0 ? ih * scale : g.picture.h
      snapshot.save()
      snapshot.translate(new Graphene.Point({ x: (g.picture.w - w) / 2, y: (g.picture.h - h) / 2 }))
      paintable.snapshot(snapshot, w, h)
      snapshot.restore()
    } else {
      paintable.snapshot(snapshot, g.picture.w, g.picture.h)
    }
    if (subject === 'ghost') snapshot.pop()
    snapshot.pop()
  }

  /** "Nothing goes here" — the checkerboard every image editor uses for empty. */
  private _drawChecker(snapshot: Gtk.Snapshot, g: BrushBadgeGeometry): void {
    const rect = toRect(g.frame)
    const rounded = new Gsk.RoundedRect()
    rounded.init_from_rect(rect, g.radius)
    snapshot.push_rounded_clip(rounded)
    const cell = g.checkerCell
    const light = parseColor(CHECKER_LIGHT)
    const dark = parseColor(CHECKER_DARK)
    const cells = Math.ceil(g.size / cell)
    for (let row = 0; row < cells; row++) {
      for (let col = 0; col < cells; col++) {
        const square = new Graphene.Rect()
        square.init(col * cell, row * cell, cell, cell)
        snapshot.append_color((row + col) % 2 === 0 ? light : dark, square)
      }
    }
    snapshot.pop()
  }

  private _drawRing(snapshot: Gtk.Snapshot, g: BrushBadgeGeometry): void {
    const plane = this.plane
    const spec = PLANE_COLOR[plane] ?? PLANE_COLOR.ground
    const color = this._namedColor(spec.name, spec.fallback)
    const outline = new Gsk.RoundedRect()
    outline.init_from_rect(toRect(g.frame), g.radius)
    const w = g.ringWidth
    snapshot.append_border(outline, [w, w, w, w], [color, color, color, color])
  }

  private _drawDisc(snapshot: Gtk.Snapshot, g: BrushBadgeGeometry): void {
    const { cx, cy, r } = g.disc
    const outer: BadgeRect = { x: cx - r - 1, y: cy - r - 1, w: 2 * (r + 1), h: 2 * (r + 1) }
    fillRounded(snapshot, outer, r + 1, parseColor(DISC_OUTLINE))
    const inner: BadgeRect = { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }
    const white = new Gdk.RGBA({ red: 1, green: 1, blue: 1, alpha: DISC_ALPHA })
    fillRounded(snapshot, inner, r, white)

    const icon = this._loadIcon(TOOL_ICONS[this.tool] ?? TOOL_ICONS.select, Math.round(g.icon.w))
    if (!icon) return
    const ink = new Gdk.RGBA({ red: 0, green: 0, blue: 0, alpha: ICON_ALPHA })
    snapshot.save()
    snapshot.translate(new Graphene.Point({ x: g.icon.x, y: g.icon.y }))
    icon.snapshot_symbolic(snapshot, g.icon.w, g.icon.h, [ink])
    snapshot.restore()
  }

  private _loadIcon(name: string, px: number): Gtk.IconPaintable | null {
    const key = `${name}@${px}`
    const cached = this._iconCache.get(key)
    if (cached) return cached
    const display = this.get_display()
    if (!display) return null
    const theme = Gtk.IconTheme.get_for_display(display)
    const icon = theme.lookup_icon(
      name,
      null,
      px,
      this.get_scale_factor(),
      Gtk.TextDirection.NONE,
      Gtk.IconLookupFlags.FORCE_SYMBOLIC,
    )
    this._iconCache.set(key, icon)
    return icon
  }

  private _namedColor(name: string, fallback: string): Gdk.RGBA {
    const [found, color] = this.get_style_context().lookup_color(name)
    if (found) return color
    return parseColor(fallback)
  }
}

function toRect(r: BadgeRect): Graphene.Rect {
  const rect = new Graphene.Rect()
  rect.init(r.x, r.y, r.w, r.h)
  return rect
}

function fillRounded(snapshot: Gtk.Snapshot, r: BadgeRect, radius: number, color: Gdk.RGBA): void {
  const rect = toRect(r)
  const rounded = new Gsk.RoundedRect()
  rounded.init_from_rect(rect, radius)
  snapshot.push_rounded_clip(rounded)
  snapshot.append_color(color, rect)
  snapshot.pop()
}

function parseColor(spec: string): Gdk.RGBA {
  const rgba = new Gdk.RGBA()
  rgba.parse(spec)
  return rgba
}

function withAlpha(color: Gdk.RGBA, alpha: number): Gdk.RGBA {
  return new Gdk.RGBA({ red: color.red, green: color.green, blue: color.blue, alpha })
}

GObject.type_ensure(BrushBadge.$gtype)

import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@gjsify/storybook'
import type { EditorTool, LayerPlane } from '@pixelrpg/engine'

import { BADGE_SIZES } from './brush-badge.geometry'
import { BrushBadge } from './brush-badge'
import { GLYPH_PLANES } from './depth-glyph.geometry'

const TOOLS: readonly EditorTool[] = ['select', 'pencil', 'fill', 'eraser', 'eyedropper', 'object'] as const

/**
 * Showcase for the brush badge: the controlled instance, a strip of all
 * six tools at the wide size, and a strip of the three planes at the
 * phone size — so "the tile is still identifiable under the disc" and
 * "the three rings are visibly different" can be checked by eye next to
 * each other.
 */
export class BrushBadgeStory extends StoryWidget {
  private _badge: BrushBadge | null = null

  static {
    GObject.registerClass({ GTypeName: 'BrushBadgeStory' }, BrushBadgeStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { tool: 'pencil', plane: 'ground', size: BADGE_SIZES.phone },
      meta: BrushBadgeStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Brush Badge',
      description:
        'The active tile, the armed tool in a corner disc, and the active layer’s plane as a coloured ring — the three facts a stroke needs, in one square.',
      component: BrushBadge.$gtype,
      controls: [
        {
          name: 'tool',
          label: 'Tool',
          type: ControlType.SELECT,
          options: TOOLS.map((tool) => ({ label: tool, value: tool })),
        },
        {
          name: 'plane',
          label: 'Plane',
          type: ControlType.SELECT,
          options: GLYPH_PLANES.map((plane) => ({ label: plane, value: plane })),
        },
        { name: 'size', label: 'Size', type: ControlType.RANGE, min: 16, max: 96, step: 2 },
      ],
    }
  }

  initialize(): void {
    const column = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 18 })
    const tile = checkerTile()

    this._badge = new BrushBadge({
      tool: this.args.tool as EditorTool,
      plane: this.args.plane as LayerPlane,
      size: this.args.size as number,
      tilePaintable: tile,
    })
    column.append(this._badge)

    const tools = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12, halign: Gtk.Align.CENTER })
    for (const tool of TOOLS) {
      tools.append(new BrushBadge({ tool, plane: 'ground', size: BADGE_SIZES.wide, tilePaintable: tile }))
    }
    column.append(tools)

    const planes = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12, halign: Gtk.Align.CENTER })
    for (const plane of GLYPH_PLANES) {
      planes.append(new BrushBadge({ tool: 'pencil', plane, size: BADGE_SIZES.phone, tilePaintable: tile }))
    }
    column.append(planes)

    this.addContent(column)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._badge) return
    if (typeof this.args.tool === 'string') this._badge.tool = this.args.tool as EditorTool
    if (typeof this.args.plane === 'string') this._badge.plane = this.args.plane as LayerPlane
    if (typeof this.args.size === 'number') this._badge.size = this.args.size
  }
}

/** A 16 px stand-in "tile" so the story does not need a project loaded. */
function checkerTile(): Gdk.Paintable | null {
  const snapshot = Gtk.Snapshot.new()
  const colours = ['#6ab04c', '#4a8033']
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const rect = new Graphene.Rect()
      rect.init(col * 4, row * 4, 4, 4)
      const rgba = new Gdk.RGBA()
      rgba.parse(colours[(row + col) % 2])
      snapshot.append_color(rgba, rect)
    }
  }
  const node = snapshot.to_node()
  if (!node) return null
  const viewport = new Graphene.Rect()
  viewport.init(0, 0, 16, 16)
  const renderer = Gsk_softwareRenderer()
  if (!renderer) return null
  return renderer.render_texture(node, viewport)
}

let cached: Gtk.Window | null = null

function Gsk_softwareRenderer() {
  if (!cached) {
    cached = new Gtk.Window({ default_width: 8, default_height: 8, decorated: false })
    cached.present()
  }
  return cached.get_renderer()
}

GObject.type_ensure(BrushBadgeStory.$gtype)

export const BrushBadgeStories: StoryModule = { stories: [BrushBadgeStory] }

import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@gjsify/storybook'
import { DepthGlyph } from './depth-glyph'
import { GLYPH_PLANES, GLYPH_SIZES, type GlyphPlane } from './depth-glyph.geometry'

/**
 * Showcase for the depth glyph: the controlled instance at the chosen
 * size, plus a fixed strip of all three planes at each of the three
 * sizes it ships at, so the 14 px chip state can be eyeballed next to
 * the 40 px header state.
 */
export class DepthGlyphStory extends StoryWidget {
  private _glyph: DepthGlyph | null = null

  static {
    GObject.registerClass({ GTypeName: 'DepthGlyphStory' }, DepthGlyphStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { plane: 'hero', size: GLYPH_SIZES.header, active: false },
      meta: DepthGlyphStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Depth Glyph',
      description:
        'Side view of the hero with one plane highlighted — ground slab, block beside the legs, or roof slab. Used at 40 / 24 / 14 px.',
      component: DepthGlyph.$gtype,
      controls: [
        {
          name: 'plane',
          label: 'Plane',
          type: ControlType.SELECT,
          options: GLYPH_PLANES.map((plane) => ({ label: plane, value: plane })),
        },
        { name: 'size', label: 'Size', type: ControlType.RANGE, min: GLYPH_SIZES.chip, max: 64, step: 1 },
        { name: 'active', label: 'Active', type: ControlType.BOOLEAN },
      ],
    }
  }

  initialize(): void {
    const column = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 18 })
    this._glyph = new DepthGlyph({
      plane: this.args.plane as GlyphPlane,
      size: this.args.size as number,
      active: this.args.active as boolean,
    })
    column.append(this._glyph)
    for (const size of [GLYPH_SIZES.header, GLYPH_SIZES.row, GLYPH_SIZES.chip]) {
      const strip = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12, halign: Gtk.Align.CENTER })
      for (const plane of GLYPH_PLANES) strip.append(new DepthGlyph({ plane, size }))
      column.append(strip)
    }
    this.addContent(column)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._glyph) return
    if (typeof this.args.plane === 'string') this._glyph.plane = this.args.plane as GlyphPlane
    if (typeof this.args.size === 'number') this._glyph.size = this.args.size
    if (typeof this.args.active === 'boolean') this._glyph.active = this.args.active
  }
}

GObject.type_ensure(DepthGlyphStory.$gtype)

export const DepthGlyphStories: StoryModule = { stories: [DepthGlyphStory] }

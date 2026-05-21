import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@pixelrpg/story-gjs'
import { ContextChip } from './context-chip'

/** Showcase for the active-tile + active-layer OSD chip. */
export class ContextChipStory extends StoryWidget {
  private _chip: ContextChip | null = null

  static {
    GObject.registerClass({ GTypeName: 'ContextChipStory' }, ContextChipStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { tileName: 'Grass A', layerName: 'Background' },
      meta: ContextChipStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Context Chip',
      description: 'Top-right OSD chip with active-tile and active-layer dropdowns separated by a vertical rule.',
      component: ContextChip.$gtype,
      controls: [
        { name: 'tileName', label: 'Tile name', type: ControlType.TEXT },
        { name: 'layerName', label: 'Layer name', type: ControlType.TEXT },
      ],
    }
  }

  initialize(): void {
    this._chip = new ContextChip()
    this._chip.tileName = this.args.tileName as string
    this._chip.layerName = this.args.layerName as string
    this._chip.setTilePopover(this._makePopover('Tile palette goes here'))
    this._chip.setLayerPopover(this._makePopover('Layer list goes here'))
    this.addContent(this._chip)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._chip) return
    if (typeof this.args.tileName === 'string') this._chip.tileName = this.args.tileName
    if (typeof this.args.layerName === 'string') this._chip.layerName = this.args.layerName
  }

  private _makePopover(text: string): Gtk.Popover {
    const pop = new Gtk.Popover()
    const label = new Gtk.Label({ label: text, margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12 })
    pop.set_child(label)
    return pop
  }
}

GObject.type_ensure(ContextChipStory.$gtype)

export const ContextChipStories: StoryModule = { stories: [ContextChipStory] }

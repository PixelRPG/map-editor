import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@gjsify/storybook'
import { LayerRow } from './layer-row'

/** Showcase for a single layer row. */
export class LayerRowStory extends StoryWidget {
  private _row: LayerRow | null = null

  static {
    GObject.registerClass({ GTypeName: 'LayerRowStory' }, LayerRowStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: {
        layerName: 'Background',
        tileCount: 248,
        visible: true,
        locked: false,
        active: true,
      },
      meta: LayerRowStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Layer Row',
      description: 'Single row in the Layers inspector tab: visibility toggle, name, tile-count badge, lock toggle.',
      component: LayerRow.$gtype,
      controls: [
        { name: 'layerName', label: 'Layer name', type: ControlType.TEXT },
        { name: 'tileCount', label: 'Tile count', type: ControlType.RANGE, min: 0, max: 9999, step: 1 },
        { name: 'visible', label: 'Visible', type: ControlType.BOOLEAN },
        { name: 'locked', label: 'Locked', type: ControlType.BOOLEAN },
        { name: 'active', label: 'Active', type: ControlType.BOOLEAN },
      ],
    }
  }

  initialize(): void {
    this._row = new LayerRow({
      layerName: this.args.layerName as string,
      tileCount: this.args.tileCount as number,
      visible: this.args.visible as boolean,
      locked: this.args.locked as boolean,
      active: this.args.active as boolean,
    })
    // Mirror toggles back into story args so the Controls panel stays in
    // sync when the user clicks the visibility / lock buttons.
    this._row.connect('notify::visible', () => {
      this.args = { ...this.args, visible: this._row!.visible }
    })
    this._row.connect('notify::locked', () => {
      this.args = { ...this.args, locked: this._row!.locked }
    })
    this.addContent(this._row)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._row) return
    if (typeof this.args.layerName === 'string') this._row.layerName = this.args.layerName
    if (typeof this.args.tileCount === 'number') this._row.tileCount = this.args.tileCount
    if (typeof this.args.visible === 'boolean') this._row.visible = this.args.visible
    if (typeof this.args.locked === 'boolean') this._row.locked = this.args.locked
    if (typeof this.args.active === 'boolean') this._row.active = this.args.active
  }
}

GObject.type_ensure(LayerRowStory.$gtype)

export const LayerRowStories: StoryModule = { stories: [LayerRowStory] }

import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@gjsify/storybook'
import { MapPreview } from './map-preview'

/** Project the "real project" stories render (relative to the storybook cwd). */
const TEMPLATE_PROJECT = '../../games/zelda-like/game-project.json'

/**
 * Showcase: the unloaded state. Until a bake lands the widget paints its
 * accent colour, so a card never flashes blank while its project loads.
 */
export class MapPreviewPlaceholderStory extends StoryWidget {
  private _preview: MapPreview | null = null

  static {
    GObject.registerClass({ GTypeName: 'MapPreviewPlaceholderStory' }, MapPreviewPlaceholderStory)
  }

  constructor() {
    super({
      story: 'Placeholder',
      args: { accentColor: '#3a3a40', size: 240 },
      meta: MapPreviewPlaceholderStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Map Preview',
      description:
        'Solid accent placeholder — what a preview paints before its bake is ready (and for a project with no tile data).',
      component: MapPreview.$gtype,
      controls: [
        { name: 'accentColor', label: 'Accent colour', type: ControlType.COLOR },
        { name: 'size', label: 'Size', type: ControlType.RANGE, min: 80, max: 480, step: 20 },
      ],
    }
  }

  initialize(): void {
    this._preview = new MapPreview()
    this._apply()
    this.addContent(this._preview)
  }

  updateArgs(_args: StoryArgs): void {
    this._apply()
  }

  private _apply(): void {
    if (!this._preview) return
    if (typeof this.args.accentColor === 'string') this._preview.accentColor = this.args.accentColor
    if (typeof this.args.size === 'number') this._preview.set_size_request(this.args.size, this.args.size)
  }
}

/**
 * Showcase: a real project loaded from disk in **fit** mode — the whole
 * map scaled into the widget, which is what the welcome view's template
 * cards show.
 */
export class MapPreviewProjectStory extends StoryWidget {
  private _preview: MapPreview | null = null

  static {
    GObject.registerClass({ GTypeName: 'MapPreviewProjectStory' }, MapPreviewProjectStory)
  }

  constructor() {
    super({
      story: 'Loaded project (fit)',
      args: { width: 320, height: 240 },
      meta: MapPreviewProjectStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Map Preview',
      description:
        'Bakes the zelda-like template map into a texture and paints it scaled to fit — the welcome-view template card mode.',
      component: MapPreview.$gtype,
      controls: [
        { name: 'width', label: 'Width', type: ControlType.RANGE, min: 120, max: 640, step: 20 },
        { name: 'height', label: 'Height', type: ControlType.RANGE, min: 90, max: 480, step: 20 },
      ],
    }
  }

  initialize(): void {
    this._preview = new MapPreview()
    this._apply()
    this.addContent(this._preview)
    void this._preview.loadProject(TEMPLATE_PROJECT)
  }

  updateArgs(_args: StoryArgs): void {
    this._apply()
  }

  private _apply(): void {
    if (!this._preview) return
    const width = typeof this.args.width === 'number' ? this.args.width : 320
    const height = typeof this.args.height === 'number' ? this.args.height : 240
    this._preview.set_size_request(width, height)
  }
}

GObject.type_ensure(MapPreviewPlaceholderStory.$gtype)
GObject.type_ensure(MapPreviewProjectStory.$gtype)

export const MapPreviewStories: StoryModule = {
  stories: [MapPreviewPlaceholderStory, MapPreviewProjectStory],
}

import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@gjsify/storybook'
import { GdkSpriteSetResource } from '../../sprite'
import type { BrushPage } from './brush-page'
import { EditorPages } from './editor-pages'
import { RightInspector } from './right-inspector'
import { sheetGridOf } from './tile-sheet.geometry'

/** Showcase for the inspector pane hosting the Brush/Layers/Selected pages. */
export class RightInspectorStory extends StoryWidget {
  private _inspector: RightInspector | null = null

  static {
    GObject.registerClass({ GTypeName: 'RightInspectorStory' }, RightInspectorStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { activePage: 'brush' },
      meta: RightInspectorStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Right Inspector',
      description: 'Right-pane host for the Brush · Layers · Selected pages; switcher bar at the bottom.',
      component: RightInspector.$gtype,
      controls: [
        {
          name: 'activePage',
          label: 'Active page',
          type: ControlType.SELECT,
          options: [
            { label: 'Brush', value: 'brush' },
            { label: 'Layers', value: 'layers' },
            { label: 'Selected', value: 'selected' },
          ],
        },
      ],
    }
  }

  initialize(): void {
    const inspector = new RightInspector()
    inspector.set_size_request(300, 520)
    // The app owns the page instances and hands them to whichever layout
    // is showing; the story plays that host. No field keeps `pages` alive:
    // `host()` parents each widget into a slot, and the slot holds the ref.
    const pages = new EditorPages()
    pages.host(inspector.pageSlots)
    void this._loadSheet(pages.brush)
    pages.layers.setLayers([
      { id: 'bg', name: 'Background', tileCount: 248, plane: 'ground' },
      { id: 'mid', name: 'Midground', tileCount: 96, plane: 'hero' },
      { id: 'fg', name: 'Foreground', tileCount: 18, plane: 'overlay' },
      { id: 'events', name: 'Events', tileCount: 6, locked: true },
    ])
    pages.layers.selectLayer('bg')
    pages.selected.setPlacement({
      placementId: 'placement-1',
      defId: 'deer',
      kind: 'Deer',
      tileX: 11,
      tileY: 4,
      layerName: 'Midground',
      paintable: null,
      definition: {
        id: 'deer',
        name: 'Startled deer',
        components: [{ type: 'collision' }],
      },
      baseComponentTypes: ['collision'],
      doorTarget: null,
    })
    inspector.visiblePage = (this.args.activePage as string) ?? 'brush'
    this._inspector = inspector
    this.addContent(inspector)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._inspector) return
    if (typeof this.args.activePage === 'string') this._inspector.visiblePage = this.args.activePage
  }

  /**
   * A real tileset rather than coloured squares: the Brush page's whole
   * point is that a two-tile tree reads as one tree, which synthetic
   * swatches cannot show.
   */
  private async _loadSheet(brush: BrushPage): Promise<void> {
    try {
      const resource = await GdkSpriteSetResource.fromPath('../../games/zelda-like/spritesets/kokiri-forest.json')
      const texture = resource.imageTexture?.texture ?? null
      const data = resource.data
      if (!texture || !data) return
      brush.setTilesets([{ id: data.id, name: data.name, sheet: texture }], data.id)
      brush.setSheet(texture, sheetGridOf(data, texture.get_width(), texture.get_height()))
      brush.selectTile(0)
    } catch (error) {
      console.error('RightInspectorStory: failed to load the sample tileset', error)
    }
  }
}

GObject.type_ensure(RightInspectorStory.$gtype)

export const RightInspectorStories: StoryModule = { stories: [RightInspectorStory] }

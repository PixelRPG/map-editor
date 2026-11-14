import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@gjsify/storybook'
import { buildDemoTiles } from '../../__demo__/world-sample'
import { EditorPages } from './editor-pages'
import { RightInspector } from './right-inspector'

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
    pages.brush.tilesetName = 'Lokiri Forest'
    pages.brush.setTiles(buildDemoTiles(20))
    pages.layers.setLayers([
      { id: 'bg', name: 'Background', tileCount: 248, plane: 'ground' },
      { id: 'mid', name: 'Midground', tileCount: 96, plane: 'hero' },
      { id: 'fg', name: 'Foreground', tileCount: 18, plane: 'overlay' },
      { id: 'events', name: 'Events', tileCount: 6, locked: true },
    ])
    pages.layers.selectLayer('bg')
    pages.selected.setScene({
      name: 'Whispering Forest',
      cols: 32,
      rows: 24,
      tilePx: 16,
      music: 'forest-loop.ogg',
      battleBg: 'forest-bg.png',
      encounters: 'Common slimes',
      onEnter: 'Spawn deer NPC',
    })
    inspector.visiblePage = (this.args.activePage as string) ?? 'brush'
    this._inspector = inspector
    this.addContent(inspector)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._inspector) return
    if (typeof this.args.activePage === 'string') this._inspector.visiblePage = this.args.activePage
  }
}

GObject.type_ensure(RightInspectorStory.$gtype)

export const RightInspectorStories: StoryModule = { stories: [RightInspectorStory] }

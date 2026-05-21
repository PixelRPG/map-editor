import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@pixelrpg/story-gjs'
import { buildDemoTiles } from '../../__demo__/world-sample'
import { RightInspector } from './right-inspector'

/** Showcase for the inspector pane with Tiles/Layers/Props tabs. */
export class RightInspectorStory extends StoryWidget {
  private _inspector: RightInspector | null = null

  static {
    GObject.registerClass({ GTypeName: 'RightInspectorStory' }, RightInspectorStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { activeTab: 'tiles' },
      meta: RightInspectorStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Right Inspector',
      description: 'Right-pane inspector with Tiles · Layers · Props tabs; switcher bar at the bottom.',
      component: RightInspector.$gtype,
      controls: [
        {
          name: 'activeTab',
          label: 'Active tab',
          type: ControlType.SELECT,
          options: [
            { label: 'Tiles', value: 'tiles' },
            { label: 'Layers', value: 'layers' },
            { label: 'Props', value: 'props' },
          ],
        },
      ],
    }
  }

  initialize(): void {
    const inspector = new RightInspector()
    inspector.set_size_request(300, 520)
    inspector.tilesTab.tilesetName = 'Lokiri Forest'
    inspector.tilesTab.setTiles(buildDemoTiles(20))
    inspector.layersTab.setLayers([
      { id: 'bg', name: 'Background', tileCount: 248 },
      { id: 'mid', name: 'Midground', tileCount: 96 },
      { id: 'fg', name: 'Foreground', tileCount: 18 },
      { id: 'events', name: 'Events', tileCount: 6, locked: true },
    ])
    inspector.layersTab.selectLayer('bg')
    inspector.propsTab.setScene({
      name: 'Whispering Forest',
      cols: 32,
      rows: 24,
      tilePx: 16,
      music: 'forest-loop.ogg',
      battleBg: 'forest-bg.png',
      encounters: 'Common slimes',
      onEnter: 'Spawn deer NPC',
    })
    inspector.visiblePage = this.args.activeTab as string
    this._inspector = inspector
    this.addContent(inspector)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._inspector) return
    if (typeof this.args.activeTab === 'string') this._inspector.visiblePage = this.args.activeTab
  }
}

GObject.type_ensure(RightInspectorStory.$gtype)

export const RightInspectorStories: StoryModule = { stories: [RightInspectorStory] }

import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@gjsify/storybook'
import { SAMPLE_SCENES, SAMPLE_TELEPORTS } from '../../__demo__/world-sample'
import { SceneInspector } from './scene-inspector'

/** Showcase: scene inspector right-pane, swappable scene via SELECT control. */
export class SceneInspectorStory extends StoryWidget {
  private _inspector: SceneInspector | null = null

  static {
    GObject.registerClass({ GTypeName: 'SceneInspectorStory' }, SceneInspectorStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { sceneId: SAMPLE_SCENES[0].id },
      meta: SceneInspectorStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Scene Inspector',
      description: 'Right-pane inspector with preview, stats grid, and teleport list for the selected atlas scene.',
      component: SceneInspector.$gtype,
      controls: [
        {
          name: 'sceneId',
          label: 'Active scene',
          type: ControlType.SELECT,
          options: [
            { label: 'None (empty state)', value: '' },
            ...SAMPLE_SCENES.map((s) => ({ label: s.name, value: s.id })),
          ],
        },
      ],
    }
  }

  initialize(): void {
    this._inspector = new SceneInspector()
    this._inspector.set_size_request(300, 520)
    this._applyScene()
    this.addContent(this._inspector)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._inspector) return
    this._applyScene()
  }

  private _applyScene(): void {
    if (!this._inspector) return
    const id = typeof this.args.sceneId === 'string' ? this.args.sceneId : ''
    const scene = id ? (SAMPLE_SCENES.find((s) => s.id === id) ?? null) : null
    this._inspector.setScene(scene, SAMPLE_SCENES, SAMPLE_TELEPORTS)
  }
}

GObject.type_ensure(SceneInspectorStory.$gtype)

export const SceneInspectorStories: StoryModule = { stories: [SceneInspectorStory] }

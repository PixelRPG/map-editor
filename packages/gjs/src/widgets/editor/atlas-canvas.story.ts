import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@pixelrpg/story-gjs'
import { SAMPLE_SCENES, SAMPLE_TELEPORTS } from '../../__demo__/world-sample'
import { AtlasCanvas } from './atlas-canvas'

/** Showcase: full Atlas surface populated with five demo scenes + four teleports. */
export class AtlasCanvasStory extends StoryWidget {
  private _atlas: AtlasCanvas | null = null

  static {
    GObject.registerClass({ GTypeName: 'AtlasCanvasStory' }, AtlasCanvasStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { selectedId: '' },
      meta: AtlasCanvasStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Atlas Canvas',
      description:
        'Scrollable atlas surface with scene cards and dashed bezier teleport overlays. Selecting a scene dims unrelated teleports.',
      component: AtlasCanvas.$gtype,
      controls: [
        {
          name: 'selectedId',
          label: 'Selected scene',
          type: ControlType.SELECT,
          options: [
            { label: 'None', value: '' },
            ...SAMPLE_SCENES.map((s) => ({ label: s.name, value: s.id })),
          ],
        },
      ],
    }
  }

  initialize(): void {
    this._atlas = new AtlasCanvas()
    this._atlas.set_size_request(640, 480)
    this._atlas.setWorld(SAMPLE_SCENES, SAMPLE_TELEPORTS)
    this._atlas.connect('scene-selected', (_a, id: string) => {
      this.args = { ...this.args, selectedId: id }
    })
    this.addContent(this._atlas)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._atlas) return
    if (typeof this.args.selectedId === 'string') this._atlas.selectedId = this.args.selectedId
  }
}

GObject.type_ensure(AtlasCanvasStory.$gtype)

export const AtlasCanvasStories: StoryModule = { stories: [AtlasCanvasStory] }

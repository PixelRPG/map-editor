import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@pixelrpg/story-gjs'
import { type EditorMode, ModeRail } from './mode-rail'

/** Showcase for the library mode rail (left sidebar). */
export class ModeRailStory extends StoryWidget {
  private _rail: ModeRail | null = null

  static {
    GObject.registerClass({ GTypeName: 'ModeRailStory' }, ModeRailStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: {
        projectName: "Aria's Quest",
        projectTagline: 'A pixel RPG mockup',
        activeMode: 'world',
      },
      meta: ModeRailStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Mode Rail',
      description: 'Left library sidebar — hero icon + project name + tagline + World/Cast/Tiles/Audio/Data action rows.',
      component: ModeRail.$gtype,
      controls: [
        { name: 'projectName', label: 'Project name', type: ControlType.TEXT },
        { name: 'projectTagline', label: 'Tagline', type: ControlType.TEXT },
        {
          name: 'activeMode',
          label: 'Active mode',
          type: ControlType.SELECT,
          options: [
            { label: 'World', value: 'world' },
            { label: 'Cast', value: 'cast' },
            { label: 'Tiles', value: 'tiles' },
            { label: 'Audio', value: 'audio' },
            { label: 'Data', value: 'data' },
          ],
        },
      ],
    }
  }

  initialize(): void {
    this._rail = new ModeRail({
      projectName: this.args.projectName as string,
      projectTagline: this.args.projectTagline as string,
      activeMode: this.args.activeMode as EditorMode,
    })
    this._rail.connect('mode-changed', (_rail, mode: string) => {
      this.args = { ...this.args, activeMode: mode }
    })
    this.addContent(this._rail)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._rail) return
    if (typeof this.args.projectName === 'string') this._rail.projectName = this.args.projectName
    if (typeof this.args.projectTagline === 'string') this._rail.projectTagline = this.args.projectTagline
    if (typeof this.args.activeMode === 'string') this._rail.activeMode = this.args.activeMode as EditorMode
  }
}

GObject.type_ensure(ModeRailStory.$gtype)

export const ModeRailStories: StoryModule = { stories: [ModeRailStory] }

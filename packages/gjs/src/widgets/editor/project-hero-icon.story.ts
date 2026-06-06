import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@pixelrpg/story-gjs'
import { ProjectHeroIcon } from './project-hero-icon'

/** Showcase for the accent-tinted hero compass icon. */
export class ProjectHeroIconStory extends StoryWidget {
  private _icon: ProjectHeroIcon | null = null

  static {
    GObject.registerClass({ GTypeName: 'ProjectHeroIconStory' }, ProjectHeroIconStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { size: 64 },
      meta: ProjectHeroIconStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Project Hero Icon',
      description: 'Accent-colored rounded-square chip with a compass-rose glyph; used by the library mode rail.',
      component: ProjectHeroIcon.$gtype,
      controls: [{ name: 'size', label: 'Size', type: ControlType.RANGE, min: 24, max: 160, step: 4 }],
    }
  }

  initialize(): void {
    this._icon = new ProjectHeroIcon({ size: (this.args.size as number) ?? 64 })
    this.addContent(this._icon)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._icon) return
    const size = this.args.size as number
    if (typeof size === 'number') this._icon.size = size
  }
}

GObject.type_ensure(ProjectHeroIconStory.$gtype)

export const ProjectHeroIconStories: StoryModule = { stories: [ProjectHeroIconStory] }

import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@gjsify/storybook'
import { AnimationTimeline } from './animation-timeline'

/** Sample sequence with varied durations so the proportional segments are obvious. */
const SAMPLE_DURATIONS = [120, 400, 200, 600, 150]
const SAMPLE_TOTAL = SAMPLE_DURATIONS.reduce((a, b) => a + b, 0)

/** Showcase for the animation-editor timeline ruler + scrubbing playhead. */
export class AnimationTimelineStory extends StoryWidget {
  private _timeline: AnimationTimeline | null = null

  static {
    GObject.registerClass({ GTypeName: 'AnimationTimelineStory' }, AnimationTimelineStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { playhead: 320 },
      meta: AnimationTimelineStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Cast/Animation Timeline',
      description:
        'Ruler + scrubbing playhead over a frame sequence: segment width ∝ frame duration, current frame highlighted, draggable playhead. Drag it (or move the slider) to scrub.',
      component: AnimationTimeline.$gtype,
      controls: [
        { name: 'playhead', label: 'Playhead (ms)', type: ControlType.RANGE, min: 0, max: SAMPLE_TOTAL, step: 10 },
      ],
    }
  }

  initialize(): void {
    const timeline = new AnimationTimeline()
    timeline.set_size_request(360, 34)
    timeline.setFrames([...SAMPLE_DURATIONS])
    timeline.setPlayheadTime((this.args.playhead as number) ?? 0)
    this._timeline = timeline
    this.addContent(timeline)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._timeline) return
    const playhead = this.args.playhead as number
    if (typeof playhead === 'number') this._timeline.setPlayheadTime(playhead)
  }
}

GObject.type_ensure(AnimationTimelineStory.$gtype)

export const AnimationTimelineStories: StoryModule = { stories: [AnimationTimelineStory] }

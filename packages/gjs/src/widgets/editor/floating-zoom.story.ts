import Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@pixelrpg/story-gjs'
import { FloatingZoom } from './floating-zoom'

/** Showcase for the OSD zoom pill. */
export class FloatingZoomStory extends StoryWidget {
  private _zoom: FloatingZoom | null = null

  static {
    GObject.registerClass({ GTypeName: 'FloatingZoomStory' }, FloatingZoomStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { zoomPercent: 100, cursorX: 12, cursorY: 7, showCursor: true },
      meta: FloatingZoomStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Floating Zoom',
      description: 'OSD zoom pill: − / percent / + buttons plus optional cursor coordinate.',
      component: FloatingZoom.$gtype,
      controls: [
        { name: 'zoomPercent', label: 'Zoom %', type: ControlType.RANGE, min: 25, max: 400, step: 25 },
        { name: 'cursorX', label: 'Cursor X', type: ControlType.NUMBER, min: 0, max: 256 },
        { name: 'cursorY', label: 'Cursor Y', type: ControlType.NUMBER, min: 0, max: 256 },
        { name: 'showCursor', label: 'Show cursor', type: ControlType.BOOLEAN },
      ],
    }
  }

  initialize(): void {
    const group = new Gio.SimpleActionGroup()
    for (const name of ['zoom-in', 'zoom-out', 'zoom-reset']) {
      const action = new Gio.SimpleAction({ name })
      group.add_action(action)
    }
    this.insert_action_group('win', group)

    this._zoom = new FloatingZoom()
    this._zoom.setZoom(((this.args.zoomPercent as number) ?? 100) / 100)
    this._applyCursor()
    this.addContent(this._zoom)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._zoom) return
    if (typeof this.args.zoomPercent === 'number') {
      this._zoom.setZoom(this.args.zoomPercent / 100)
    }
    this._applyCursor()
  }

  private _applyCursor(): void {
    if (!this._zoom) return
    if (this.args.showCursor) {
      this._zoom.setCursor(
        typeof this.args.cursorX === 'number' ? this.args.cursorX : 0,
        typeof this.args.cursorY === 'number' ? this.args.cursorY : 0,
      )
    } else {
      this._zoom.setCursor(null, null)
    }
  }
}

GObject.type_ensure(FloatingZoomStory.$gtype)

export const FloatingZoomStories: StoryModule = { stories: [FloatingZoomStory] }

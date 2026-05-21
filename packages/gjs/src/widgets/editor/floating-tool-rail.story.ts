import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@pixelrpg/story-gjs'
import { type EditorTool, FloatingToolRail } from './floating-tool-rail'

/** Showcase for the vertical OSD tool rail. */
export class FloatingToolRailStory extends StoryWidget {
  private _rail: FloatingToolRail | null = null
  private _toolAction: Gio.SimpleAction | null = null

  static {
    GObject.registerClass({ GTypeName: 'FloatingToolRailStory' }, FloatingToolRailStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { activeTool: 'pencil' },
      meta: FloatingToolRailStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Floating Tool Rail',
      description: 'Vertical OSD column of editor tools — toolbar + osd style classes per Learn6502 pattern.',
      component: FloatingToolRail.$gtype,
      controls: [
        {
          name: 'activeTool',
          label: 'Active tool',
          type: ControlType.SELECT,
          options: [
            { label: 'Pencil', value: 'pencil' },
            { label: 'Bucket', value: 'bucket' },
            { label: 'Rectangle', value: 'rect' },
            { label: 'Eraser', value: 'eraser' },
            { label: 'Eyedropper', value: 'eyedropper' },
            { label: 'Select', value: 'select' },
            { label: 'Stamp', value: 'stamp' },
            { label: 'Event', value: 'event' },
          ],
        },
      ],
    }
  }

  initialize(): void {
    const group = new Gio.SimpleActionGroup()
    this._toolAction = Gio.SimpleAction.new_stateful(
      'set-tool',
      GLib.VariantType.new('s'),
      GLib.Variant.new_string((this.args.activeTool as string) ?? 'pencil'),
    )
    this._toolAction.connect('change-state', (action, value) => {
      action.set_state(value!)
      this.args = { ...this.args, activeTool: value!.get_string()[0] }
    })
    group.add_action(this._toolAction)
    this.insert_action_group('win', group)

    this._rail = new FloatingToolRail()
    this._rail.setActiveTool(this.args.activeTool as EditorTool)
    this.addContent(this._rail)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._rail || !this._toolAction) return
    if (typeof this.args.activeTool === 'string') {
      this._rail.setActiveTool(this.args.activeTool as EditorTool)
      this._toolAction.set_state(GLib.Variant.new_string(this.args.activeTool))
    }
  }
}

GObject.type_ensure(FloatingToolRailStory.$gtype)

export const FloatingToolRailStories: StoryModule = { stories: [FloatingToolRailStory] }

import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@gjsify/storybook'
import type { EditorTool } from '@pixelrpg/engine'
import { FloatingToolRail } from './floating-tool-rail'

const TOOL_VALUES: EditorTool[] = ['select', 'pencil', 'eraser', 'eyedropper', 'object']

/** Showcase for the labelled scene-editor tool rail. */
export class FloatingToolRailStory extends StoryWidget {
  private _rail: FloatingToolRail | null = null

  static {
    GObject.registerClass({ GTypeName: 'FloatingToolRailStory' }, FloatingToolRailStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { tool: 'pencil' },
      meta: FloatingToolRailStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Floating Tool Rail',
      description: 'Labelled, grouped tool rail (select / paint / erase · pick / object) bound to win.set-tool.',
      component: FloatingToolRail.$gtype,
      controls: [
        {
          name: 'tool',
          label: 'Active tool',
          type: ControlType.SELECT,
          options: TOOL_VALUES.map((t) => ({ label: t, value: t })),
        },
      ],
    }
  }

  initialize(): void {
    // Register the stateful action the rail buttons target so they read
    // as enabled + drive the highlight through the real change path.
    const group = new Gio.SimpleActionGroup()
    const tool = Gio.SimpleAction.new_stateful('set-tool', GLib.VariantType.new('s'), GLib.Variant.new_string('pencil'))
    tool.connect('change-state', (action, value) => {
      action.set_state(value!)
      this._rail?.setActiveTool(value!.get_string()[0] as EditorTool)
    })
    group.add_action(tool)
    this.insert_action_group('win', group)

    this._rail = new FloatingToolRail()
    this._rail.setActiveTool((this.args.tool as EditorTool) ?? 'pencil')
    this.addContent(this._rail)
  }

  updateArgs(_args: StoryArgs): void {
    this._rail?.setActiveTool((this.args.tool as EditorTool) ?? 'pencil')
  }
}

GObject.type_ensure(FloatingToolRailStory.$gtype)

export const FloatingToolRailStories: StoryModule = { stories: [FloatingToolRailStory] }

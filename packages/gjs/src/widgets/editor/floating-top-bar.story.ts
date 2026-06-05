import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@pixelrpg/story-gjs'
import { FloatingTopBar } from './floating-top-bar'

/**
 * Showcase for the merged top OSD bar.
 *
 * The bar makes its own split↔merged layout decision based on its
 * allocated width (via an internal `Adw.BreakpointBin`), so this
 * story doesn't expose density controls — resize the storybook
 * window to see the transitions. Installs a `win.*` action group so
 * the bar's buttons reach their stubbed actions in the story
 * sandbox.
 */
export class FloatingTopBarStory extends StoryWidget {
  private _bar: FloatingTopBar | null = null

  static {
    GObject.registerClass({ GTypeName: 'FloatingTopBarStory' }, FloatingTopBarStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: {
        tileName: 'Grass A',
        layerName: 'Background',
        showInspector: false,
      },
      meta: FloatingTopBarStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Floating Top Bar',
      description:
        'Merged top OSD — split into two pills at ≥880sp, single merged pill below with progressive button disclosure. Resize the story window to see the transitions.',
      component: FloatingTopBar.$gtype,
      controls: [
        { name: 'tileName', label: 'Tile name', type: ControlType.TEXT },
        { name: 'layerName', label: 'Layer name', type: ControlType.TEXT },
        { name: 'showInspector', label: 'Show inspector', type: ControlType.BOOLEAN },
      ],
    }
  }

  initialize(): void {
    this._installActions()
    this._bar = new FloatingTopBar()
    this._bar.set_size_request(640, -1)
    this._applyArgs()
    this._bar.setTilePopover(this._makePopover('Tile palette goes here'))
    this._bar.setLayerPopover(this._makePopover('Layer list goes here'))
    this.addContent(this._bar)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._bar) return
    this._applyArgs()
  }

  private _applyArgs(): void {
    if (!this._bar) return
    if (typeof this.args.tileName === 'string') this._bar.tileName = this.args.tileName
    if (typeof this.args.layerName === 'string') this._bar.layerName = this.args.layerName
    this._bar.showInspector = Boolean(this.args.showInspector)
  }

  private _installActions(): void {
    const group = new Gio.SimpleActionGroup()
    const lib = Gio.SimpleAction.new_stateful('toggle-library', null, GLib.Variant.new_boolean(false))
    lib.connect('change-state', (action, value) => action.set_state(value!))
    group.add_action(lib)
    const grid = Gio.SimpleAction.new_stateful('toggle-grid', null, GLib.Variant.new_boolean(false))
    grid.connect('change-state', (action, value) => action.set_state(value!))
    group.add_action(grid)
    const transparency = Gio.SimpleAction.new_stateful('toggle-transparency', null, GLib.Variant.new_boolean(false))
    transparency.connect('change-state', (action, value) => action.set_state(value!))
    group.add_action(transparency)
    const tool = Gio.SimpleAction.new_stateful('set-tool', GLib.VariantType.new('s'), GLib.Variant.new_string('pencil'))
    tool.connect('change-state', (action, value) => {
      action.set_state(value!)
      this._bar?.setActiveTool(value!.get_string()[0] as 'pencil' | 'eraser' | 'eyedropper')
    })
    group.add_action(tool)
    for (const name of ['back-to-atlas', 'undo', 'redo']) {
      group.add_action(new Gio.SimpleAction({ name }))
    }
    this.insert_action_group('win', group)
  }

  private _makePopover(text: string): Gtk.Popover {
    const pop = new Gtk.Popover()
    const label = new Gtk.Label({ label: text, margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12 })
    pop.set_child(label)
    return pop
  }
}

GObject.type_ensure(FloatingTopBarStory.$gtype)

export const FloatingTopBarStories: StoryModule = { stories: [FloatingTopBarStory] }

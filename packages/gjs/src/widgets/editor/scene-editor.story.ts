import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@gjsify/storybook'
import { SAMPLE_SCENES } from '../../__demo__/world-sample'
import { MiniMap } from './mini-map'
import { SceneEditor } from './scene-editor'

/**
 * Showcase: full scene-editor view with floating chrome.
 *
 * Uses a {@link MiniMap} from the sample world as a stand-in for the
 * real Excalibur engine widget so the story is self-contained.
 */
export class SceneEditorStory extends StoryWidget {
  private _editor: SceneEditor | null = null

  static {
    GObject.registerClass({ GTypeName: 'SceneEditorStory' }, SceneEditorStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { sceneId: SAMPLE_SCENES[1].id, tool: 'pencil', zoom: 100, mapPx: 16 },
      meta: SceneEditorStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Scene Editor',
      description:
        'Full scene-editor composition: header + scratchpad backdrop + floating tool rail / zoom OSD / context chip. Engine is mocked with a MiniMap preview.',
      component: SceneEditor.$gtype,
      controls: [
        {
          name: 'sceneId',
          label: 'Scene',
          type: ControlType.SELECT,
          options: SAMPLE_SCENES.map((s) => ({ label: s.name, value: s.id })),
        },
        {
          name: 'tool',
          label: 'Active tool',
          type: ControlType.SELECT,
          options: [
            { label: 'Pencil', value: 'pencil' },
            { label: 'Eraser', value: 'eraser' },
            { label: 'Eyedropper', value: 'eyedropper' },
          ],
        },
        { name: 'zoom', label: 'Zoom %', type: ControlType.RANGE, min: 25, max: 400, step: 25 },
        { name: 'mapPx', label: 'Tile size (preview)', type: ControlType.RANGE, min: 8, max: 48, step: 2 },
      ],
    }
  }

  initialize(): void {
    this._installActions()
    this._editor = new SceneEditor()
    this._editor.set_size_request(720, 480)
    this._applyState()
    this.addContent(this._editor)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._editor) return
    this._applyState()
  }

  private _installActions(): void {
    const group = new Gio.SimpleActionGroup()
    const toolAction = Gio.SimpleAction.new_stateful(
      'set-tool',
      GLib.VariantType.new('s'),
      GLib.Variant.new_string((this.args.tool as string) ?? 'pencil'),
    )
    toolAction.connect('change-state', (action, value) => {
      action.set_state(value!)
      this.args = { ...this.args, tool: value!.get_string()[0] }
    })
    group.add_action(toolAction)
    for (const name of ['zoom-in', 'zoom-out', 'zoom-reset', 'undo', 'redo', 'play', 'back-to-atlas']) {
      group.add_action(new Gio.SimpleAction({ name }))
    }
    this.insert_action_group('win', group)
  }

  private _applyState(): void {
    if (!this._editor) return
    const sceneId = typeof this.args.sceneId === 'string' ? this.args.sceneId : SAMPLE_SCENES[0].id
    const scene = SAMPLE_SCENES.find((s) => s.id === sceneId) ?? SAMPLE_SCENES[0]
    const tilePx = typeof this.args.mapPx === 'number' ? this.args.mapPx : 16

    this._editor.topBar.tileName = `Grass A — ${scene.name}`
    this._editor.topBar.layerName = 'Background'
    this._editor.topBar.setActiveTool((this.args.tool as 'pencil') ?? 'pencil')

    const zoomPercent = typeof this.args.zoom === 'number' ? this.args.zoom : 100
    this._editor.zoomOsd.setZoom(zoomPercent / 100)
    this._editor.zoomOsd.setCursor(scene.rows[0]?.length ?? 0, scene.rows.length)

    // Refresh the mock engine preview.
    const preview = new MiniMap({ rows: scene.rows, tilePx })
    const frame = new Gtk.Frame()
    frame.add_css_class('card')
    frame.set_child(preview)
    this._editor.setEngine(frame)
  }
}

GObject.type_ensure(SceneEditorStory.$gtype)

export const SceneEditorStories: StoryModule = { stories: [SceneEditorStory] }

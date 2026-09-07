import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@gjsify/storybook'
import type { EditorTool, LayerPlane } from '@pixelrpg/engine'
import { SAMPLE_SCENES } from '../../__demo__/world-sample'
import { MiniMap } from './mini-map'
import { SceneEditor, type SceneEditorLayout } from './scene-editor'

const TOOL_LABELS: Record<string, string> = {
  select: 'Select',
  pencil: 'Paint',
  fill: 'Fill',
  eraser: 'Erase',
  eyedropper: 'Pick',
  object: 'Object',
}

/**
 * Showcase: the whole scene-editor surface with its floating chrome.
 *
 * The `layout` control is the story's point — switching it runs the same
 * `setLayout` the window's <768sp breakpoint runs, so the wide pills and
 * the docked phone bar can be compared without resizing anything. A
 * {@link MiniMap} stands in for the Excalibur widget so the story is
 * self-contained.
 */
export class SceneEditorStory extends StoryWidget {
  private _editor: SceneEditor | null = null

  static {
    GObject.registerClass({ GTypeName: 'SceneEditorStory' }, SceneEditorStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: {
        sceneId: SAMPLE_SCENES[1].id,
        tool: 'pencil',
        plane: 'ground',
        layout: 'wide',
        fullView: true,
        zoom: 100,
        mapPx: 16,
      },
      meta: SceneEditorStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Scene Editor',
      description:
        'The editing pill, the context pill, the brush badge and the Play FAB over a mocked canvas — plus the docked phone bar behind the layout switch.',
      component: SceneEditor.$gtype,
      controls: [
        {
          name: 'sceneId',
          label: 'Scene',
          type: ControlType.SELECT,
          options: SAMPLE_SCENES.map((s) => ({ label: s.name, value: s.id })),
        },
        {
          name: 'layout',
          label: 'Layout',
          type: ControlType.SELECT,
          options: [
            { label: 'Wide (desktop / tablet)', value: 'wide' },
            { label: 'Phone', value: 'phone' },
          ],
        },
        {
          name: 'tool',
          label: 'Active tool',
          type: ControlType.SELECT,
          options: Object.entries(TOOL_LABELS).map(([value, label]) => ({ label, value })),
        },
        {
          name: 'plane',
          label: 'Active plane',
          type: ControlType.SELECT,
          options: [
            { label: 'Below the hero', value: 'ground' },
            { label: 'At hero height', value: 'hero' },
            { label: 'Above the hero', value: 'overlay' },
          ],
        },
        { name: 'fullView', label: 'Full view', type: ControlType.BOOLEAN },
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
    for (const name of [
      'zoom-in',
      'zoom-out',
      'zoom-reset',
      'undo',
      'redo',
      'play',
      'play-from-start',
      'restart',
      'back-to-atlas',
      'share-session',
      'show-help-overlay',
      'toggle-assistant-paused',
    ]) {
      group.add_action(new Gio.SimpleAction({ name }))
    }
    for (const name of ['toggle-grid', 'toggle-transparency', 'toggle-objects']) {
      group.add_action(Gio.SimpleAction.new_stateful(name, null, GLib.Variant.new_boolean(false)))
    }
    for (const name of ['toggle-library', 'toggle-inspector']) {
      group.add_action(Gio.SimpleAction.new_stateful(name, null, GLib.Variant.new_boolean(false)))
    }
    this.insert_action_group('win', group)
  }

  private _applyState(): void {
    const editor = this._editor
    if (!editor) return
    const sceneId = typeof this.args.sceneId === 'string' ? this.args.sceneId : SAMPLE_SCENES[0].id
    const scene = SAMPLE_SCENES.find((s) => s.id === sceneId) ?? SAMPLE_SCENES[0]
    const tilePx = typeof this.args.mapPx === 'number' ? this.args.mapPx : 16
    const tool = ((this.args.tool as EditorTool) ?? 'pencil') as EditorTool
    const plane = ((this.args.plane as LayerPlane) ?? 'ground') as LayerPlane

    editor.fullView = this.args.fullView !== false
    editor.setLayout(((this.args.layout as SceneEditorLayout) ?? 'wide') as SceneEditorLayout)

    editor.toolGroup.setActiveTool(tool)
    editor.brushBadge.tool = tool
    editor.brushBadge.plane = plane
    editor.brushLabel = `${TOOL_LABELS[tool] ?? tool} · Background`
    editor.brushPage.layerName = 'Background'
    editor.brushPage.setActivePlane(plane, ['ground', 'hero', 'overlay'])

    const zoomPercent = typeof this.args.zoom === 'number' ? this.args.zoom : 100
    editor.setZoom(zoomPercent / 100)
    editor.setCursorTile(scene.rows[0]?.length ?? 0, scene.rows.length)

    // Refresh the mock engine preview.
    const preview = new MiniMap({ rows: scene.rows, tilePx })
    const frame = new Gtk.Frame()
    frame.add_css_class('card')
    frame.set_child(preview)
    editor.setEngine(frame)
  }
}

GObject.type_ensure(SceneEditorStory.$gtype)

export const SceneEditorStories: StoryModule = { stories: [SceneEditorStory] }

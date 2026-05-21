import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { Engine, SAMPLE_SCENES, type SampleScene, SignalScope } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import { PREFIX } from '../constants.ts'
import { type LoadedProject, loadProjectAsAtlas } from '../services/project-loader.ts'
import Template from './application-window.blp'
import type { AtlasView } from './atlas-view.ts'
import type { SceneEditorView } from './scene-editor-view.ts'
import type { WelcomeView } from './welcome-view.ts'

// PREFIX points at apps/maker-gjs/. The demo project lives at the
// workspace root's `games/zelda-like/` directory.
const DEMO_PROJECT_PATH = `${PREFIX}/../../games/zelda-like/game-project.json`

type ViewName = 'welcome' | 'atlas' | 'scene-editor'

/**
 * Top-level window.
 *
 * Hosts an `Adw.ViewStack` that switches between the welcome screen,
 * the atlas (world overview) and the scene editor. Registers
 * window-level actions used by the floating chrome and headers:
 * - `win.mode` (string state) — picks the active mode in the rail
 * - `win.set-tool` (string state) — picks the active tool in the editor
 * - `win.zoom-in / zoom-out / zoom-reset`
 * - `win.undo / redo / play`
 * - `win.back-to-atlas` / `win.open-scene` (string param)
 * - `win.new-scene`, `win.open-recent-projects`
 *
 * Atlas/scene state lives in the views; the window orchestrates the
 * transitions and the dialogs (file pickers, toasts).
 */
export class ApplicationWindow extends Adw.ApplicationWindow {
  declare _welcome_view: WelcomeView
  declare _atlas_view: AtlasView
  declare _scene_editor_view: SceneEditorView
  declare _stack: Adw.ViewStack
  declare _toast_overlay: Adw.ToastOverlay

  private signals = new SignalScope()
  private _scenesById = new Map<string, SampleScene>(SAMPLE_SCENES.map((s) => [s.id, s]))
  private _loadedProject: LoadedProject | null = null
  private _engine: Engine | null = null
  private _engineProjectPath: string | null = null
  private _engineMapId: string | null = null
  private _engineZoomHookAttached = false
  private _lastReportedZoom = 1

  static {
    GObject.registerClass(
      {
        GTypeName: 'ApplicationWindow',
        Template,
        InternalChildren: ['welcome_view', 'atlas_view', 'scene_editor_view', 'stack', 'toast_overlay'],
      },
      ApplicationWindow,
    )
  }

  constructor(application: Adw.Application) {
    super({ application })
    this._installActions()
  }

  vfunc_map(): void {
    super.vfunc_map()

    this.signals.connect(this._welcome_view, 'create-project', () => this._onCreateProject())
    this.signals.connect(this._welcome_view, 'open-project', () => this._onOpenProject())
    this.signals.connect(this._welcome_view, 'browse-projects', () => this._onOpenProject())
    this.signals.connect(this._welcome_view, 'template-selected', (_v: WelcomeView, templateId: string) => {
      this._onTemplateSelected(templateId)
    })

    this.signals.connect(this._atlas_view, 'scene-opened', (_v: AtlasView, id: string) => {
      this._showSceneEditor(id)
    })
    this.signals.connect(this._atlas_view, 'scene-selected', (_v: AtlasView, id: string) => {
      this._lastAtlasSelection = id
    })
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  private _installActions(): void {
    const winActions = new Gio.SimpleActionGroup()

    const modeAction = Gio.SimpleAction.new_stateful(
      'mode',
      GLib.VariantType.new('s'),
      GLib.Variant.new_string('world'),
    )
    modeAction.connect('change-state', (action, value) => {
      action.set_state(value!)
    })
    winActions.add_action(modeAction)

    const toolAction = Gio.SimpleAction.new_stateful(
      'set-tool',
      GLib.VariantType.new('s'),
      GLib.Variant.new_string('pencil'),
    )
    toolAction.connect('change-state', (action, value) => {
      action.set_state(value!)
      const tool = value!.get_string()[0]
      // Engine accepts 'brush' | 'eraser' today — map the new tool ids
      // back to those until the engine grows the full set.
      const mappedTool: 'brush' | 'eraser' | null =
        tool === 'eraser' ? 'eraser' : tool === 'pencil' || tool === 'bucket' || tool === 'rect' ? 'brush' : null
      if (mappedTool && this._engine) this._engine.setEditorState({ tool: mappedTool })
    })
    winActions.add_action(toolAction)

    for (const name of [
      'undo',
      'redo',
      'play',
      'switch-tileset',
      'new-layer',
      'open-recent-projects',
    ]) {
      winActions.add_action(new Gio.SimpleAction({ name }))
    }

    const backAction = new Gio.SimpleAction({ name: 'back-to-atlas' })
    backAction.connect('activate', () => this._showAtlas())
    winActions.add_action(backAction)

    const closeProjectAction = new Gio.SimpleAction({ name: 'close-project' })
    closeProjectAction.connect('activate', () => this._setView('welcome'))
    winActions.add_action(closeProjectAction)

    // Convenience action — wires the same path used by the welcome
    // view's CTAs so tooling / scripts can drive the demo flow without
    // synthesizing button clicks.
    const loadDemoAction = new Gio.SimpleAction({ name: 'load-demo-project' })
    loadDemoAction.connect('activate', () => void this._loadDemoProject())
    winActions.add_action(loadDemoAction)

    const openSceneByIdAction = Gio.SimpleAction.new('open-scene-by-id', GLib.VariantType.new('s'))
    openSceneByIdAction.connect('activate', (_a, parameter) => {
      const id = parameter?.get_string()[0]
      if (id) this._showSceneEditor(id)
    })
    winActions.add_action(openSceneByIdAction)

    const toggleInspectorAction = new Gio.SimpleAction({ name: 'toggle-inspector' })
    toggleInspectorAction.connect('activate', () => {
      const current = this._stack.get_visible_child_name()
      if (current === 'atlas') {
        this._atlas_view.showInspector = !this._atlas_view.showInspector
      } else if (current === 'scene-editor') {
        this._scene_editor_view.showInspector = !this._scene_editor_view.showInspector
      }
    })
    winActions.add_action(toggleInspectorAction)

    const zoomInAction = new Gio.SimpleAction({ name: 'zoom-in' })
    zoomInAction.connect('activate', () => this._stepZoom(+0.2))
    winActions.add_action(zoomInAction)

    const zoomOutAction = new Gio.SimpleAction({ name: 'zoom-out' })
    zoomOutAction.connect('activate', () => this._stepZoom(-0.2))
    winActions.add_action(zoomOutAction)

    const zoomResetAction = new Gio.SimpleAction({ name: 'zoom-reset' })
    zoomResetAction.connect('activate', () => this._applyZoom(1))
    winActions.add_action(zoomResetAction)

    const newSceneAction = new Gio.SimpleAction({ name: 'new-scene' })
    newSceneAction.connect('activate', () => this._showToast(_('New Scene — not yet implemented')))
    winActions.add_action(newSceneAction)

    const openSceneAction = new Gio.SimpleAction({ name: 'open-scene' })
    openSceneAction.connect('activate', () => {
      const id = this._currentAtlasSelection()
      if (id) this._showSceneEditor(id)
    })
    winActions.add_action(openSceneAction)

    this.insert_action_group('win', winActions)
  }

  private _lastAtlasSelection: string | null = null

  private _currentAtlasSelection(): string | null {
    return this._lastAtlasSelection
  }

  private _setView(name: ViewName): void {
    this._stack.set_visible_child_name(name)
  }

  private _showAtlas(): void {
    this._setView('atlas')
  }

  private _showSceneEditor(sceneId: string): void {
    const scene = this._scenesById.get(sceneId)
    if (!scene) {
      this._showToast(_('Scene not found'))
      return
    }
    this._scene_editor_view.setScene(scene)
    this._setView('scene-editor')

    // Real-data hydration (engine + inspector tabs) only happens once a
    // project is loaded. Plain demo scenes fall back to placeholders.
    if (this._loadedProject) {
      void this._hydrateSceneEditor(sceneId)
    }
  }

  private async _hydrateSceneEditor(sceneId: string): Promise<void> {
    const project = this._loadedProject
    if (!project) return

    try {
      await this._scene_editor_view.populateFromProject(project, sceneId)
    } catch (error) {
      console.warn('[ApplicationWindow] Failed to populate inspector:', error)
    }

    try {
      await this._ensureEngineForMap(project.projectPath, sceneId)
    } catch (error) {
      console.error('[ApplicationWindow] Failed to bring up engine:', error)
      this._showToast(_('Failed to load map'))
    }
  }

  private async _ensureEngineForMap(projectPath: string, mapId: string): Promise<void> {
    if (!this._engine) {
      this._engine = new Engine()
      this._scene_editor_view.setEngineWidget(this._engine, this._engine)
      await this._engine.initialize()
    } else {
      // Engine already exists — make sure it lives in the current scene
      // editor view (the slot is cleared on each switch).
      this._scene_editor_view.setEngineWidget(this._engine, this._engine)
    }

    if (this._engineProjectPath !== projectPath) {
      await this._engine.loadProject(projectPath)
      this._engineProjectPath = projectPath
      this._engineMapId = null
    }
    if (this._engineMapId !== mapId) {
      await this._engine.loadMap(mapId)
      this._engineMapId = mapId
    }

    // Default editor state — pencil tool so the user can paint
    // immediately. Tile / layer come from `populateFromProject`.
    this._engine.setEditorState({ tool: 'brush' })

    this._attachEngineZoomHook()
  }

  /** Once the engine has an active scene, subscribe to its postupdate
   * tick so we can mirror camera zoom changes (including the engine's
   * own scroll-wheel zoom) into the floating OSD. */
  private _attachEngineZoomHook(): void {
    if (this._engineZoomHookAttached || !this._engine) return
    this._engineZoomHookAttached = this._engine.onCameraZoomChanged((zoom) => {
      if (Math.abs(zoom - this._lastReportedZoom) < 0.01) return
      this._lastReportedZoom = zoom
      this._scene_editor_view.setZoom(zoom)
    })
  }

  private _onTemplateSelected(_templateId: string): void {
    // Templates aren't backed by real scaffolding yet — for now they
    // route to the demo project so the editor surfaces something.
    void this._loadDemoProject()
  }

  private _onCreateProject(): void {
    const dialog = new Adw.MessageDialog({
      heading: _('Create New Project'),
      body: _('Enter a name for your new project:'),
      transient_for: this,
      modal: true,
    })
    dialog.add_response('cancel', _('Cancel'))
    dialog.add_response('create', _('Create'))
    dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED)

    const entry = new Gtk.Entry({
      placeholder_text: _('Project name'),
      margin_top: 12,
      margin_bottom: 12,
      margin_start: 12,
      margin_end: 12,
    })
    dialog.set_extra_child(entry)
    dialog.connect('response', (d, response) => {
      if (response === 'create') {
        const projectName = entry.get_text()
        if (projectName) {
          this._atlas_view.projectName = projectName
          this._scene_editor_view.projectName = projectName
          this._showAtlas()
        } else {
          this._showToast(_('Please enter a project name'))
        }
      }
      d.destroy()
    })
    dialog.present()
  }

  private _onOpenProject(): void {
    void this._loadDemoProject()
  }

  private async _loadDemoProject(): Promise<void> {
    this._showToast(_('Loading project…'))
    try {
      const project = await loadProjectAsAtlas(DEMO_PROJECT_PATH)
      this._loadedProject = project
      this._atlas_view.projectName = project.projectName
      this._scene_editor_view.projectName = project.projectName
      this._atlas_view.setWorld(project.scenes, project.teleports)
      this._scenesById = new Map(project.scenes.map((s) => [s.id, s]))
      // Force the engine to reload its project on the next scene-editor entry.
      this._engineProjectPath = null
      this._engineMapId = null
      this._showAtlas()
    } catch (error) {
      console.error('[ApplicationWindow] Failed to load project:', error)
      this._showToast(_('Failed to load project'))
    }
  }

  private _showToast(message: string): void {
    this._toast_overlay.add_toast(new Adw.Toast({ title: message, timeout: 3 }))
  }

  /** Move the engine camera zoom in 0.2 steps, matching the wheel-zoom in
   * `camera-control.system.ts`. The engine is the source of truth — the
   * floating zoom OSD is driven from it via `postupdate`. */
  private _stepZoom(delta: number): void {
    const current = this._engine?.getCameraZoom()
    if (current == null) return
    const next = Math.max(0.1, Math.min(4, Math.round((current + delta) * 10) / 10))
    this._engine?.setCameraZoom(next)
    this._scene_editor_view.setZoom(next)
  }

  private _applyZoom(zoom: number): void {
    if (this._engine?.getCameraZoom() == null) return
    this._engine.setCameraZoom(zoom)
    this._scene_editor_view.setZoom(zoom)
  }
}

GObject.type_ensure(ApplicationWindow.$gtype)

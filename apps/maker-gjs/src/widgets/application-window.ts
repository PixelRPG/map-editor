import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { type EditorTool, MapFormat } from '@pixelrpg/engine'
import { SAMPLE_SCENES, type SampleScene, SignalScope } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import { EngineController } from '../services/engine-controller.ts'
import { writeTextFile } from '../services/file-io.ts'
import { type LoadedProject, loadProjectAsAtlas } from '../services/project-loader.ts'
import { loadRecentProjects, recordRecentProject } from '../services/recent-projects.ts'
import { findBlankTemplate, findTemplateById } from '../services/templates.ts'
import Template from './application-window.blp'
import type { AtlasView } from './atlas-view.ts'
import type { SceneEditorView } from './scene-editor-view.ts'
import type { WelcomeView } from './welcome-view.ts'

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
  /**
   * The `win.set-tool` GAction. Kept as a field so `_hydrateSceneEditor`
   * can push its current state into the engine after every map load —
   * the engine's `ActiveToolComponent` is per-scene and resets on each
   * `loadMap`, while this GAction preserves the user's selection across
   * scenes.
   */
  private _toolAction: Gio.SimpleAction | null = null
  /**
   * Which map the scene editor is currently editing. Tracks
   * `_showSceneEditor` so the persist-requested handler knows which
   * MapResource to serialise.
   */
  private _currentSceneId: string | null = null
  private _engineCtl = new EngineController((engine) => {
    if (engine) this._scene_editor_view.setEngineWidget(engine, engine)
    else this._scene_editor_view.setEngineWidget(null)
  })

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
    // Mirror engine-driven zoom (scroll-wheel + Ctrl+= etc.) into the OSD label.
    this._engineCtl.onZoomChanged((zoom) => this._scene_editor_view.setZoom(zoom))
  }

  vfunc_map(): void {
    super.vfunc_map()

    this.signals.connect(this._welcome_view, 'create-project', () => this._onCreateProject())
    this.signals.connect(this._welcome_view, 'open-project', () => this._onOpenProject())
    this.signals.connect(this._welcome_view, 'browse-projects', () => this._onOpenProject())
    this.signals.connect(this._welcome_view, 'template-selected', (_v: WelcomeView, templateId: string) => {
      this._onTemplateSelected(templateId)
    })
    this.signals.connect(this._welcome_view, 'recent-selected', (_v: WelcomeView, path: string) => {
      void this._loadProjectFromPath(path)
    })

    // Render the user's persisted recent-projects list on every map.
    // Cheap enough (synchronous JSON read) that we don't bother caching.
    this._welcome_view.setRecentProjects(loadRecentProjects())

    this.signals.connect(this._atlas_view, 'scene-opened', (_v: AtlasView, id: string) => {
      this._showSceneEditor(id)
    })
    this.signals.connect(this._atlas_view, 'scene-selected', (_v: AtlasView, id: string) => {
      this._lastAtlasSelection = id
    })
    this.signals.connect(this._atlas_view, 'scene-moved', (_v: AtlasView, id: string, x: number, y: number) => {
      this._persistAtlasPosition(id, x, y)
    })

    // Scene editor → host bridge. The inspector mutates
    // `MapResource.mapData` in place via `engine.setLayerVisible` /
    // `setLayerLocked`, then asks the host to persist. Mirrors the
    // existing `scene-moved` → `_persistAtlasPosition` flow.
    this.signals.connect(this._scene_editor_view, 'persist-requested', () => {
      this._persistCurrentMap()
    })
  }

  /**
   * Serialise the currently-edited map's `MapData` back to disk.
   * Called by the scene editor's `persist-requested` signal after
   * an in-place mutation (layer visibility, layer lock — and any
   * future inspector-driven map mutation). Toasts on failure but
   * keeps the in-memory state so the user can retry.
   */
  private _persistCurrentMap(): void {
    const sceneId = this._currentSceneId
    if (!sceneId) return
    const mapResource = this._loadedProject?.resource.maps.get(sceneId)
    if (!mapResource?.mapData) return
    const ok = writeTextFile(mapResource.sourcePath, MapFormat.serialize(mapResource.mapData))
    if (!ok) this._showToast(_('Could not save layer changes'))
  }

  /**
   * Write the atlas coordinates the user just dragged back into the
   * map's source JSON via `MapFormat.serialize`. Best-effort — failures
   * surface as a toast but the in-memory state still updates so the
   * card position is preserved within the session.
   */
  private _persistAtlasPosition(mapId: string, x: number, y: number): void {
    const mapResource = this._loadedProject?.resource.maps.get(mapId)
    if (!mapResource?.mapData) return
    const editor = (mapResource.mapData.editorData ?? {}) as Record<string, unknown>
    editor.atlasX = x
    editor.atlasY = y
    ;(mapResource.mapData as { editorData?: Record<string, unknown> }).editorData = editor
    const ok = writeTextFile(mapResource.sourcePath, MapFormat.serialize(mapResource.mapData))
    if (!ok) this._showToast(_('Could not save atlas position'))
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
      // Tool ids are shared with the engine's `EditorTool` union, so
      // the GAction state string can be passed straight through.
      // `TileEditorSystem` short-circuits on tools whose semantics
      // it doesn't implement yet (bucket / rect / select / stamp /
      // event) — the UI still surfaces the buttons.
      this._engineCtl.engine?.setActiveTool(value!.get_string()[0] as EditorTool)
    })
    winActions.add_action(toolAction)
    this._toolAction = toolAction

    // Undo / redo route through the engine's command stack
    // (\`docs/concepts/editor-architecture.md\` § Phase 5). The engine
    // mutates the active scene's `UndoStackComponent` and applies /
    // reverts the recorded `PaintTileCommand` / `EraseTileCommand`s
    // built by `TileEditorSystem`.
    const undoAction = new Gio.SimpleAction({ name: 'undo' })
    undoAction.connect('activate', () => {
      this._engineCtl.engine?.undo()
    })
    winActions.add_action(undoAction)

    const redoAction = new Gio.SimpleAction({ name: 'redo' })
    redoAction.connect('activate', () => {
      this._engineCtl.engine?.redo()
    })
    winActions.add_action(redoAction)

    // Default both to disabled — they switch on once a map is loaded
    // and the engine reports `canUndo` / `canRedo` (see the
    // `_engineCtl.onUndoChanged` registration below). Without this
    // they would be enabled on the welcome view, where pressing
    // Ctrl+Z is a no-op but the UI affordance suggests otherwise.
    undoAction.set_enabled(false)
    redoAction.set_enabled(false)

    // Sidebar toggle actions. PropertyAction wraps the
    // SceneEditorView's boolean `show-library` / `show-inspector`
    // properties bi-directionally — the floating OSD toggle buttons
    // (FloatingHistory's library_toggle on the left, ContextChip's
    // inspector_toggle on the right) drive these actions via
    // `action-name`, and the action state follows the property
    // automatically if the split-view changes the property through
    // any other path (swipe-to-close on collapsed mobile, etc.).
    //
    // Pre-refactor these toggles were `Gtk.ToggleButton`s in the
    // central headerbar with direct `bind template.show-library`
    // bindings. Moving them into widgets in a different package
    // (`packages/gjs`) means the template binding can no longer
    // reach across — PropertyAction is the action-shaped bridge.
    winActions.add_action(
      new Gio.PropertyAction({
        name: 'toggle-library',
        object: this._scene_editor_view,
        property_name: 'show-library',
      }),
    )
    winActions.add_action(
      new Gio.PropertyAction({
        name: 'toggle-inspector',
        object: this._scene_editor_view,
        property_name: 'show-inspector',
      }),
    )
    this._engineCtl.onUndoChanged(({ canUndo, canRedo }) => {
      undoAction.set_enabled(canUndo)
      redoAction.set_enabled(canRedo)
    })

    // Eyedropper: the engine's `TileEditorSystem` emits `TILE_PICKED`
    // when the user clicks a tile while the eyedropper tool is
    // active. We route the picked tile back through the
    // scene-editor's existing local-id flow (so palette highlight +
    // context chip + engine's `ActiveTileComponent` stay in lock-step)
    // and then flip the tool action back to `pencil` for a Tiled-style
    // "pick → paint immediately" workflow.
    this._engineCtl.onTilePicked(({ globalTileId }) => {
      this._scene_editor_view.selectTileByGlobalId(globalTileId)
      toolAction.change_state(GLib.Variant.new_string('pencil'))
    })

    // Editor view-mode toggle (`'normal'` ↔ `'grid'`). Stateful
    // action so the toggle button reflects the current state via its
    // own `Gtk.ToggleButton` binding — the change-state handler
    // forwards the chosen mode to the engine, which mutates the
    // session-singleton's `EditorViewModeComponent` and re-applies
    // the rendering.
    const gridAction = Gio.SimpleAction.new_stateful('toggle-grid', null, GLib.Variant.new_boolean(false))
    gridAction.connect('change-state', (action, value) => {
      action.set_state(value!)
      const grid = value!.get_boolean()
      this._engineCtl.engine?.setEditorViewMode(grid ? 'grid' : 'normal')
    })
    winActions.add_action(gridAction)

    // Keyboard accelerators: Ctrl+Z = undo, Ctrl+Shift+Z = redo,
    // Ctrl+G = toggle grid.
    const app = this.get_application() as Adw.Application | null
    app?.set_accels_for_action('win.undo', ['<Primary>z'])
    app?.set_accels_for_action('win.redo', ['<Primary><Shift>z', '<Primary>y'])
    app?.set_accels_for_action('win.toggle-grid', ['<Primary>g'])

    for (const name of ['play', 'switch-tileset', 'new-layer', 'open-recent-projects']) {
      winActions.add_action(new Gio.SimpleAction({ name }))
    }

    const backAction = new Gio.SimpleAction({ name: 'back-to-atlas' })
    backAction.connect('activate', () => this._showAtlas())
    winActions.add_action(backAction)

    const closeProjectAction = new Gio.SimpleAction({ name: 'close-project' })
    closeProjectAction.connect('activate', () => this._setView('welcome'))
    winActions.add_action(closeProjectAction)

    // Convenience action — drives the file picker so tooling / scripts
    // can exercise the same path as the welcome view's "Open Project".
    const openProjectAction = new Gio.SimpleAction({ name: 'open-project' })
    openProjectAction.connect('activate', () => this._onOpenProject())
    winActions.add_action(openProjectAction)

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
    // Dispose the engine when leaving the scene editor. The gjs Engine
    // widget nulls out its internal Excalibur instance in
    // `vfunc_unmap` (so we don't leak GL contexts when the scene
    // editor is off-screen), which leaves our cached reference
    // pointing at a dead wrapper. Forcing a fresh engine on re-entry
    // sidesteps that.
    const current = this._stack.get_visible_child_name()
    if (current === 'scene-editor' && name !== 'scene-editor') {
      this._engineCtl.dispose()
    }
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
    this._currentSceneId = sceneId
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

    // Order is load-bearing: `ensureForMap` must complete before
    // `populateFromProject` so the inspector's initial
    // `_setActiveTile` / `_setActiveLayer` writes land on a live
    // Excalibur engine. The reverse order leaves the engine's
    // `ActiveTile` / `ActiveLayer` session-state null until the user
    // manually picks a swatch, breaking the brush hover preview at
    // startup (the slot fires before Excalibur is initialised, so the
    // gjs widget's `setActiveTile/Layer` forwarders silently no-op
    // — see `SceneEditorView.setEngineWidget`).
    try {
      await this._engineCtl.ensureForMap(project.projectPath, sceneId)
    } catch (error) {
      const details =
        error instanceof Error
          ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
          : `${typeof error} ${JSON.stringify(error)}`
      console.error('[ApplicationWindow] Failed to bring up engine:', details)
      this._showToast(_('Failed to load map'))
      // Fall through: still populate the inspector so the user has a
      // usable surface (palette / layers / objects) even when the
      // canvas couldn't come up. `populateFromProject`'s engine writes
      // will no-op gracefully since the controller's `_engine` stays
      // null on a failed bring-up.
    }

    // Push the UI's current tool selection into the freshly-loaded
    // scene's session state. The engine's `ActiveToolComponent` is
    // per-scene and resets on every `loadMap`, while the GAction
    // preserves the user's choice across scenes — without this sync
    // the UI would still show e.g. "eraser" while the engine reverts
    // to its system default and the pencil-preview helper hides.
    const toolState = this._toolAction?.get_state()
    if (toolState) {
      this._engineCtl.engine?.setActiveTool(toolState.get_string()[0] as EditorTool)
    }

    try {
      await this._scene_editor_view.populateFromProject(project, sceneId)
    } catch (error) {
      console.warn('[ApplicationWindow] Failed to populate inspector:', error)
    }
  }

  private _onTemplateSelected(templateId: string): void {
    const template = findTemplateById(templateId)
    if (!template) {
      this._showToast(_('Template not found'))
      return
    }
    void this._loadProjectFromPath(template.projectPath)
  }

  /** "New Project" → open the blank starter template. The user can
   * customise + save-as from there. */
  private _onCreateProject(): void {
    const blank = findBlankTemplate()
    if (!blank) {
      this._showToast(_('No blank template available'))
      return
    }
    void this._loadProjectFromPath(blank.projectPath)
  }

  /** "Open Project" → real file picker (Gtk.FileDialog). Filter to
   * `game-project.json`-style files; any project file in the workspace
   * (including the starter templates) works. */
  private _onOpenProject(): void {
    const dialog = new Gtk.FileDialog({ title: _('Open Project'), modal: true })

    const filter = new Gtk.FileFilter()
    filter.set_name(_('PixelRPG Project (game-project.json)'))
    filter.add_pattern('game-project.json')
    filter.add_pattern('*.json')
    const filters = new Gio.ListStore({ item_type: Gtk.FileFilter.$gtype })
    filters.append(filter)
    dialog.set_filters(filters)
    dialog.set_default_filter(filter)

    dialog.open(this, null, (_d, result) => {
      try {
        const file = dialog.open_finish(result)
        const path = file?.get_path()
        if (path) void this._loadProjectFromPath(path)
      } catch (error) {
        // User cancelled or dialog failed — ignore.
        if (error instanceof Error && !error.message.includes('Dismissed')) {
          console.warn('[ApplicationWindow] Open dialog failed:', error)
        }
      }
    })
  }

  private async _loadProjectFromPath(projectPath: string): Promise<void> {
    this._showToast(_('Loading project…'))
    try {
      const project = await loadProjectAsAtlas(projectPath)
      this._loadedProject = project
      this._atlas_view.projectName = project.projectName
      this._scene_editor_view.projectName = project.projectName
      this._atlas_view.setWorld(project.scenes, project.teleports, project.resource)
      this._scenesById = new Map(project.scenes.map((s) => [s.id, s]))
      // Force the engine to reload its project on the next scene-editor entry.
      this._engineCtl.invalidateCache()
      // Record success in the recent-projects store + refresh the
      // welcome list so backing out of the project shows the project we
      // just opened at the top.
      const caption = (project.resource.data?.properties?.description as string | undefined) ?? ''
      recordRecentProject({ path: projectPath, name: project.projectName, caption })
      this._welcome_view.setRecentProjects(loadRecentProjects())
      this._showAtlas()
    } catch (error) {
      console.error('[ApplicationWindow] Failed to load project:', error)
      this._showToast(_('Failed to load project'))
    }
  }

  private _showToast(message: string): void {
    this._toast_overlay.add_toast(new Adw.Toast({ title: message, timeout: 3 }))
  }

  /** Bump the engine camera zoom and mirror the new value into the OSD. */
  private _stepZoom(delta: number): void {
    this._engineCtl.stepZoom(delta)
    const next = this._engineCtl.getCameraZoom()
    if (next != null) this._scene_editor_view.setZoom(next)
  }

  /** Set the engine camera to an absolute zoom value and mirror into the OSD. */
  private _applyZoom(zoom: number): void {
    this._engineCtl.applyZoom(zoom)
    this._scene_editor_view.setZoom(zoom)
  }
}

GObject.type_ensure(ApplicationWindow.$gtype)

import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import {
  type AgentMapData,
  ASSISTANT_PEER_ID,
  buildAgentMapData,
  createMapEditorDataOp,
  type EditorTool,
  type SpriteSetData,
} from '@pixelrpg/engine'
import { type CollaboratorEntry, Engine, SignalScope } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import { installWindowAccels } from '../actions/accels.ts'
import { installCastActions } from '../actions/cast-actions.ts'
import { installEditingActions } from '../actions/editing-actions.ts'
import { installInspectorActions } from '../actions/inspector-actions.ts'
import { installObjectActions } from '../actions/object-actions.ts'
import { installPlaytestActions } from '../actions/playtest-actions.ts'
import { installProjectActions } from '../actions/project-actions.ts'
import { installSessionActions } from '../actions/session-actions.ts'
import { booleanState, type StatefulWindowActions, stringState } from '../actions/stateful-actions.ts'
import { installTileActions } from '../actions/tile-actions.ts'
import { installViewActions } from '../actions/view-actions.ts'
import { presentShortcutsDialog } from './shortcuts-dialog.ts'
import { installZoomActions } from '../actions/zoom-actions.ts'
import { type ActionDescriptor, describeActions, requireActionGroup } from '../services/action-inspector.ts'
import { presentTilesetSwitcher } from '../services/asset-dialogs.ts'
import { AssistantStateService } from '../services/assistant-state.service.ts'
import { CastController } from '../services/cast-controller.ts'
import { CollabPresenceController } from '../services/collab-presence-controller.ts'
import { EngineController } from '../services/engine-controller.ts'
import { GameController } from '../services/game-controller.ts'
import { isChipInTier, type LibraryChip } from '../services/library-chip.ts'
import { wireEngineEvents } from '../services/engine-event-bridge.ts'
import { syncEngineState } from '../services/engine-state-sync.ts'
import { buildVariant } from '../services/gvariant.ts'
import type { DiscoveredService } from '../services/lan-discovery-parse.ts'
import { nextLayerDraft } from '../services/layer-draft.ts'
import { MapPersistenceController } from '../services/map-persistence-controller.ts'
import { ObjectsController } from '../services/objects-controller.ts'
import { ProjectLifecycle } from '../services/project-lifecycle.ts'
import type { LoadedProject } from '../services/project-loader.ts'
import { ProjectStore, type ProjectStoreNotice } from '../services/project-store.ts'
import type { UiTierService } from '../services/ui-tier.service.ts'
import { loadRecentProjects } from '../services/recent-projects.ts'
import { SceneNavigator } from '../services/scene-navigator.ts'
import { captureWidgetPng } from '../services/screenshot.ts'
import { SessionCoordinator } from '../services/session-coordinator.ts'
import { type SessionSnapshot, toSessionSnapshot } from '../services/session-snapshot.ts'
import { TilesController } from '../services/tiles-controller.ts'
import type { ViewName } from '../services/view-mode-map.ts'
import { ViewRouter } from '../services/view-router.ts'
import Template from './application-window.blp'
import type { AtlasView } from './atlas-view.ts'
import { GameView } from './game-view.ts'
import { LibraryView } from './library-view.ts'
import { RecentProjectsDialog } from './recent-projects-dialog.ts'
import type { SceneEditorView } from './scene-editor-view.ts'
import type { WelcomeView } from './welcome-view.ts'

// Force registration so the `$PixelRpgLibraryView` / `$PixelRpgGameView`
// references in the blueprint resolve at parse time.
GObject.type_ensure(LibraryView.$gtype)
GObject.type_ensure(GameView.$gtype)

/**
 * Read-only snapshot of the editor's live state, surfaced to external
 * tooling via the `org.pixelrpg.maker.Control` D-Bus interface (and the
 * MCP bridge on top of it). Plain JSON-serialisable shape.
 */
export interface DebugStatus {
  view: string | null
  projectName: string | null
  projectPath: string | null
  currentSceneId: string | null
  sceneIds: string[]
  scenes: Array<{ id: string; name: string }>
  enginePresent: boolean
  /** True once Excalibur has actually initialised (needs a realised window). */
  engineReady: boolean
  /** Whether the window is currently mapped (visible). */
  mapped: boolean
  activeTool: EditorTool | null
  activeTile: number | null
  activeLayer: string | null
  zoom: number | null
  canUndo: boolean
  canRedo: boolean
  isPlaying: boolean
  selectedPlacements: string[]
  /** Whether the AI assistant collaborator is currently present. */
  assistantPresent: boolean
  /**
   * Whether the user has paused the assistant. While `true`, the engine
   * rejects the assistant's cursor + canvas edits AND the Control plane
   * rejects every MUTATING method with a typed `assistant-paused` error;
   * read-only methods (GetStatus, Screenshot, List*) keep working. Only
   * the user can resume — `win.toggle-assistant-paused` is human-only
   * (the control plane rejects it with `human-only-action`). See
   * docs/concepts/ai-collaborator.md § "Pause contract".
   */
  assistantPaused: boolean
  /** Live session participants (AI assistant + networked peers). */
  participants: CollaboratorEntry[]
  /** peerId of the participant the camera is following, or null. */
  followedPeerId: string | null
}

// The action projection behind Control lives in `services/action-inspector.ts`;
// re-exported so existing import sites keep working.
export type { ActionDescriptor }

/** `app.*` and `win.*` actions surfaced together. */
export interface ActionList {
  app: ActionDescriptor[]
  win: ActionDescriptor[]
}

type ActionScope = 'app' | 'win'

// The session-state JSON projection lives in `services/session-snapshot.ts`
// (pure + unit-tested); re-exported so existing import sites keep working.
export type { SessionSnapshot }

/**
 * Top-level window.
 *
 * Hosts an `Adw.ViewStack` that switches between the welcome screen, the
 * three rail rows (World = atlas + scene editor, Library, Game) and
 * composes the collaborators that do the actual work:
 *
 * - {@link ViewRouter} — page switching + mode-rail sync
 * - {@link SceneNavigator} — which scene is open, engine + inspector hydration
 * - {@link ProjectLifecycle} — open / create / close a project
 * - {@link SessionCoordinator} — pair-editing, the Share dialog, awareness relay
 * - {@link ProjectStore} — the single owner of project-level writes
 * - the `installXActions` modules under `src/actions/` — the `win.*` action group
 *
 * The window itself only owns what none of them can: the composite
 * template, the toast surface, the shared sidebar properties, and the
 * public surface the `org.pixelrpg.maker.Control` D-Bus interface drives.
 */
export class ApplicationWindow extends Adw.ApplicationWindow {
  declare _welcome_view: WelcomeView
  declare _atlas_view: AtlasView
  declare _library_view: LibraryView
  declare _scene_editor_view: SceneEditorView
  declare _game_view: GameView
  declare _stack: Adw.ViewStack
  declare _toast_overlay: Adw.ToastOverlay

  private signals = new SignalScope()
  /**
   * The `win` action group, kept for the Control D-Bus interface to
   * enumerate + drive. `Adw.ApplicationWindow` (unlike
   * `Gtk.ApplicationWindow`) has no GActionMap that GtkApplication would
   * export over `org.gtk.Actions`, so external tooling reaches them
   * through Control.
   */
  private _winActions: Gio.SimpleActionGroup | null = null
  /**
   * The stateful actions whose state outlives the engine — re-pushed into
   * every freshly recreated engine by {@link _syncEngineUiState}. Without
   * that re-push the view flags silently reset (and a paused assistant
   * resumed) after any scene-editor exit + re-entry.
   */
  private _actions: StatefulWindowActions | null = null
  /**
   * The single owner of the active project + every project-level write
   * (entity library, sprite-sets, metadata) including persistence +
   * collab broadcast + inbound peer-op application. Controllers are
   * lenses over it; this window only handles the store events that need
   * window-owned resources (the live engine, map-file IO, dialogs).
   */
  private readonly _projectStore = new ProjectStore()
  private get _loadedProject(): LoadedProject | null {
    return this._projectStore.project
  }
  /**
   * Single source of truth for the local AI assistant's presence,
   * identity and the user's pause switch. The engine only carries
   * push-down caches of these (it is disposed/recreated per scene);
   * networked human peers come from the live CollabSession awareness.
   */
  private readonly _assistantState = new AssistantStateService()
  private _engineCtl = new EngineController(
    (engine) => {
      if (engine) this._scene_editor_view.setEngineWidget(engine, engine)
      else this._scene_editor_view.setEngineWidget(null)
    },
    () => new Engine(),
  )
  // Map-file persistence (serialise MapData → source JSON, atlas/preview
  // editor-data writes). Injected accessors read this window's live state;
  // the op plumbing for editor-data changes stays here (collab is the
  // window's concern).
  private _mapPersistCtl = new MapPersistenceController({
    getMapResource: (mapId) => this._loadedProject?.resource.maps.get(mapId) ?? null,
    getScene: (mapId) => this._scenes.getScene(mapId),
    getCurrentSceneId: () => this._scenes.currentSceneId,
    showError: (message) => this._showToast(message),
    sendMapEditorDataChange: (mapId, editorData) =>
      this._session
        .activeCollab()
        ?.sendProjectOp(({ peerId, seq }) => createMapEditorDataOp({ peerId, seq, mapId, editorData })),
  })
  // AI-assistant presence + collaborators-bar roster + camera-follow +
  // the live-session awareness subscriptions. The window keeps thin
  // delegations for the Control plane's public API.
  private _collabPresenceCtl = new CollabPresenceController({
    getEngine: () => this._engineCtl.engine?.excalibur ?? null,
    getActiveCollab: () => this._session.activeCollab(),
    assistantState: this._assistantState,
    setCollaboratorsOnView: (participants, followedPeerId) =>
      this._scene_editor_view.setCollaborators(participants, followedPeerId),
    showToast: (message) => this._showToast(message),
  })
  private readonly _router = new ViewRouter({
    getStack: () => this._stack,
    getRails: () => [this._atlas_view, this._library_view, this._scene_editor_view, this._game_view],
    getMode: () => (this._actions ? stringState(this._actions.mode) : null),
    // set_state (not change_state) so the change-state handler doesn't
    // re-enter: the view is already being set explicitly.
    setModeState: (mode) => this._actions?.mode.set_state(GLib.Variant.new_string(mode)),
    isRailOverlay: () => this._library_view.libraryCollapsed,
    hideLibrary: () => this.set_property('show-library', false),
    onLeaveSceneEditor: () => {
      this._engineCtl.dispose()
      // The engine is gone; a re-entry starts a fresh MapScene in editor
      // mode, so leaving "playing" set would cost an extra click.
      this._actions?.play.change_state(GLib.Variant.new_boolean(false))
    },
  })
  private readonly _scenes = new SceneNavigator({
    getProject: () => this._loadedProject,
    showToast: (message) => this._showToast(message),
    showSceneEditorPage: () => this._router.setView('scene-editor'),
    setScene: (scene) => this._scene_editor_view.setScene(scene),
    ensureEngineForMap: (projectPath, sceneId) => this._engineCtl.ensureForMap(projectPath, sceneId),
    onEngineReady: () => {
      this._syncEngineUiState()
      this._session.attachEngineIfAwaiting()
    },
    populateInspector: (project, sceneId) => this._scene_editor_view.populateFromProject(project, sceneId),
    refreshAtlasWorld: (project) => this._atlas_view.setWorld(project.scenes, project.teleports, project.resource),
  })
  private readonly _session = new SessionCoordinator({
    // The gjs Engine widget wraps the same core `@pixelrpg/engine` Engine
    // the CollabSession expects, so this is an unwrap, not a cast.
    getEngine: () => this._engineCtl.engine?.excalibur ?? null,
    showToast: (message) => this._showToast(message),
    getProjectName: () => this._loadedProject?.projectName ?? null,
    getParentWindow: () => this,
    getDisplay: () => this.get_display(),
    addDiscoveredService: (service) => this._welcome_view.addDiscoveredService(service),
    removeDiscoveredService: (name) => this._welcome_view.removeDiscoveredService(name),
    onSandboxProjectReady: (path) => void this._projects.loadSandbox(path),
    setStoreCollabSession: (collab) => this._projectStore.setCollabSession(collab),
    setPresenceSession: (collab) => this._collabPresenceCtl.attachSession(collab),
  })
  private readonly _projects = new ProjectLifecycle({
    getWindow: () => this,
    showToast: (message) => this._showToast(message),
    setProject: (project) => this._projectStore.setProject(project),
    adoptProject: (project) => {
      this._atlas_view.projectName = project.projectName
      this._library_view.projectName = project.projectName
      this._scene_editor_view.projectName = project.projectName
      this._atlas_view.setWorld(project.scenes, project.teleports, project.resource)
      this._scenes.setScenes(project.scenes)
    },
    // A fresh project starts on the card overview, not a stale detail page
    // left over from the previous one.
    resetViews: () => this._library_view.resetToOverview(),
    refreshRecentProjects: (recent) => this._welcome_view.setRecentProjects(recent),
    setShareEnabled: (enabled) => this._actions?.share.set_enabled(enabled),
    showAtlas: () => this._router.setView('atlas'),
    showWelcome: () => this._router.setView('welcome'),
    invalidateEngine: () => this._engineCtl.invalidateCache(),
    disposeEngine: () => this._engineCtl.dispose(),
    leaveSession: () => this._session.leave('project-closed'),
    detachCollab: () => this._projectStore.setCollabSession(null),
  })
  /**
   * Per-mode controllers — thin lenses over the shared {@link ProjectStore}.
   * Constructed in `vfunc_map`, once the template-instantiated views are
   * reachable.
   */
  private _castCtl: CastController | null = null
  private _objectsCtl: ObjectsController | null = null
  private _tilesCtl: TilesController | null = null
  private _gameCtl: GameController | null = null

  private _fullView = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'ApplicationWindow',
        Template,
        InternalChildren: [
          'welcome_view',
          'atlas_view',
          'library_view',
          'scene_editor_view',
          'game_view',
          'stack',
          'toast_overlay',
        ],
        Properties: {
          // Single source of truth for sidebar visibility. Each view's
          // own `show-library` / `show-inspector` is bound bidirectionally
          // to these in the constructor, so toggling the library in
          // atlas keeps it visible after navigating to scene-editor (or
          // vice-versa). Before, each view held an independent state +
          // had different defaults, so a fresh sidebar would auto-open
          // on view switch every time.
          //
          // Defaults closed: the user opens what they want from the
          // floating toggles. Removing the auto-open avoids the "wait
          // why did the inspector appear" surprise the user flagged.
          'show-library': GObject.ParamSpec.boolean(
            'show-library',
            'Show library',
            'Whether the left library sidebar is visible (shared across all views)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'show-inspector': GObject.ParamSpec.boolean(
            'show-inspector',
            'Show inspector',
            'Whether the right inspector sidebar is visible (shared across all views)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          // Mirror of the app tier (`UiTierService.full-view`), pushed
          // into every view's own `full-view` so Blueprint leaves can
          // write `visible: bind template.full-view;`.
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full view',
            'Whether the editor shows everything (Full view) or the Simple-view subset',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      ApplicationWindow,
    )
  }

  constructor(
    application: Adw.Application,
    private readonly _uiTier: UiTierService,
  ) {
    super({ application })
    this._installActions()
    this._shareSidebarState()
    this._shareFullView()
    wireEngineEvents(this._engineCtl, {
      showToast: (message) => this._showToast(message),
      setZoom: (zoom) => this._scene_editor_view.setZoom(zoom),
      setCursorTile: (tileX, tileY) => this._scene_editor_view.setCursorTile(tileX, tileY),
      setHistoryEnabled: (canUndo, canRedo) => {
        this._actions?.undo.set_enabled(canUndo)
        this._actions?.redo.set_enabled(canRedo)
      },
      adoptPickedTile: (globalTileId) => {
        this._scene_editor_view.selectTileByGlobalId(globalTileId)
        this._actions?.tool.change_state(GLib.Variant.new_string('pencil'))
      },
      selectPlacement: (placementId) => {
        this._scene_editor_view.highlightPlacement(placementId)
        if (placementId) this.set_property('show-inspector', true)
      },
      setLayerFlag: (layerId, flag, value) => this._scene_editor_view.setLayerFlag(layerId, flag, value),
      refreshLayers: () => {
        const sceneId = this._scenes.currentSceneId
        const mapData = sceneId ? this._loadedProject?.resource.maps.get(sceneId)?.mapData : undefined
        if (mapData) this._scene_editor_view.refreshLayers(mapData)
      },
    })
    this._wireStoreEvents()
  }

  /**
   * Store events that need window-owned resources: the live engine and
   * map-file IO. The store itself is UI-free — it emits semantic notices
   * and this window translates + toasts them (msgids stay literal for
   * extraction).
   */
  private _wireStoreEvents(): void {
    this._projectStore.on('notice', (notice) => this._showToast(this._noticeText(notice)))
    // The Library's honesty banner is derived from content, so recompute
    // it whenever the content it reads can change: project swap, and any
    // entity edit from either lens or a peer.
    const refreshHiddenContent = () =>
      this._library_view.setHiddenContent(this._projectStore.hasSimpleViewHiddenContent())
    this._projectStore.on('project-changed', refreshHiddenContent)
    this._projectStore.on('entity-library-changed', refreshHiddenContent)
    // Tile-property edits (Solid / Surface), local or inbound from a peer,
    // may change live collision; with a scene open, refresh the engine so
    // the change applies without a reload. The engine ref is per-scene +
    // lazy, so resolve it on every call.
    this._projectStore.on('tile-properties-changed', ({ spriteSetId }) => {
      this._engineCtl.engine?.refreshTileSolidsForSpriteSet(spriteSetId)
    })
    // An inbound `__project/map.editor-data` patched a map (the store
    // applied it in memory) — persist that map file here (this window
    // owns map IO) and reposition its atlas card.
    this._projectStore.on('map-editor-data-changed', ({ mapId }) => {
      this._mapPersistCtl.persistMap(mapId, _('Could not save map position'))
      this._scenes.refreshAtlasPosition(mapId)
    })
  }

  vfunc_map(): void {
    super.vfunc_map()

    this.signals.connect(this._welcome_view, 'create-project', () => this._projects.create())
    this.signals.connect(this._welcome_view, 'open-project', () => this._projects.openFromDialog())
    this.signals.connect(this._welcome_view, 'browse-projects', () => this._projects.openFromDialog())
    this.signals.connect(this._welcome_view, 'template-selected', (_v: WelcomeView, templateId: string) => {
      this._projects.openTemplate(templateId)
    })
    this.signals.connect(this._welcome_view, 'recent-selected', (_v: WelcomeView, path: string) => {
      void this._projects.load(path)
    })

    // Render the user's persisted recent-projects list on every map.
    // Cheap enough (synchronous JSON read) that we don't bother caching.
    this._welcome_view.setRecentProjects(loadRecentProjects())

    this.signals.connect(this._atlas_view, 'scene-opened', (_v: AtlasView, id: string) => {
      this._scenes.open(id)
    })
    this.signals.connect(this._atlas_view, 'scene-selected', (_v: AtlasView, id: string) => {
      this._scenes.selectedAtlasSceneId = id
    })
    this.signals.connect(this._atlas_view, 'scene-moved', (_v: AtlasView, id: string, x: number, y: number) => {
      this._mapPersistCtl.persistAtlasPosition(id, x, y)
    })
    this.signals.connect(
      this._atlas_view,
      'preview-moved',
      (_v: AtlasView, id: string, tileX: number, tileY: number) => {
        this._mapPersistCtl.persistPreviewViewport(id, tileX, tileY)
      },
    )
    // Every view's mode-rail forwards `mode-changed` at the view level.
    // Re-route all of them through the central `win.mode` action so
    // navigation is consistent — the action's change-state handler picks
    // the right ViewStack page. Mutation handling + persistence belongs to
    // the per-mode controllers; view-side stays presentational.
    const setMode = (mode: string) => this._actions?.mode.change_state(GLib.Variant.new_string(mode))
    for (const view of [this._atlas_view, this._scene_editor_view, this._library_view, this._game_view]) {
      this.signals.connect(view, 'mode-changed', (_v: unknown, mode: string) => setMode(mode))
    }
    // The Library's own chip clicks flow back into `win.library-chip`, so
    // an external driver reading the action state sees what is on screen.
    this.signals.connect(this._library_view, 'notify::chip', () => {
      this._actions?.libraryChip.set_state(GLib.Variant.new_string(this._library_view.chip))
    })

    // Scene editor → host bridge. The inspector mutates `MapResource
    // .mapData` in place via `engine.setLayerVisible` / `setLayerLocked`,
    // then asks the host to persist.
    this.signals.connect(this._scene_editor_view, 'persist-requested', () => {
      this._mapPersistCtl.persistCurrentMap()
    })

    // A placement was removed via the Props tab — refresh the inspector's
    // placement list (the command already mutated the live MapData) and
    // persist, mirroring the layer-flag flow.
    this.signals.connect(this._scene_editor_view, 'object-removed', () => {
      const sceneId = this._scenes.currentSceneId
      if (this._loadedProject && sceneId) {
        void this._scene_editor_view.populateFromProject(this._loadedProject, sceneId)
      }
      this._mapPersistCtl.persistCurrentMap()
    })

    this._ensureControllers()

    // Welcome view ↔ session bridge. The window owns the coordinator (it
    // spans every view's lifetime); the Welcome view is just the visual
    // surface for browse + join.
    this.signals.connect(this._welcome_view, 'session-selected', (_v: WelcomeView, service: DiscoveredService) => {
      void this._session.joinLan(service)
    })
    this.signals.connect(this._welcome_view, 'join-by-code', (_v: WelcomeView, roomId: string) => {
      void this._session.joinByRoomId(roomId)
    })
    this._session.start()

    this._refreshSessionBrowsing()
    this.signals.connect(this._stack, 'notify::visible-child-name', () => this._refreshSessionBrowsing())
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    this._session.stop()
    super.vfunc_unmap()
  }

  /**
   * Per-mode lenses over the shared store. Cross-lens refreshes ride the
   * store's typed events (each lens subscribes itself); this window only
   * wires the pieces that need window-owned resources (dialogs, navigation).
   */
  private _ensureControllers(): void {
    const library = this._library_view
    if (!this._castCtl) this._castCtl = new CastController(library.castView, this._projectStore)
    if (!this._tilesCtl && this._castCtl) {
      // Sprite-set CRUD + tile properties delegate to the store (the
      // single descriptor write + collab-broadcast path); appearance /
      // animation edits route through the cast controller's methods.
      this._tilesCtl = new TilesController(library.tilesView, this._projectStore, this._castCtl)
    }
    if (!this._gameCtl) this._gameCtl = new GameController(this._game_view, this._projectStore)
    if (!this._objectsCtl) this._objectsCtl = new ObjectsController(library.objectsView, this._projectStore)
  }

  /**
   * Bidirectionally bind this window's `show-library` / `show-inspector`
   * to every view's own pair. Effect: the sidebars retain their state
   * across view switches — opening the library in atlas keeps it open
   * after navigating to scene-editor, and closing it stays closed when
   * the user goes back.
   *
   * Welcome is deliberately NOT bound: its recents column is part of the
   * home layout (visible by default, inlined below the hero on phone),
   * not a project inspector — sharing state would hide it whenever the
   * user last closed an editor inspector.
   */
  private _shareSidebarState(): void {
    const flags = GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
    for (const view of [this._atlas_view, this._scene_editor_view]) {
      this.bind_property('show-library', view, 'show-library', flags)
      this.bind_property('show-inspector', view, 'show-inspector', flags)
    }
    // The Library and the Game page have a mode rail but no inspector
    // drawer (their detail panes are master-detail splits) — bind only
    // the library.
    this.bind_property('show-library', this._library_view, 'show-library', flags)
    this.bind_property('show-library', this._game_view, 'show-library', flags)
  }

  /**
   * The app tier flows one way: service → this window → every view. The
   * views never write it back; the three switches all go through the
   * service (`app.full-view`, Preferences, `win.show-full-view`).
   */
  private _shareFullView(): void {
    const flags = GObject.BindingFlags.SYNC_CREATE
    this._uiTier.bind_property('full-view', this, 'full-view', flags)
    for (const view of [this._atlas_view, this._scene_editor_view, this._library_view, this._game_view]) {
      this.bind_property('full-view', view, 'full-view', flags)
    }
  }

  get fullView(): boolean {
    return this._fullView
  }

  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this.notify('full-view')
  }

  /**
   * Flip to Full view from where a wall was hit, and put the way back on
   * screen: a toast whose Undo returns to Simple view. The switch is
   * global on purpose — a per-panel reveal is thirty remembered states
   * nobody can explain, and an unremembered one is a wall the child
   * re-finds every session.
   */
  private _revealFullView(): void {
    this._uiTier.fullView = true
    const toast = new Adw.Toast({ title: _('Full view on'), buttonLabel: _('Undo') })
    toast.connect('button-clicked', () => {
      this._uiTier.fullView = false
    })
    this._toast_overlay.add_toast(toast)
  }

  /**
   * Build the `win` action group. Each group gets a context listing only
   * what it needs; the returned handles are the stateful actions the
   * window keeps driving afterwards.
   */
  private _installActions(): void {
    const group = new Gio.SimpleActionGroup()
    const hasProject = () => this._loadedProject != null
    const showToast = (message: string) => this._showToast(message)

    const { mode, libraryChip } = installViewActions(group, {
      hasProject,
      setView: (view) => this._router.setView(view),
      prepareView: (view) => this._prepareView(view),
      setLibraryChip: (chip) => this._landOnChip(chip),
      selectedSceneId: () => this._scenes.selectedAtlasSceneId,
      openScene: (sceneId) => this._scenes.open(sceneId),
      showFullView: () => this._revealFullView(),
      showShortcuts: () => presentShortcutsDialog(this),
    })

    installProjectActions(group, {
      showToast,
      openProject: () => this._projects.openFromDialog(),
      presentRecentProjects: () => this._presentRecentProjects(),
      closeProject: () => void this._projects.close(),
    })

    installZoomActions(group, {
      targetsAtlas: () => this._router.currentView === 'atlas',
      stepAtlasZoom: (delta) => this._atlas_view.stepPreviewZoom(delta),
      resetAtlasZoom: () => this._atlas_view.resetPreviewZoom(),
      fitAtlas: () => this._atlas_view.fitAtlas(),
      stepEngineZoom: (delta) => this._stepZoom(delta),
      resetEngineZoom: () => void this._applyZoom(1),
    })

    const { tool, undo, redo } = installEditingActions(group, {
      setEngineTool: (next) => this._engineCtl.engine?.setActiveTool(next),
      setViewTool: (next) => this._scene_editor_view.setActiveTool(next),
      setEngineObjectBrush: (defId) => this._engineCtl.engine?.setObjectBrush(defId),
      setViewObjectBrush: (defId) => this._scene_editor_view.setArmedObjectBrush(defId),
      setSelectedPlacements: (ids) => this._engineCtl.engine?.setSelectedPlacements([...ids]),
      highlightPlacement: (id) => this._scene_editor_view.highlightPlacement(id),
      revealInspector: () => this.set_property('show-inspector', true),
      undo: () => this._engineCtl.engine?.undo(),
      redo: () => this._engineCtl.engine?.redo(),
      createLayer: () => this._createLayer(),
    })

    const { objects, grid, transparency } = installInspectorActions(group, {
      sidebarOwner: this,
      setInspectorTab: (name) => this._scene_editor_view.setInspectorTab(name),
      setEngineObjectsVisible: (visible) => this._engineCtl.engine?.setObjectsVisible(visible),
      setViewObjectsVisible: (visible) => this._scene_editor_view.setObjectsVisible(visible),
      setEngineShowGrid: (showGrid) => this._engineCtl.engine?.setShowGrid(showGrid),
      setEngineDimInactiveLayers: (dim) => this._engineCtl.engine?.setDimInactiveLayers(dim),
    })

    const { play } = installPlaytestActions(group, {
      persistCurrentMap: () => this._mapPersistCtl.persistCurrentMap(),
      setRuntimeMode: (playing) => this._engineCtl.engine?.setRuntimeMode(playing),
      setViewPlaying: (playing) => this._scene_editor_view.setPlaying(playing),
      clearSaveState: () => this._engineCtl.engine?.clearSaveState(),
    })

    const { share } = installSessionActions(group, {
      presentShareDialog: () => this._session.presentShareDialog(),
      setAssistantPaused: (paused) => this._assistantState.setPaused(paused),
      setEngineAssistantPaused: (paused) => this._engineCtl.engine?.excalibur?.setAssistantPaused(paused),
      setViewAssistantPaused: (paused) => this._scene_editor_view.setAssistantPaused(paused),
    })

    const library = this._library_view
    installCastActions(group, {
      hasProject,
      showToast,
      showCharacters: () => this._showLibrary('characters'),
      presentNewCharacter: () => library.castView.presentNewCharacterDialog(),
      focusCharacter: (id) => library.castView.focusCharacter(id),
      focusCharacterBySheet: (sheetId) => library.castView.focusCharacterBySheet(sheetId),
      presentNewAnimation: (sheetId) => library.castView.presentNewAnimationForSheet(sheetId),
      currentSceneId: () => this._scenes.currentSceneId,
      openScene: (sceneId) => this._scenes.open(sceneId),
      armObjectBrush: (defId) => this.activate_action('win.set-object-brush', GLib.Variant.new_string(defId)),
    })

    installTileActions(group, {
      hasProject,
      showToast,
      showGraphics: () => this._showLibrary('graphics'),
      presentAppearanceImport: () => library.tilesView.presentAppearanceImportDialog(),
      presentTilesetImport: () => library.tilesView.presentTilesetImportDialog(),
      focusTileset: (id) => library.tilesView.focusTileset(id),
      focusAppearance: (id) => library.tilesView.focusAppearance(id),
      switchTileset: () => this._switchTileset(),
    })

    installObjectActions(group, {
      hasProject,
      showToast,
      showThings: () => this._showLibrary('things'),
      createFromTemplate: (templateId) => this._objectsCtl?.createFromTemplate(templateId),
      focusObject: (id) => library.objectsView.focusObject(id),
      toggleCastMember: (id) => this._objectsCtl?.toggleCastMember(id),
    })

    installWindowAccels(this.get_application())

    this.insert_action_group('win', group)
    this._winActions = group
    this._actions = { mode, libraryChip, tool, play, objects, grid, transparency, share, undo, redo }
  }

  /** `win.open-recent-projects` — the primary menu's "Open Recent". */
  private _presentRecentProjects(): void {
    const dialog = new RecentProjectsDialog()
    dialog.setRecentProjects(loadRecentProjects())
    dialog.connect('recent-selected', (_d: RecentProjectsDialog, path: string) => {
      dialog.close()
      void this._projects.load(path)
    })
    dialog.present(this)
  }

  /** Re-hydrate the lenses behind `view` before the router shows it. */
  private _prepareView(view: ViewName): void {
    if (view !== 'library') return
    void this._castCtl?.refresh()
    this._objectsCtl?.refresh()
  }

  /**
   * The deep links' landing: `win.mode('library')` plus the chip. Goes
   * through the router (rail highlight, engine teardown) exactly like a
   * rail click, then picks the page.
   */
  private _showLibrary(chip: LibraryChip): void {
    this._prepareView('library')
    this._router.setView('library')
    this._landOnChip(chip)
  }

  /**
   * The one way onto a Library chip from outside the header: the
   * `win.library-chip` action and every deep link. A chip the current
   * tier does not show (Graphics in Simple view) counts as a wall hit —
   * the link flips to Full view first, with the same toast-and-Undo as
   * the other reveals, and then lands. Dropping the link instead would
   * be a deep link that silently does nothing, which is the worse of
   * the two: `win.open-appearance` from tooling, `win.new-spriteset`
   * from the MCP bridge and `set_view library graphics` all arrive
   * here without a person who could read a refusal.
   */
  private _landOnChip(chip: LibraryChip): void {
    if (!isChipInTier(chip, this._fullView)) this._revealFullView()
    this._library_view.chip = chip
  }

  /**
   * `win.switch-tileset` — pick which of the active scene's tilesets feeds
   * the Tiles-tab palette. Maps referencing a single sprite set have
   * nothing to switch to.
   */
  private _switchTileset(): void {
    const project = this._loadedProject
    const sceneId = this._scenes.currentSceneId
    if (!project || !sceneId) return
    const refs = project.resource.maps.get(sceneId)?.mapData?.spriteSets ?? []
    if (refs.length <= 1) {
      this._showToast(_('This map uses a single tileset.'))
      return
    }
    const activeId = this._scene_editor_view.activeTilesetId
    const choices = refs.map((ref) => ({ id: ref.id, active: ref.id === activeId }))
    presentTilesetSwitcher(this, choices, (spriteSetId) => {
      const ref = refs.find((r) => r.id === spriteSetId)
      void this._scene_editor_view.loadTileset(project, spriteSetId, ref?.firstGid ?? 1)
    })
  }

  /**
   * `win.new-layer` — append a fresh empty layer, in the plane of the
   * active layer, to the active scene's map through the engine's
   * undoable + collab-synced `AddLayerCommand`. The command's
   * `LAYER_LIST_CHANGED` re-reads the Layers tab; this only selects the
   * new layer and persists. The engine mutates the shared project
   * `MapResource`, so both see the new layer.
   */
  private _createLayer(): void {
    const sceneId = this._scenes.currentSceneId
    if (!sceneId) return
    const layers = this._loadedProject?.resource.maps.get(sceneId)?.mapData?.layers
    if (!layers) return
    const activeId = this._scene_editor_view.activeLayerId
    const active = activeId ? layers.find((l) => l.id === activeId) : undefined
    const layer = nextLayerDraft(layers, active?.plane)
    if (!this._engineCtl.engine?.addLayer(layer)) return
    this._scene_editor_view.selectLayer(layer.id)
    this._mapPersistCtl.persistCurrentMap()
    this._showToast(_(`Added “${layer.name}”`))
  }

  /**
   * Push the window-owned stateful editor state into the current engine —
   * called after every `ensureForMap` so a recreated engine starts from
   * the user's actual state instead of the engine defaults. The push list
   * lives in `engine-state-sync.ts` (spec-guarded); this only adapts the
   * GAction states + the AssistantStateService snapshot into the sync call
   * and re-points the assistant awareness relay (a fresh engine has
   * `setAssistantFrameRelay(null)`).
   */
  private _syncEngineUiState(): void {
    const widget = this._engineCtl.engine
    const ex = widget?.excalibur
    const actions = this._actions
    if (!widget || !ex || !actions) return
    syncEngineState(widget, ex, {
      tool: stringState(actions.tool) as EditorTool | null,
      objectsVisible: booleanState(actions.objects, true),
      showGrid: booleanState(actions.grid, false),
      dimInactiveLayers: booleanState(actions.transparency, false),
      assistant: this._assistantState.snapshot(),
      followAssistant: this.followedPeerId === ASSISTANT_PEER_ID,
    })
    this._session.refreshWiring()
  }

  /** mDNS pings every couple of seconds — only browse on the welcome page. */
  private _refreshSessionBrowsing(): void {
    this._session.setBrowsing(this._router.currentView === 'welcome')
  }

  /** Translate a {@link ProjectStoreNotice} into its user-facing toast text. */
  private _noticeText(notice: ProjectStoreNotice): string {
    switch (notice.kind) {
      case 'image-copy-failed':
        return _('Could not copy the image into the project')
      case 'sprite-set-save-failed':
        return _('Could not save the sprite set')
      case 'project-save-failed':
        return _('Could not save project')
      case 'sprite-set-imported':
        return _('Imported sprite set “%s”').replace('%s', notice.name)
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

  /**
   * Set the engine camera to an absolute zoom value and mirror into the
   * OSD. Returns `false` when there is no live engine (nothing changed) —
   * the Control plane reports that as a typed error instead of success.
   */
  private _applyZoom(zoom: number): boolean {
    if (!this._engineCtl.applyZoom(zoom)) return false
    this._scene_editor_view.setZoom(zoom)
    return true
  }

  /**
   * Read-only snapshot of the editor's live state for external tooling
   * (the `org.pixelrpg.maker.Control` D-Bus interface → MCP bridge).
   */
  getDebugStatus(): DebugStatus {
    const engine = this._engineCtl.engine
    const ex = engine?.excalibur ?? null
    const scenes = this._scenes.scenes
    return {
      view: this._router.currentView,
      projectName: this._loadedProject?.projectName ?? null,
      projectPath: this._loadedProject?.projectPath ?? null,
      currentSceneId: this._scenes.currentSceneId,
      sceneIds: scenes.map((s) => s.id),
      scenes: scenes.map((s) => ({ id: s.id, name: s.name })),
      enginePresent: engine != null,
      // engineReady = Excalibur actually initialised (vs. just the widget
      // existing). It's null until the window is realised + the GLArea's
      // `onReady` fires — so a tool can tell whether to `present_window`
      // before hosting/painting.
      engineReady: ex != null,
      mapped: this.get_mapped(),
      activeTool: ex?.getActiveTool() ?? null,
      activeTile: ex?.getActiveTile() ?? null,
      activeLayer: ex?.getActiveLayer() ?? null,
      zoom: engine?.getCameraZoom() ?? null,
      canUndo: engine?.canUndo() ?? false,
      canRedo: engine?.canRedo() ?? false,
      isPlaying: ex?.isRuntimeMode() ?? false,
      selectedPlacements: engine?.getSelectedPlacements() ?? [],
      // Window-level presence OR an engine-side active assistant — the
      // participants bar and this status flag must tell the same story
      // (presence can exist without a live engine, e.g. in the atlas).
      assistantPresent: this._assistantState.present || (ex?.isAssistantActive() ?? false),
      // The AssistantStateService is the single source — the engine's
      // copy is a push-down cache that resets on recreation.
      assistantPaused: this._assistantState.paused,
      participants: this.getParticipants(),
      followedPeerId: this.followedPeerId,
    }
  }

  /** Set the camera zoom to an absolute value (1 = 100%). Returns `false` without a live engine. */
  setZoom(zoom: number): boolean {
    return this._applyZoom(zoom)
  }

  /**
   * Resize the top-level window to an absolute pixel size — lets external
   * tooling (Control D-Bus → MCP) exercise the adaptive phone / tablet /
   * desktop breakpoints the responsive layouts react to. GTK4 has no
   * synchronous `resize()`, so we unmaximize / unfullscreen (otherwise the
   * request is ignored) and set the default size, which is GTK4's resize
   * path for an already-mapped window. Returns the [width, height] actually
   * requested (clamped to ≥1); the real allocation settles a frame later,
   * so a caller wanting the settled size should re-`GetStatus` after.
   */
  resizeWindow(width: number, height: number): [number, number] {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (this.is_maximized()) this.unmaximize()
    if (this.is_fullscreen()) this.unfullscreen()
    this.set_default_size(w, h)
    return [w, h]
  }

  /**
   * Paint/erase a tile programmatically (Control → MCP). `layerId` null =
   * active layer; `spriteId` undefined = active tile, `0`/`null` = erase.
   * Goes through the engine's command path, so it undoes + syncs to collab
   * peers. `origin` is the initiating actor id the Control service passes
   * (`ASSISTANT_PEER_ID`) so the op attributes the edit to the AI on
   * remote peers. Returns `false` if it couldn't be applied.
   */
  paintTile(layerId: string | null, tileX: number, tileY: number, spriteId?: number | null, origin?: string): boolean {
    return this._engineCtl.engine?.excalibur?.paintTileAt(layerId, tileX, tileY, spriteId, origin) ?? false
  }

  /**
   * Bucket-fill from a tile programmatically (Control → MCP). Same
   * semantics + attribution as {@link paintTile}, but flood-fills the
   * contiguous region matching the origin tile. Returns `false` if it
   * couldn't be applied.
   */
  fillTile(layerId: string | null, tileX: number, tileY: number, spriteId?: number | null, origin?: string): boolean {
    return this._engineCtl.engine?.excalibur?.fillTileAt(layerId, tileX, tileY, spriteId, origin) ?? false
  }

  /**
   * Place a library object on the active map programmatically (Control →
   * MCP). `layerId` null = active layer. Goes through the engine command
   * path (undo + collab). `origin` — initiating actor id for peer-side
   * attribution (see {@link paintTile}). Returns `false` if it couldn't
   * be applied.
   */
  placeObject(defId: string, layerId: string | null, tileX: number, tileY: number, origin?: string): boolean {
    return this._engineCtl.engine?.excalibur?.placeObjectAt(defId, layerId, tileX, tileY, origin) ?? false
  }

  /**
   * Undo / redo programmatically (Control → MCP) with attribution: the
   * `win.undo` / `win.redo` GActions have no parameter channel for an
   * initiator, so the Control service calls this instead and passes
   * `ASSISTANT_PEER_ID` as `origin` — the resulting revert/apply op
   * attributes to the AI on remote peers (see {@link paintTile}). The
   * human's keyboard/menu path keeps using the GActions (origin-less).
   * Returns `false` if there's no engine or nothing to undo/redo.
   */
  undoRedo(which: 'undo' | 'redo', origin?: string): boolean {
    const engine = this._engineCtl.engine?.excalibur
    if (!engine) return false
    return which === 'undo' ? engine.undo(origin) : engine.redo(origin)
  }

  /** Whether the user has paused the assistant (read by the Control plane's pause guard). */
  isAssistantPaused(): boolean {
    return this._collabPresenceCtl.isAssistantPaused()
  }

  /** Show/move the AI-assistant collaborator cursor at tile (x, y). Returns false without an engine. */
  setAssistantCursor(tileX: number, tileY: number): boolean {
    return this._collabPresenceCtl.setAssistantCursor(tileX, tileY)
  }

  /**
   * Mark the AI assistant present without moving its cursor. The Control
   * D-Bus surface calls this on every mutating method, so ANY external
   * driver (MCP bridge, scripts) shows up in the participants bar the
   * moment it starts acting.
   */
  ensureAssistantPresence(): void {
    this._collabPresenceCtl.ensureAssistantPresence()
  }

  /** Set the AI-assistant cursor's display name + colour. */
  setAssistantInfo(displayName: string, color: string): void {
    this._collabPresenceCtl.setAssistantInfo(displayName, color)
  }

  /** Remove the AI-assistant cursor/presence. */
  hideAssistant(): void {
    this._collabPresenceCtl.hideAssistant()
  }

  /** The live participant roster (collaborators bar + `getDebugStatus`). */
  getParticipants(): CollaboratorEntry[] {
    return this._collabPresenceCtl.getParticipants()
  }

  /**
   * Follow `peerId` with the camera (pass `null` to stop). Public so the
   * Control interface can drive it too.
   */
  followParticipant(peerId: string | null): void {
    this._collabPresenceCtl.followParticipant(peerId)
  }

  /** The currently-followed participant peerId, or null. */
  get followedPeerId(): string | null {
    return this._collabPresenceCtl.followedPeerId
  }

  /**
   * Capture the editor to PNG bytes for external tooling. `scope:
   * 'window'` renders the whole top-level (chrome + sidebars + canvas)
   * via the GSK renderer; `scope: 'canvas'` renders just the engine
   * widget. Returns `null` when nothing renderable is available (e.g.
   * the scene editor isn't open for `'canvas'`, or the window isn't
   * realised yet).
   */
  async captureScreenshot(scope: 'window' | 'canvas'): Promise<Uint8Array | null> {
    if (scope === 'canvas') {
      const engine = this._engineCtl.engine
      // Framebuffer first: read during the next frame (postdraw), so
      // it returns real content even when the window is occluded —
      // the WidgetPaintable snapshot comes back empty then. Widget
      // snapshot stays as the fallback for engines without a GL
      // context yet (or with a paused frame clock: minimised).
      const fromGl = (await engine?.captureCanvasPng()) ?? null
      if (fromGl) return fromGl
      if (engine) return captureWidgetPng(engine)
    }
    return captureWidgetPng(this)
  }

  /**
   * Agent-oriented projection of a loaded map (walkability grid,
   * placements, spawn points, teleport targets) — see the engine's
   * `buildAgentMapData`. Works with no open scene and no engine:
   * resolved purely from the loaded project data. Returns `null`
   * when no project is open or the map id is unknown.
   */
  agentMapData(mapId: string): AgentMapData | null {
    const resource = this._projectStore.resource
    const mapResource = resource?.maps.get(mapId)
    if (!resource || !mapResource?.mapData) return null
    const sets = new Map<string, SpriteSetData>()
    for (const [id, setResource] of resource.spriteSets) {
      if (setResource.data) sets.set(id, setResource.data)
    }
    return buildAgentMapData(mapResource.mapData, sets, resource.data?.entityLibrary ?? [])
  }

  /**
   * Load a project from a `game-project.json` path — the headless
   * equivalent of the welcome view's file picker, for external tooling
   * (Control D-Bus → MCP). Validates the path exists (throws → D-Bus
   * error otherwise), then kicks off the async load; callers poll
   * {@link getDebugStatus} for completion.
   */
  openProject(path: string): void {
    if (!Gio.File.new_for_path(path).query_exists(null)) {
      throw new Error(`Project file not found: ${path}`)
    }
    void this._projects.load(path)
  }

  /**
   * Start hosting a collaboration session — the headless equivalent of
   * the Share dialog's "Share" button (Control D-Bus → MCP). Requires a
   * loaded project; resolves with the room id joiners use. The host's
   * engine must be live (open a scene) by the time a joiner connects.
   */
  async startSession(): Promise<string> {
    if (!this._session.isReady) throw new Error('Session service not ready (window not mapped yet)')
    const project = this._loadedProject
    if (!project) throw new Error('Open a project before hosting a session')
    return this._session.startHosting(project.projectName)
  }

  /**
   * Join a collaboration session by room id (the headless equivalent of
   * the Welcome view's "Join by code"). The window must be browsing
   * (i.e. on the welcome view) for the LAN path to find the host. The
   * existing `sandbox-project-ready` wiring loads the pulled project;
   * open a scene afterwards to attach the engine.
   */
  async joinSession(roomId: string): Promise<void> {
    await this._session.join(roomId)
  }

  /** JSON-safe snapshot of the current collaboration session state. */
  getSessionState(): SessionSnapshot {
    return toSessionSnapshot(this._session.getState())
  }

  /**
   * Enumerate the `app.*` and `win.*` actions for external tooling
   * (Control D-Bus → MCP bridge).
   */
  listActions(): ActionList {
    return { app: describeActions(this._actionGroup('app')), win: describeActions(this._actionGroup('win')) }
  }

  /**
   * Activate an action by scope + name, optionally with a parameter.
   * The parameter `GLib.Variant` is built from the action's declared
   * parameter type, so a plain JS value is enough.
   */
  activateAction(scope: ActionScope, name: string, value?: unknown): void {
    const group = requireActionGroup(this._actionGroup(scope), scope, name)
    const paramType = group.get_action_parameter_type(name)
    const param = value === undefined || value === null ? null : buildVariant(paramType, value)
    group.activate_action(name, param)
  }

  /**
   * Set a stateful action's state by scope + name. Used for idempotent
   * toggles (e.g. `win.toggle-grid`, `win.play`, `win.set-tool`) where
   * activation alone would only flip the current value.
   */
  changeActionState(scope: ActionScope, name: string, value: unknown): void {
    const group = requireActionGroup(this._actionGroup(scope), scope, name)
    group.change_action_state(name, buildVariant(group.get_action_state_type(name), value))
  }

  private _actionGroup(scope: ActionScope): Gio.ActionGroup | null {
    if (scope === 'app') return this.get_application()
    return this._winActions
  }
}

GObject.type_ensure(ApplicationWindow.$gtype)

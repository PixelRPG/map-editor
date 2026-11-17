import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import {
  type AgentMapData,
  ASSISTANT_PEER_ID,
  buildAgentMapData,
  createMapEditorDataOp,
  type EditorTool,
  isLayerPlane,
  type SpriteSetData,
} from '@pixelrpg/engine'
import {
  type CollaboratorEntry,
  Engine,
  mapCaption,
  type MapSelectionBar,
  mapSelectionFacts,
  promptRename,
  SignalScope,
  teleportSummaries,
  type Tile,
} from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import { installWindowAccels, WINDOW_SHORTCUTS } from '../actions/accels.ts'
import { installBackActions } from '../actions/back-actions.ts'
import { installCastActions } from '../actions/cast-actions.ts'
import { installConnectionActions } from '../actions/connection-actions.ts'
import { installEditingActions } from '../actions/editing-actions.ts'
import { installInspectorActions } from '../actions/inspector-actions.ts'
import { installMapActions } from '../actions/map-actions.ts'
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
import { AssistantStateService } from '../services/assistant-state.service.ts'
import type { BackStep } from '../services/back-order.ts'
import { CastController } from '../services/cast-controller.ts'
import { CollabPresenceController } from '../services/collab-presence-controller.ts'
import { DoorTargetFlow } from '../services/door-target-flow.ts'
import type { CollabIdentityService } from '../services/collab-identity.service.ts'
import type { EditorDefaultsService } from '../services/editor-defaults.service.ts'
import { EngineController } from '../services/engine-controller.ts'
import type { EntityDeleteHost } from '../services/entity-deletion.ts'
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
import { buildAtlasWorld, type LoadedProject } from '../services/project-loader.ts'
import type { MapSize } from '../services/project-store-maps.ts'
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
import type { ResponsiveEditorView } from './responsive-editor-view.ts'
import type { SceneEditorView } from './scene-editor-view.ts'
import type { WelcomeView } from './welcome-view.ts'
import { type DoorTargetMapOption, presentDoorTargetDialog } from './scene-editor/door-target-dialog.ts'
import { confirmMapDelete, presentMapSettingsDialog, presentNewMapDialog } from './world/map-dialogs.ts'

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
  /**
   * Whether `SceneEditorView` still sits where it was built: parented by
   * `root_stack` and rooted in this window.
   *
   * It is the one widget in the tree that must NEVER be reparented. The
   * gjs `Engine` tears its Excalibur instance down in `vfunc_unroot`, and
   * nothing rebuilds it — so a single unroot kills the map editor's loop
   * for the rest of the process (REDESIGN.md § 10, risk 4). Switching
   * `root_stack` between the project shell and the map leaves the view
   * mapped/unmapped, never unrooted; this flag is how the smoke driver
   * proves that across a round trip instead of trusting the claim.
   */
  sceneEditorRooted: boolean
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
  /**
   * How many of the four shell destinations resolved a roster chip.
   *
   * Must always equal 4 (World, Library, Game, Map — REDESIGN.md § 3.3).
   * An empty roster hides the chip, so a solo session cannot show the
   * difference between "nobody else is here" and "this view's template
   * has no chip" — which is how three of four views lost it. The static
   * guard (`check:mode-routes` check 12) proves the declarations exist;
   * this counts what the widget tree actually built.
   */
  rosterChipViews: number
  /** Live session participants (AI assistant + networked peers). */
  participants: CollaboratorEntry[]
  /** peerId of the participant the camera is following, or null. */
  followedPeerId: string | null
}

// The action projection behind Control lives in `services/action-inspector.ts`;
// re-exported so existing import sites keep working.
export type { ActionDescriptor }

/**
 * The slice of `Application` this window reads a `pixelrpg://join/…`
 * link from.
 *
 * Structural rather than an import of `Application`: the application
 * module imports this one, and the window only needs two methods. Every
 * call site duck-types before using it, so a window hosted by a plain
 * `Adw.Application` (Storybook, the action specs) simply has no links.
 */
interface JoinIntentSource {
  consumePendingIntent(): { kind: string; roomId: string } | null
  connect(signal: 'pixelrpg-intent', handler: (source: unknown, kind: string, roomId: string) => void): number
}

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
 * Hosts two nested stacks (REDESIGN.md § 3.2): a `Gtk.Stack` carrying
 * welcome / project shell / map editor, and inside the shell an
 * `Adw.ViewStack` carrying the three switcher destinations World, Library
 * and Game. Around them it composes the collaborators that do the actual
 * work:
 *
 * - {@link ViewRouter} — page switching across both stacks
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
export class ApplicationWindow extends Adw.ApplicationWindow implements EntityDeleteHost {
  declare _welcome_view: WelcomeView
  declare _atlas_view: AtlasView
  declare _library_view: LibraryView
  declare _scene_editor_view: SceneEditorView
  declare _game_view: GameView
  declare _root_stack: Gtk.Stack
  declare _shell_stack: Adw.ViewStack
  declare _toast_overlay: Adw.ToastOverlay
  declare _bottom_bar_stack: Gtk.Stack
  declare _phone_selection_bar: MapSelectionBar

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
   * A placement `win.focus-placement` must select once the engine for a
   * freshly opened map exists. Opening a map hydrates asynchronously, so
   * a selection written at activation time would land on no engine and
   * vanish; `SceneNavigator`'s `onEngineReady` drains this.
   */
  private _pendingPlacementFocus: string | null = null
  /**
   * The in-flight `maps-changed` reaction — loading an added map's file
   * and re-deriving the atlas world. `_createMap` chains its "and now
   * open it" onto this instead of the store event carrying a "this one
   * was mine" flag: the store broadcasts one vocabulary to every peer,
   * and only the peer that asked for the map wants to land on it.
   */
  private _mapsRefresh: Promise<void> = Promise.resolve()
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
  // Map-file persistence (serialise MapData → source JSON, atlas
  // editor-data writes). Injected accessors read this window's live state;
  // the op plumbing for editor-data changes stays here (collab is the
  // window's concern).
  private _mapPersistCtl = new MapPersistenceController({
    getMapResource: (mapId) => this._loadedProject?.resource.maps.get(mapId) ?? null,
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
    setCollaboratorsOnView: (participants, followedPeerId) => {
      for (const view of this._rosterViews()) view.setCollaborators(participants, followedPeerId)
      // The single funnel every roster change already goes through.
      // Together shows the same people plus where they are, and
      // presence changes are not session-state changes — without this
      // the open dialog would keep a peer's old map on screen.
      this._session.refreshTogether()
    },
    showToast: (message) => this._showToast(message),
  })
  private readonly _router = new ViewRouter({
    getRootStack: () => this._root_stack,
    getShellStack: () => this._shell_stack,
    getMode: () => (this._actions ? stringState(this._actions.mode) : null),
    // set_state (not change_state) so the change-state handler doesn't
    // re-enter: the view is already being set explicitly.
    setModeState: (mode) => this._actions?.mode.set_state(GLib.Variant.new_string(mode)),
    onLeaveSceneEditor: () => {
      this._engineCtl.dispose()
      // The engine is gone; a re-entry starts a fresh MapScene in editor
      // mode, so leaving "playing" set would cost an extra click.
      this._actions?.play.change_state(GLib.Variant.new_boolean(false))
    },
  })
  private readonly _scenes = new SceneNavigator({
    getProject: () => this._loadedProject,
    reportMapMissing: () => this._showToast(_('Map not found')),
    reportMapLoadFailed: () => this._showToast(_('Failed to load map')),
    showSceneEditorPage: () => this._router.setView('map'),
    setScene: (scene) => this._scene_editor_view.setScene(scene),
    followScene: (scene) => this._scene_editor_view.followScene(scene),
    ensureEngineForMap: (projectPath, sceneId) => this._engineCtl.ensureForMap(projectPath, sceneId),
    onEngineReady: () => {
      this._syncEngineUiState()
      this._session.attachEngineIfAwaiting()
      // A `win.focus-placement` that had to open the map first parked
      // its placement here, because the engine it needs comes up only
      // now (`SceneNavigator._hydrate`).
      const placementId = this._pendingPlacementFocus
      this._pendingPlacementFocus = null
      if (placementId) this._scene_editor_view.focusPlacement(placementId)
    },
    populateInspector: (project, sceneId) => this._scene_editor_view.populateFromProject(project, sceneId),
    refreshAtlasWorld: (project) =>
      this._atlas_view.setWorld(project.scenes, project.teleports, project.resource, project.projectPath),
  })
  /**
   * REDESIGN § 6.2's "Goes to" flow: the picker, the trip to the target
   * map in pick mode, the optional door back, the trip home and the
   * teleport write. The flow is a service so none of that sequencing
   * lives in this window; what stays here is the four things only the
   * window has — the dialog, the navigator, the live map data and the
   * toast surface.
   */
  private readonly _doorFlow = new DoorTargetFlow({
    readDoor: (placementId) => this._scene_editor_view.doorAt(placementId),
    currentMapId: () => this._scenes.currentSceneId,
    mapBounds: (mapId) => {
      const mapData = this._loadedProject?.resource.maps.get(mapId)?.mapData
      return mapData ? { columns: mapData.columns, rows: mapData.rows } : null
    },
    askForMap: (currentTargetMapId, onChoose) => {
      const project = this._loadedProject
      if (!project) return
      presentDoorTargetDialog(
        this,
        { maps: this._doorTargetOptions(), projectResource: project.resource, currentTargetMapId },
        onChoose,
      )
    },
    // `open` and not the engine's `map-loaded`: that event fires before
    // the inspector is populated, so a flow resuming on it would read
    // the map it just left.
    openMap: (mapId, onReady) => this._scenes.open(mapId, onReady),
    armPick: (request) => this._engineCtl.engine?.excalibur?.armArrivalPick(request),
    setPicking: (picking) => this._scene_editor_view.setPicking(picking),
    placeInline: (definition, tile) => this._scene_editor_view.placeInlineObject(definition, tile),
    pointDoor: (placementId, targetMapId, tile) => this._scene_editor_view.pointDoorAt(placementId, targetMapId, tile),
    reportCancelled: () => this._showToast(_('Left the door as it was')),
    reportTargetSet: (targetMapId) =>
      this._showToast(_('This door now leads to “%s”').replace('%s', this._mapNameOf(targetMapId))),
    reportDoorBackFailed: () => this._showToast(_('No room for a door back — place it by hand')),
    reportFailed: () => this._showToast(_('Could not set where this door leads')),
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
    getParticipants: () => this._collabPresenceCtl.getParticipants(),
    getPeerLocations: () => this._peerLocations(),
    getFollowedPeerId: () => this._collabPresenceCtl.followedPeerId,
    toggleFollow: (peerId) => this._collabPresenceCtl.onParticipantActivated(peerId),
    isAssistantPaused: () => this._assistantState.paused,
    // Through the action, not `_assistantState.setPaused`: the action's
    // `change-state` is what also tells the engine and the four roster
    // chips, so a direct write would pause the AI on Together's row and
    // nowhere else.
    setAssistantPaused: (paused) => this._actions?.assistantPaused.change_state(GLib.Variant.new_boolean(paused)),
    getIdentity: () => this._collabIdentity,
  })
  private readonly _projects = new ProjectLifecycle({
    getWindow: () => this,
    showToast: (message) => this._showToast(message),
    setProject: (project) => this._projectStore.setProject(project),
    adoptProject: (project) => {
      this._atlas_view.setWorld(project.scenes, project.teleports, project.resource, project.projectPath)
      this._scenes.setScenes(project.scenes)
      // A fresh project has no atlas selection yet, so this lands the
      // four selection-driven map verbs on insensitive.
      this._refreshMapActions()
    },
    // A fresh project starts on the card overview, not a stale detail page
    // left over from the previous one.
    resetViews: () => this._library_view.resetToOverview(),
    refreshRecentProjects: (recent) => this._welcome_view.setRecentProjects(recent),
    setShareEnabled: (enabled) => this._actions?.share.set_enabled(enabled),
    showAtlas: () => this._router.setView('world'),
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
          'root_stack',
          'shell_stack',
          'toast_overlay',
          'bottom_bar_stack',
          'phone_selection_bar',
        ],
        Properties: {
          // Single source of truth for inspector visibility. Each view's
          // own `show-inspector` is bound bidirectionally to this in the
          // constructor, so toggling the inspector in World keeps it
          // visible after navigating to the map editor (or vice-versa).
          // Before, each view held an independent state + had different
          // defaults, so a fresh sidebar would auto-open on view switch
          // every time.
          //
          // Defaults closed: the user opens what they want from the
          // floating toggles. Removing the auto-open avoids the "wait
          // why did the inspector appear" surprise the user flagged.
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
    private readonly _editorDefaults: EditorDefaultsService,
    private readonly _collabIdentity: CollabIdentityService,
  ) {
    super({ application })
    this._installActions()
    this._attachShellSwitchers()
    this._wireRosterFollow()
    this._shareSidebarState()
    this._shareFullView()
    this._wireCollabIdentity()
    this._wireJoinIntent()
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
        // The pick happens under the finger, nowhere near the badge; the
        // pop is the only thing that says where the tile went.
        this._scene_editor_view.popBrushBadge()
      },
      selectPlacement: (placementId) => {
        this._scene_editor_view.highlightPlacement(placementId)
        if (placementId) this._scene_editor_view.revealForSelection()
      },
      requestPlacementContext: (screenX, screenY) => this._scene_editor_view.showPlacementMenu(screenX, screenY),
      placementMoved: (placementId, moved) => {
        if (moved) this._scene_editor_view.placementMoved(placementId)
        // The only refusals are a padlocked layer, a tile off the map
        // and the tile it already sits on — all three are the user's
        // tap, not an error, so a toast is the whole response.
        else this._showToast(_('That one cannot move there.'))
      },
      arrivalPicked: (request) => this._doorFlow.arrivalPicked(request),
      setLayerFlag: (layerId, flag, value) => this._scene_editor_view.setLayerFlag(layerId, flag, value),
      refreshLayers: () => {
        const sceneId = this._scenes.currentSceneId
        const mapData = sceneId ? this._loadedProject?.resource.maps.get(sceneId)?.mapData : undefined
        if (mapData) this._scene_editor_view.refreshLayers(mapData)
      },
      // Only a run can switch maps behind the window's back; outside one
      // this event is the echo of a load the window itself started, and
      // following it would re-populate the inspector for no reason.
      mapLoaded: (mapId) => {
        if (this._engineCtl.engine?.isRuntimeMode()) this._scenes.followEngineMap(mapId)
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
      // "Show walls" reads the same descriptors the colliders are built
      // from, so it has to follow the same event — otherwise the Brush
      // sheet keeps hatching the walls as they were before the edit.
      this._scene_editor_view.refreshTileCollision(
        spriteSetId,
        this._projectStore.resource?.spriteSets.get(spriteSetId)?.data?.sprites,
      )
    })
    // An inbound `__project/map.editor-data` patched a map (the store
    // applied it in memory) — persist that map file here (this window
    // owns map IO) and reposition its atlas card.
    this._projectStore.on('map-editor-data-changed', ({ mapId }) => {
      this._mapPersistCtl.persistMap(mapId, _('Could not save map position'))
      this._scenes.refreshAtlasPosition(mapId)
    })
    // The map LIST changed — locally or from a peer. The store owns the
    // files and `game-project.json`; bringing the new map into the live
    // resource and re-deriving the atlas world is window work.
    this._projectStore.on('maps-changed', (change) => {
      this._mapsRefresh = this._applyMapsChanged(change)
      void this._mapsRefresh
    })
  }

  /**
   * Re-sync the live project with a map list the store just changed:
   * load an added map's file, drop a removed map's selection, rebuild the
   * atlas world and re-check the map verbs.
   *
   * Kept as the awaitable {@link _mapsRefresh} so `_createMap` can open
   * the map it asked for only once the navigator knows about it.
   */
  private async _applyMapsChanged(change: { added?: string; removed?: string }): Promise<void> {
    const project = this._loadedProject
    if (!project) return
    if (change.added) {
      try {
        await project.resource.loadMap(change.added)
      } catch (error) {
        console.warn('[ApplicationWindow] Failed to load the new map:', error)
        this._showToast(_('Failed to load map'))
      }
    }
    if (change.removed && this._scenes.selectedAtlasSceneId === change.removed) {
      this._scenes.selectedAtlasSceneId = null
    }
    const world = buildAtlasWorld(project.resource)
    project.scenes = world.scenes
    project.teleports = world.teleports
    this._scenes.setScenes(world.scenes)
    this._atlas_view.setWorld(world.scenes, world.teleports, project.resource, project.projectPath)
    this._refreshMapActions()
  }

  vfunc_map(): void {
    super.vfunc_map()

    this.signals.connect(this._welcome_view, 'create-project', () => this._projects.create())
    this.signals.connect(this._welcome_view, 'open-project', () => this._projects.openFromDialog())
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
      this._refreshMapActions()
    })
    this.signals.connect(this._atlas_view, 'scene-moved', (_v: AtlasView, id: string, x: number, y: number) => {
      this._mapPersistCtl.persistAtlasPosition(id, x, y)
    })
    this.signals.connect(
      this._atlas_view,
      'door-retargeted',
      (_v: AtlasView, mapId: string, placementId: string, targetMapId: string, tileX: number, tileY: number) => {
        this._retargetDoor(mapId, placementId, targetMapId, { x: tileX, y: tileY })
      },
    )
    // The header switchers and the bottom switcher bar all drive
    // `shell_stack` directly, so the stack — not a per-view signal — is
    // where a destination change becomes observable. Mirror it into
    // `win.mode` with `set_state`, not `change_state`: the page is
    // already showing, and re-entering the change-state handler would
    // route back into the router for no reason.
    this.signals.connect(this._shell_stack, 'notify::visible-child-name', () => {
      this._dropFocus()
      const page = this._shell_stack.get_visible_child_name()
      if (page && this._actions && stringState(this._actions.mode) !== page) {
        this._actions.mode.set_state(GLib.Variant.new_string(page))
      }
      this._refreshBottomBar()
    })
    // Phone: the selection bar and the view switcher share the bottom
    // slot, so leaving phone width has to hand it back.
    this.signals.connect(this._atlas_view, 'notify::compact', () => this._refreshBottomBar())
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

    // A placement was removed via the Selected page — refresh the inspector's
    // placement list (the command already mutated the live MapData) and
    // persist, mirroring the layer-flag flow.
    this.signals.connect(this._scene_editor_view, 'object-removed', () => {
      const sceneId = this._scenes.currentSceneId
      if (this._loadedProject && sceneId) {
        void this._scene_editor_view.populateFromProject(this._loadedProject, sceneId)
      }
      this._mapPersistCtl.persistCurrentMap()
    })

    // A layer was deleted from its row menu. Scene state, so Undo is the
    // regular undo stack (the library's deletes restore a snapshot).
    this.signals.connect(this._scene_editor_view, 'layer-deleted', (_v: unknown, name: string) => {
      this._showUndoToast(_('Deleted “%s”').replace('%s', name), () => this.activate_action('win.undo', null))
    })

    // The § 6.2 flow's two window-bound ends: the question (from the
    // action, the canvas menu or the Selected page's row) and the pick
    // banner's Cancel.
    this.signals.connect(this._scene_editor_view, 'door-target-requested', (_v: unknown, placementId: string) => {
      this._doorFlow.start(placementId)
    })
    this.signals.connect(this._scene_editor_view, 'pick-cancelled', () => this._doorFlow.cancel())

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
    this.signals.connect(this._root_stack, 'notify::visible-child-name', () => {
      this._dropFocus()
      this._refreshSessionBrowsing()
    })
    // One idle later, so the window finishes mapping before a dialog
    // goes up over it. One-shot: `consumePendingIntent` clears, so a
    // remap does not re-join.
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this._consumeJoinIntent()
      return GLib.SOURCE_REMOVE
    })
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    this._session.stop()
    this._session.release()
    super.vfunc_unmap()
  }

  /**
   * Drop the keyboard focus whenever the shown view changes.
   *
   * `gtk_stack_set_visible_child_internal` calls `gtk_widget_child_focus(
   * page, GTK_DIR_TAB_FORWARD)` when the focus was inside the stack it is
   * switching, so the incoming page's first focusable widget grabs it. On
   * the Game view that is the Name `Adw.EntryRow`, which then shows its
   * text selected and lights its apply button as if the user had started
   * typing — one stray keystroke renames the project. Switching views is
   * navigation, not an edit, so nothing should own the focus afterwards.
   */
  private _dropFocus(): void {
    this.set_focus(null)
  }

  /**
   * Per-mode lenses over the shared store. Cross-lens refreshes ride the
   * store's typed events (each lens subscribes itself); this window only
   * wires the pieces that need window-owned resources (dialogs, navigation).
   */
  private _ensureControllers(): void {
    const library = this._library_view
    if (!this._castCtl) this._castCtl = new CastController(library.castView, this._projectStore, this)
    if (!this._tilesCtl && this._castCtl) {
      // Sprite-set CRUD + tile properties delegate to the store (the
      // single descriptor write + collab-broadcast path); appearance /
      // animation edits route through the cast controller's methods.
      this._tilesCtl = new TilesController(library.tilesView, this._projectStore, this._castCtl)
    }
    if (!this._gameCtl) this._gameCtl = new GameController(this._game_view, this._projectStore)
    if (!this._objectsCtl) this._objectsCtl = new ObjectsController(library.objectsView, this._projectStore, this)
  }

  /**
   * Bidirectionally bind this window's `show-inspector` to every view
   * that owns an inspector drawer. Effect: the inspector retains its
   * state across view switches — opening it in World keeps it open after
   * navigating to the map editor, and closing it stays closed when the
   * user goes back.
   *
   * Library and Game are deliberately NOT bound: their detail panes are
   * master-detail splits, not inspector drawers.
   *
   * Welcome is deliberately NOT bound either: its recents column is part
   * of the home layout (visible by default, inlined below the hero on
   * phone), not a project inspector — sharing state would hide it
   * whenever the user last closed an editor inspector.
   */
  private _shareSidebarState(): void {
    const flags = GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
    for (const view of [this._atlas_view, this._scene_editor_view]) {
      this.bind_property('show-inspector', view, 'show-inspector', flags)
    }
  }

  /**
   * Point every shell page's `Adw.ViewSwitcher` at the shell stack.
   *
   * The switchers live inside the pages they switch between, so the
   * stack cannot be referenced from their own Blueprint — `shell_stack`
   * is a sibling in the window template, not an ancestor of the view.
   * Wiring it here keeps the pages reusable in Storybook (no switcher
   * target = the switcher just renders inert) and avoids a ParamSpec
   * whose only purpose is to relay one object reference.
   */
  private _attachShellSwitchers(): void {
    for (const view of [this._atlas_view, this._library_view, this._game_view]) {
      view.attachShellSwitcher(this._shell_stack)
    }
    // Same reason as the switchers: the bar lives in this template
    // because it has to share the one bottom slot with the view
    // switcher, but only `AtlasView` knows what is selected.
    this._atlas_view.attachSelectionBar(this._phone_selection_bar)
  }

  /**
   * Phone only: swap the single bottom slot between the shell's view
   * switcher and the selected map's selection bar. Everywhere else the
   * atlas shows its own overlay instance and this stays on `nav`.
   */
  private _refreshBottomBar(): void {
    const selecting =
      this._atlas_view.compact && this._router.currentView === 'world' && this._scenes.selectedAtlasSceneId != null
    this._bottom_bar_stack.set_visible_child_name(selecting ? 'selection' : 'nav')
  }

  /**
   * Every view that shows a roster chip. People are present on all four
   * destinations (REDESIGN.md § 3.3) because a session does not pause
   * when the user steps out of the map editor to rename a character —
   * the chip went missing on three of four views, so "who else is here"
   * was only answerable from the canvas.
   */
  private _rosterViews(): ResponsiveEditorView[] {
    return [this._atlas_view, this._library_view, this._game_view, this._scene_editor_view]
  }

  /**
   * Route every chip's Follow click into the presence controller.
   *
   * Wired from the constructor, NOT from `_wireViewSignals`: that runs
   * on every `vfunc_map` under a `SignalScope`, so a remap would stack a
   * second handler per chip. These four chips live as long as the window.
   */
  private _wireRosterFollow(): void {
    for (const view of this._rosterViews()) {
      view.onParticipantActivated((peerId) => this._collabPresenceCtl.onParticipantActivated(peerId))
    }
  }

  /**
   * A `pixelrpg://join/<code>` link, from this launch or from a later
   * one re-dispatched into the running instance.
   *
   * Following the link IS the consent — there is no "someone wants you
   * to join, is that ok?" step — so this opens Together and joins, and
   * the dialog shows the handshake. The pending intent is consumed on
   * map rather than here: at construction time the window has nothing
   * to present a dialog over.
   *
   * Wired from the constructor like the roster chips: the application
   * outlives any single `vfunc_map`, so connecting under the window's
   * `SignalScope` would stack a handler per remap.
   */
  private _wireJoinIntent(): void {
    const app = this.application as unknown as JoinIntentSource | null
    if (typeof app?.connect !== 'function') return
    app.connect('pixelrpg-intent', (_app: unknown, kind: string, roomId: string) => {
      if (kind === 'join' && roomId) this._session.presentTogetherForJoin(roomId)
    })
  }

  /** Act on a link that arrived before this window could present anything. */
  private _consumeJoinIntent(): void {
    const app = this.application as unknown as JoinIntentSource | null
    if (typeof app?.consumePendingIntent !== 'function') return
    const intent = app.consumePendingIntent()
    if (intent?.kind === 'join' && intent.roomId) this._session.presentTogetherForJoin(intent.roomId)
  }

  /**
   * Re-announce when the user renames or recolours themselves in
   * Preferences, so a session that is already running picks the change
   * up instead of waiting for the next one.
   *
   * Wired from the constructor for the same reason as the roster chips:
   * the identity service outlives any single `vfunc_map`, so a remap
   * under the window's `SignalScope` would stack a second handler.
   */
  private _wireCollabIdentity(): void {
    for (const property of ['display-name', 'colour'] as const) {
      this._collabIdentity.connect(`notify::${property}`, () => this._session.refreshLocalIdentity())
    }
    // Preferences › Together › "AI collaborator" and the live pause are
    // two views of one value: the preference seeds the action at
    // startup, the action writes the preference back on every toggle.
    // Three controls (Preferences, Together, the primary menu) that
    // each kept their own copy is how two of them end up lying.
    this._applyAssistantPreference()
    this._collabIdentity.connect('notify::assistant-enabled', () => this._applyAssistantPreference())
  }

  private _applyAssistantPreference(): void {
    this._actions?.assistantPaused.change_state(GLib.Variant.new_boolean(!this._collabIdentity.assistantEnabled))
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
      leaveMap: () => this._leaveMap(),
      focusPlacement: (mapId, placementId) => this._focusPlacement(mapId, placementId),
      showFullView: () => this._revealFullView(),
      showShortcuts: () => presentShortcutsDialog(this),
    })

    installProjectActions(group, {
      openProject: () => this._projects.openFromDialog(),
      presentRecentProjects: () => this._presentRecentProjects(),
      closeProject: () => void this._projects.close(),
      enableGameSystem: (id) => this._projectStore.setGameSystemEnabled(id, true),
    })

    installZoomActions(group, {
      targetsAtlas: () => this._router.currentView === 'world',
      stepAtlasZoom: (delta) => this._atlas_view.stepZoom(delta),
      resetAtlasZoom: () => this._atlas_view.resetZoom(),
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
      revealInspector: () => this._scene_editor_view.revealForSelection(),
      // The view decides where "Selected" lives — phone sheet or wide
      // inspector — so naming the page is enough; revealing the drawer
      // by hand here would fight the sheet on phone.
      editPlacement: () => this._scene_editor_view.showSheetPage('selected'),
      copyPlacement: () => this._scene_editor_view.copySelectedPlacement(),
      movePlacement: () => this._scene_editor_view.armPlacementMove(),
      deletePlacement: () => this._scene_editor_view.deleteSelectedPlacement(),
      // Through the view's signal rather than straight into the flow:
      // the action, the canvas menu and the Selected page's row then
      // all arrive by one road, and only the view knows what is
      // selected.
      doorTarget: () => this._scene_editor_view.requestDoorTargetForSelection(),
      undo: () => this._engineCtl.engine?.undo(),
      redo: () => this._engineCtl.engine?.redo(),
      createLayer: (plane) => this._createLayer(plane),
    })

    const { objects, grid, transparency, walls } = installInspectorActions(group, {
      sidebarOwner: this,
      // Read once, here: the grid is a per-session toggle the user flips
      // constantly, so the preference seeds it and never tracks it. No
      // engine exists yet — `syncEngineState` pushes the action's state
      // into every engine it builds (`RESYNCED_WIN_ACTIONS`).
      showGridDefault: this._editorDefaults.showGrid,
      showSheetPage: (name) => this._scene_editor_view.showSheetPage(name),
      setEngineObjectsVisible: (visible) => this._engineCtl.engine?.setObjectsVisible(visible),
      setEngineShowGrid: (showGrid) => this._engineCtl.engine?.setShowGrid(showGrid),
      setEngineDimInactiveLayers: (dim) => this._engineCtl.engine?.setDimInactiveLayers(dim),
      setEngineShowWalls: (showWalls) => this._engineCtl.engine?.setShowWalls(showWalls),
    })

    const { performBack } = installBackActions(group, {
      backState: () => ({
        running: this._actions?.play.get_state()?.get_boolean() ?? false,
        inMap: this._router.currentView === 'map',
        sheetOpen: this._scene_editor_view.sheetOpen,
        hasSelection: this._scene_editor_view.hasSelection(),
        pushedPage: this._router.currentView === 'library' && this._library_view.hasPushedPage(),
      }),
      stopRun: () => this._actions?.play.change_state(GLib.Variant.new_boolean(false)),
      collapseSheet: () => void this._scene_editor_view.collapseSheet(),
      clearSelection: () => void this._scene_editor_view.clearSelection(),
      popPage: () => void this._library_view.popPage(),
      leaveMap: () => this._leaveMap(),
    })

    const { play } = installPlaytestActions(group, {
      persistCurrentMap: () => this._mapPersistCtl.persistCurrentMap(),
      setRuntimeMode: (playing) => this._engineCtl.engine?.setRuntimeMode(playing),
      setViewPlaying: (playing) => this._scene_editor_view.setPlaying(playing),
      clearSaveState: () => this._engineCtl.engine?.clearSaveState(),
      applyPlayZoom: () => void this._engineCtl.engine?.applyPlayZoom(),
    })

    const { share, assistantPaused } = installSessionActions(group, {
      presentShareDialog: () => this._session.presentTogether(),
      setAssistantPaused: (paused) => {
        this._assistantState.setPaused(paused)
        // Persist, so the Preferences row, Together's switch and the
        // primary menu never disagree, and so the choice survives a
        // restart. Writing an unchanged value is a no-op upstream, which
        // is what stops this and `_applyAssistantPreference` from
        // bouncing off each other.
        this._collabIdentity.assistantEnabled = !paused
      },
      setEngineAssistantPaused: (paused) => this._engineCtl.engine?.excalibur?.setAssistantPaused(paused),
      setViewAssistantPaused: (paused) => {
        for (const view of this._rosterViews()) view.setAssistantPaused(paused)
      },
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
      deleteCharacter: (id) => library.castView.deleteCharacter(id),
    })

    installTileActions(group, {
      hasProject,
      showToast,
      showGraphics: () => this._showLibrary('graphics'),
      presentAppearanceImport: () => library.tilesView.presentAppearanceImportDialog(),
      presentTilesetImport: () => library.tilesView.presentTilesetImportDialog(),
      focusTileset: (id) => library.tilesView.focusTileset(id),
      focusAppearance: (id) => library.tilesView.focusAppearance(id),
      selectTileset: (spriteSetId) => this._selectTileset(spriteSetId),
    })

    installObjectActions(group, {
      hasProject,
      showToast,
      showThings: () => this._showLibrary('things'),
      presentNewThing: () => library.objectsView.presentNewThing(),
      createFromTemplate: (templateId) => this._objectsCtl?.createFromTemplate(templateId),
      focusObject: (id) => library.objectsView.focusObject(id),
      toggleCastMember: (id) => this._objectsCtl?.toggleCastMember(id),
      deleteThing: (id) => library.objectsView.deleteThing(id),
      currentSceneId: () => this._scenes.currentSceneId,
      openScene: (sceneId) => this._scenes.open(sceneId),
      armObjectBrush: (defId) => this.activate_action('win.set-object-brush', GLib.Variant.new_string(defId)),
    })

    const { renameMap, duplicateMap, deleteMap, startMap, mapSettings } = installMapActions(group, {
      hasProject,
      showToast,
      presentNewMap: () => this._presentNewMap(),
      presentRenameMap: () => this._presentRenameMap(),
      presentDuplicateMap: () => this._presentDuplicateMap(),
      confirmDeleteMap: () => this._confirmDeleteMap(),
      startHere: () => this._startMapHere(),
      presentMapSettings: () => this._presentMapSettings(),
      setListMode: (on) => this._atlas_view.setListMode(on),
    })

    installConnectionActions(group, {
      openMap: (mapId, then) => this._scenes.open(mapId, then),
      clearDoorTarget: (placementId) => this._scene_editor_view.clearDoorTargetAt(placementId),
      askWhereDoorGoes: (placementId) => this._doorFlow.start(placementId),
      showToast,
    })

    installWindowAccels(this.get_application())
    this._installBackGestures(performBack)

    this.insert_action_group('win', group)
    this._winActions = group
    this._actions = {
      mode,
      libraryChip,
      tool,
      play,
      objects,
      grid,
      transparency,
      walls,
      share,
      assistantPaused,
      undo,
      redo,
      renameMap,
      duplicateMap,
      deleteMap,
      startMap,
      mapSettings,
    }
  }

  // ────────────────────────────────────────────────────────────
  // Map verbs (REDESIGN.md § 6.1)
  // ────────────────────────────────────────────────────────────

  /** The atlas card the map verbs act on, or `null` with none selected. */
  private _selectedScene(): { id: string; name: string } | null {
    const id = this._scenes.selectedAtlasSceneId
    if (!id) return null
    const scene = this._scenes.getScene(id)
    return scene ? { id: scene.id, name: scene.name } : null
  }

  /**
   * Keep the five selection-driven map verbs honest: a verb with no
   * target is insensitive, not a toast after the fact. Delete also needs
   * a second map to fall back to (`ProjectStore.removeMap` refuses the
   * last one) and Start the game here is pointless on the map that
   * already starts it.
   */
  private _refreshMapActions(): void {
    // Every selection change and every map add/remove comes through
    // here, which makes it the one place the phone bottom bar has to
    // re-decide which of its two pages is right.
    this._refreshBottomBar()
    const actions = this._actions
    if (!actions) return
    const selected = this._selectedScene()
    actions.renameMap.set_enabled(selected != null)
    actions.duplicateMap.set_enabled(selected != null)
    actions.deleteMap.set_enabled(selected != null && this._scenes.scenes.length > 1)
    actions.startMap.set_enabled(selected != null && this._projectStore.startMapId() !== selected.id)
    actions.mapSettings.set_enabled(selected != null)
  }

  /** `win.new-map` — the atlas FAB. */
  private _presentNewMap(): void {
    presentNewMapDialog(
      this,
      {
        suggestedName: this._projectStore.suggestMapName(_('Map %d')),
        // The Custom size rows are a Full-view affordance: three named
        // presets are the whole choice a child has to make.
        fullView: this._fullView,
      },
      (request) => this._createMap(request.name, request.size),
    )
  }

  /**
   * Create the map and open it — § 6.1 wants the new map on screen, and
   * a blank map is useless to look at from across the atlas.
   *
   * The open has to wait for the `maps-changed` handler to have loaded
   * the file into the live resource and told the navigator about the new
   * scene; `_mapsRefresh` is that in-flight work.
   */
  private _createMap(name: string, size: MapSize): void {
    // The first layer is named in the window, not the store: the store is
    // UI-free and this string is user-visible.
    const id = this._projectStore.createMap(name, size, _('Ground'))
    if (!id) return
    void this._mapsRefresh.then(() => this._scenes.open(id))
  }

  /** `win.rename-map` — a dialog, see TODO.md for why not inline. */
  private _presentRenameMap(): void {
    const selected = this._selectedScene()
    if (!selected) return
    void promptRename(this, { heading: _('Rename map'), current: selected.name }).then((name) => {
      if (name) this._projectStore.renameMap(selected.id, name)
    })
  }

  /**
   * `win.duplicate-map` — asks for the copy's name, pre-filled with
   * `Copy of <name>`. Deliberately does NOT open the duplicate: the user
   * asked for a copy of the map they are looking at, and jumping into the
   * copy would lose that place.
   */
  private _presentDuplicateMap(): void {
    const selected = this._selectedScene()
    if (!selected) return
    const suggested = this._projectStore.suggestDuplicateName(selected.id, _('Copy of %s'))
    void promptRename(this, {
      heading: _('Duplicate map'),
      current: suggested,
      confirmLabel: _('Duplicate'),
    }).then((name) => {
      if (name) this._projectStore.duplicateMap(selected.id, name)
    })
  }

  /** `win.delete-map` — confirmation names how many doors break. */
  private _confirmDeleteMap(): void {
    const selected = this._selectedScene()
    if (!selected) return
    confirmMapDelete(this, { name: selected.name, doorsInto: this._projectStore.doorsInto(selected.id) }, () => {
      this._projectStore.removeMap(selected.id)
    })
  }

  /** `win.start-map` — point `startup.initialMapId` at the selection. */
  private _startMapHere(): void {
    const selected = this._selectedScene()
    if (!selected) return
    if (this._projectStore.setStartMap(selected.id)) {
      this._showToast(_('The game now starts on “%s”').replace('%s', selected.name))
    }
  }

  /**
   * `win.map-settings` — the facts about the selected map, with its name
   * editable. The counts come from the same `mapSelectionFacts` the
   * selection bar's caption uses, so the bar and the dialog can never
   * disagree; the tile size is the only value that has to be read off
   * the map resource, the atlas cards do not carry it.
   */
  private _presentMapSettings(): void {
    const selected = this._selectedScene()
    const project = this._loadedProject
    if (!selected || !project) return
    const scene = this._scenes.getScene(selected.id)
    if (!scene) return
    const mapData = project.resource.maps.get(selected.id)?.mapData
    const facts = mapSelectionFacts(scene, project.teleports)
    presentMapSettingsDialog(
      this,
      {
        name: selected.name,
        columns: facts.cols,
        rows: facts.rows,
        tileWidth: mapData?.tileWidth ?? 0,
        tileHeight: mapData?.tileHeight ?? 0,
        things: facts.things,
        doors: teleportSummaries(scene, project.scenes, project.teleports),
      },
      (name) => this._projectStore.renameMap(selected.id, name),
    )
  }

  /**
   * Every map the door could lead to, for the § 6.2 picker.
   *
   * The subtitles are the SAME caption the atlas list mode puts under a
   * map card (`mapCaption` over `mapSelectionFacts`), including the
   * things count when the Library is in full view — two lists of the
   * same maps that described them differently would read as two
   * different sets of maps.
   *
   * The door's own map is included: a staircase between two floors
   * authored as one map is a door to itself.
   */
  private _doorTargetOptions(): DoorTargetMapOption[] {
    const project = this._loadedProject
    if (!project) return []
    return project.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      subtitle: mapCaption(mapSelectionFacts(scene, project.teleports), { things: this._fullView }),
    }))
  }

  /** A map's display name for a sentence about it, falling back to its id. */
  private _mapNameOf(mapId: string): string {
    return this._scenes.getScene(mapId)?.name ?? mapId
  }

  /**
   * Where everyone is, as map names (REDESIGN.md § 4.7's "Link's Tree
   * House" on each Together row).
   *
   * `AwarenessCursor.sceneId` is the only location on the wire, so a
   * peer who has not moved their pointer since joining has no entry and
   * Together leaves their row's subtitle empty rather than guessing. Our
   * own row reads the open map directly — we never send ourselves an
   * awareness frame.
   */
  private _peerLocations(): ReadonlyMap<string, string> {
    const locations = new Map<string, string>()
    const ownSceneId = this._scenes.currentSceneId
    if (ownSceneId) locations.set(this._session.selfPeerId, this._mapNameOf(ownSceneId))
    for (const peer of this._session.activeCollab()?.awareness.getPeers() ?? []) {
      const sceneId = peer.cursor?.sceneId
      if (sceneId) locations.set(peer.peerId, this._mapNameOf(sceneId))
    }
    return locations
  }

  /**
   * The write behind the atlas's drag-to-connect (REDESIGN.md § 6.2's
   * expert path): the door `placementId` on `mapId` now leads to
   * `tile` of `targetMapId`.
   *
   * Opens the DOOR's map first and leaves the user there, for the same
   * reason the connection verbs do: the edit is a command on that map's
   * own undo stack, and dropping the user back on the atlas would park
   * an undo entry on a stack they are not looking at.
   *
   * No door back is placed. The picker flow offers one because it has
   * already asked the person two questions and can ask a third; a drag
   * is one gesture meaning one arrow, and quietly writing a second
   * placement onto the target map would be an edit nobody asked for.
   * The way back is a drag from the other side.
   */
  private _retargetDoor(mapId: string, placementId: string, targetMapId: string, tile: Tile): void {
    this._scenes.open(mapId, () => {
      if (this._scene_editor_view.pointDoorAt(placementId, targetMapId, tile)) {
        this._showToast(_('This door now leads to “%s”').replace('%s', this._mapNameOf(targetMapId)))
      } else {
        this._showToast(_('Could not set where this door leads'))
      }
    })
  }

  /**
   * Back to World from the map editor, with the atlas on the map just
   * left (REDESIGN.md § 3.4 step 5). Both gestures route here —
   * `win.back-to-atlas` (the editor's own back buttons, the MCP bridge,
   * `scripts/smoke/drive.py`) and `win.back` — so the header button and
   * `Esc` cannot land in different places.
   *
   * Centring only, no zoom: the atlas is a `Gtk.Fixed` surface whose
   * zoom is the card-preview scale the user chose, not a camera.
   */
  private _leaveMap(): void {
    // Leaving the map editor ends any pick in flight. The engine's half
    // of the arming dies with the scene, but the chrome's does not — so
    // without this, the next map opened would come up wearing the pick
    // banner and nothing would be listening for the tap.
    this._doorFlow.abandon()
    const sceneId = this._scenes.currentSceneId
    this._router.setView('world')
    if (sceneId) this._atlas_view.focusScene(sceneId)
  }

  /**
   * `win.focus-placement(mapId, placementId)` — land on one object in
   * one map (REDESIGN.md § 3.4).
   *
   * Always parked and drained through `onEngineReady`, never applied
   * straight away, even when `mapId` is the map already on screen. A
   * selection is session state on the ACTIVE SCENE, so one written while
   * that scene is still loading lands on the scene the load is about to
   * replace and disappears with it — no error, no warning, a deep link
   * that selects nothing. Being the current map says nothing about being
   * settled, and this action's callers are exactly the ones that arrive
   * early: a `pixelrpg://` link during startup, an agent calling
   * `focus_placement` straight after opening the project.
   *
   * `SceneNavigator.open` re-hydrates and re-fires `onEngineReady` even
   * for the map already open, so the parked id costs one inspector
   * repopulate and is drained in both cases.
   */
  private _focusPlacement(mapId: string, placementId: string): void {
    this._pendingPlacementFocus = placementId
    this._scenes.open(mapId)
  }

  /**
   * The back gestures that are not buttons: `Esc`, `Alt+←` and the mouse
   * back button (button 8).
   *
   * Both controllers sit in the BUBBLE phase, so the focused widget is
   * asked first. That is the whole reason these keys are not in
   * `WINDOW_ACCELS`: a `Gtk.Application` accel fires in the capture
   * phase, and a global `Esc` would stop every popover from closing and
   * every entry from being abandoned. The shortcut handler returns
   * whether a back actually happened, so an `Esc` with nothing to undo
   * travels on to the shell instead of being swallowed here.
   */
  private _installBackGestures(performBack: () => BackStep): void {
    const handlers: Record<string, () => boolean> = {
      'win.back': () => performBack() !== 'none',
    }

    const shortcuts = new Gtk.ShortcutController()
    shortcuts.set_propagation_phase(Gtk.PropagationPhase.BUBBLE)
    for (const [action, keys] of WINDOW_SHORTCUTS) {
      const handler = handlers[action]
      if (!handler) {
        console.warn(`[ApplicationWindow] no handler for the window shortcut "${action}"; its keys are dead`)
        continue
      }
      for (const key of keys) {
        const trigger = Gtk.ShortcutTrigger.parse_string(key)
        if (!trigger) {
          console.warn(`[ApplicationWindow] "${key}" is not a parseable accelerator`)
          continue
        }
        shortcuts.add_shortcut(new Gtk.Shortcut({ trigger, action: Gtk.CallbackAction.new(() => handler()) }))
      }
    }
    this.add_controller(shortcuts)

    // The mouse back button is a button press, not an accelerator, so it
    // needs its own gesture. `button: 8` is X11/Wayland's "back"; GTK has
    // no named constant for it.
    const mouseBack = new Gtk.GestureClick()
    mouseBack.set_button(8)
    mouseBack.set_propagation_phase(Gtk.PropagationPhase.BUBBLE)
    mouseBack.connect('pressed', () => void performBack())
    this.add_controller(mouseBack)
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
   * `win.select-tileset(s)` — paint from another of the active scene's
   * tilesets, as picked by a Brush-page chip. The window resolves the
   * set's `firstGid` here because the sprite-set references hang off the
   * project, which the scene view deliberately does not hold.
   */
  private _selectTileset(spriteSetId: string): void {
    const project = this._loadedProject
    const sceneId = this._scenes.currentSceneId
    if (!project || !sceneId) return
    const refs = project.resource.maps.get(sceneId)?.mapData?.spriteSets ?? []
    const ref = refs.find((r) => r.id === spriteSetId)
    void this._scene_editor_view.loadTileset(project, spriteSetId, ref?.firstGid ?? 1)
  }

  /**
   * `win.new-layer(plane)` — append a fresh empty layer to the active
   * scene's map through the engine's undoable + collab-synced
   * `AddLayerCommand`. The command's `LAYER_LIST_CHANGED` re-reads the
   * Layers page; this only selects the new layer and persists. The
   * engine mutates the shared project `MapResource`, so both see the
   * new layer.
   *
   * A named plane comes from a section's own "Add a layer" row; the
   * empty string is Simple view's single row, which has no section to
   * name and so adds where the user is painting — the active layer's
   * plane.
   */
  private _createLayer(plane: string): void {
    const sceneId = this._scenes.currentSceneId
    if (!sceneId) return
    const layers = this._loadedProject?.resource.maps.get(sceneId)?.mapData?.layers
    if (!layers) return
    const activeId = this._scene_editor_view.activeLayerId
    const active = activeId ? layers.find((l) => l.id === activeId) : undefined
    const layer = nextLayerDraft(layers, isLayerPlane(plane) ? plane : active?.plane)
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
      showWalls: booleanState(actions.walls, false),
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
      case 'map-save-failed':
        return _('Could not save the map')
      case 'sprite-set-imported':
        return _('Imported sprite set “%s”').replace('%s', notice.name)
    }
  }

  private _showToast(message: string): void {
    this._toast_overlay.add_toast(new Adw.Toast({ title: message, timeout: 3 }))
  }

  /**
   * A "Deleted “x”" toast whose Undo button runs `undo`. The destructive
   * flows in the redesign ask nothing first and answer afterwards, so this
   * toast IS the confirmation — and the window owns the toast surface.
   */
  private _showUndoToast(message: string, undo: () => void): void {
    const toast = new Adw.Toast({ title: message, buttonLabel: _('Undo') })
    toast.connect('button-clicked', undo)
    this._toast_overlay.add_toast(toast)
  }

  /**
   * {@link EntityDeleteHost} — a character or thing left the library.
   * Undo re-upserts the snapshot the controller captured.
   */
  reportEntityDeleted(name: string, undo: () => void): void {
    this._showUndoToast(_('Deleted “%s”').replace('%s', name), undo)
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
      sceneEditorRooted:
        this._scene_editor_view.get_parent() === this._root_stack &&
        (this._scene_editor_view.get_root() as unknown as ApplicationWindow) === this,
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
      rosterChipViews: this._rosterViews().filter((view) => view.hasRosterChip()).length,
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
   * Paint a terrain brush programmatically (Control → MCP). Same
   * semantics + attribution as {@link paintTile}, but the brush is
   * addressed as `(spriteSetId, terrainId)` and the edit also reshapes
   * the neighbouring cells, as one command. Returns `false` if it
   * couldn't be applied.
   */
  paintTerrain(
    layerId: string | null,
    tileX: number,
    tileY: number,
    spriteSetId: string,
    terrainId: string,
    origin?: string,
  ): boolean {
    return (
      this._engineCtl.engine?.excalibur?.paintTerrainAt(layerId, tileX, tileY, spriteSetId, terrainId, origin) ?? false
    )
  }

  /**
   * Place a library object on the active map programmatically (Control →
   * MCP). `layerId` null = active layer. Goes through the engine command
   * path (undo + collab). `origin` — initiating actor id for peer-side
   * attribution (see {@link paintTile}). Returns the new placement's id,
   * or `null` if it couldn't be applied.
   */
  placeObject(defId: string, layerId: string | null, tileX: number, tileY: number, origin?: string): string | null {
    return this._engineCtl.engine?.excalibur?.placeObjectAt(defId, layerId, tileX, tileY, origin) ?? null
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

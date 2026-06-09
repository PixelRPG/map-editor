import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import {
  ASSISTANT_PEER_ID,
  type AwarenessPeerState,
  type EditorTool,
  getComponentData,
  isCharacterEntity,
  MapFormat,
  type SpriteSetKind,
} from '@pixelrpg/engine'
import {
  type CollaboratorEntry,
  type EditorMode,
  type SampleScene,
  SignalScope,
  SpriteSetImportDialog,
  type SpriteSetImportResult,
} from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import { CastController } from '../services/cast-controller.ts'
import { DataController } from '../services/data-controller.ts'
import { EngineController } from '../services/engine-controller.ts'
import { writeTextFile } from '../services/file-io.ts'
import type { DiscoveredService } from '../services/lan-discovery-parse.ts'
import { LanSessionBackend } from '../services/lan-session-backend.ts'
import { buildPixelrpgJoinUrl } from '../services/pixelrpg-url.ts'
import { type LoadedProject, loadProjectAsAtlas } from '../services/project-loader.ts'
import { loadRecentProjects, recordRecentProject } from '../services/recent-projects.ts'
import { captureWidgetPng } from '../services/screenshot.ts'
import { generatePeerId, SessionService, type SessionState } from '../services/session-service.ts'
import { findBlankTemplate, findTemplateById } from '../services/templates.ts'
import { TilesController } from '../services/tiles-controller.ts'
import Template from './application-window.blp'
import type { AtlasView } from './atlas-view.ts'
import { CastView } from './cast-view.ts'
import { DataView } from './data-view.ts'
import type { SceneEditorView } from './scene-editor-view.ts'
import { ShareDialog } from './share-dialog.ts'
import { TilesView } from './tiles-view.ts'
import type { WelcomeView } from './welcome-view.ts'

// Force registration so the `$CastView` / `$TilesView` / `$PixelRpgDataView`
// references in the blueprint resolve at template-parse time.
GObject.type_ensure(CastView.$gtype)
GObject.type_ensure(TilesView.$gtype)
GObject.type_ensure(DataView.$gtype)

type ViewName = 'welcome' | 'atlas' | 'cast' | 'tiles' | 'scene-editor' | 'data'

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
  /** Whether the user has paused the assistant (its actions are rejected). */
  assistantPaused: boolean
  /** Live session participants (AI assistant + networked peers). */
  participants: CollaboratorEntry[]
  /** peerId of the participant the camera is following, or null. */
  followedPeerId: string | null
}

/** One `Gio.Action` as surfaced to external tooling via Control. */
export interface ActionDescriptor {
  name: string
  enabled: boolean
  /** D-Bus signature of the action's parameter, or `null` if it takes none. */
  parameterType: string | null
  /** D-Bus signature of the action's state, or `null` if it is stateless. */
  stateType: string | null
}

/** `app.*` and `win.*` actions surfaced together. */
export interface ActionList {
  app: ActionDescriptor[]
  win: ActionDescriptor[]
}

type ActionScope = 'app' | 'win'

/** JSON-safe view of the collaboration session state for external tooling. */
export interface SessionSnapshot {
  kind: string
  roomId?: string
  port?: number
  role?: string
  sandboxProjectPath?: string
}

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
 * - `win.new-scene`, `win.new-character`, `win.new-spriteset`, `win.new-tileset`, `win.open-recent-projects`
 * - `win.new-animation` (string sheet id, empty = active sheet — opens the Add-animation dialog)
 * - `win.open-character` / `win.open-sheet` / `win.open-tileset` (string id — drill into the detail sub-page)
 *
 * Atlas/scene state lives in the views; the window orchestrates the
 * transitions and the dialogs (file pickers, toasts).
 */
export class ApplicationWindow extends Adw.ApplicationWindow {
  declare _welcome_view: WelcomeView
  declare _atlas_view: AtlasView
  declare _cast_view: CastView
  declare _tiles_view: TilesView
  declare _scene_editor_view: SceneEditorView
  declare _data_view: DataView
  declare _stack: Adw.ViewStack
  declare _toast_overlay: Adw.ToastOverlay

  private signals = new SignalScope()
  /**
   * The `win` action group, kept for the Control D-Bus interface to
   * enumerate + drive (see {@link _installActions}). Set once actions
   * are installed.
   */
  private _winActions: Gio.SimpleActionGroup | null = null
  // Populated by `_loadProjectFromPath` from the project's atlas
  // scenes. Empty until a project is opened — `_showSceneEditor`
  // is only reachable from the atlas, which itself only renders
  // once a project loaded, so the empty initial state is fine.
  private _scenesById = new Map<string, SampleScene>()
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
   * The `win.play` GAction. Stateful boolean — true when the editor
   * is in runtime (playtest) mode. Held as a field so `_setView` can
   * reset it back to `false` when the user leaves the scene editor,
   * since leaving disposes the engine and we don't want a stale
   * "playing" state to require an extra click on re-entry.
   */
  private _playAction: Gio.SimpleAction | null = null
  /** Guards the one-shot "AI assistant joined" toast; re-armed on HideAssistant. */
  private _assistantAnnounced = false
  // Local AI-assistant presence (the host's own virtual collaborator).
  // Networked human peers come from the live CollabSession awareness.
  private _assistantPresent = false
  private _assistantName = 'AI Assistant'
  private _assistantColor = '#9141ac'
  /** The participant the camera is following (peerId), or null. */
  private _followedPeerId: string | null = null
  /** Subscriptions to the live session awareness — torn down on state change. */
  private _collabAwarenessUnsubs: Array<() => void> = []
  /** peerIds currently shown in the collaborators bar — to skip rebuilds on cursor-only ticks. */
  private _renderedPeerIds = new Set<string>()
  /**
   * The `win.mode` GAction. Stateful string — `'world'` / `'cast'` /
   * `'tiles'` / `'audio'` / `'data'`. The change-state handler routes
   * the ViewStack so clicking a mode-rail row navigates to the
   * matching view.
   */
  private _modeAction: Gio.SimpleAction | null = null
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
  /**
   * Per-mode controllers — own their view's data + mutation +
   * persistence path so this window stays a thin coordinator. Both
   * are constructed in `vfunc_map` once the template-instantiated
   * views are reachable.
   */
  private _castCtl: CastController | null = null
  private _tilesCtl: TilesController | null = null
  private _dataCtl: DataController | null = null
  /**
   * Pair-Editing orchestration. Constructed once in `vfunc_map` with
   * a lazy engine provider — Welcome-view discovery flows work
   * without a loaded project, and `joinLan` / `joinByRoomId` reject
   * until an engine is available.
   */
  private _sessionSvc: SessionService | null = null
  /**
   * Modal Share dialog. One instance reused across opens — the
   * `closed` signal lets us re-present it without leaking widgets.
   * Wired to the SessionService on first build.
   */
  private _shareDialog: ShareDialog | null = null
  /**
   * Stateful `win.share-session` action. Disabled when no project is
   * loaded so the mode-rail share button greys out.
   */
  private _shareAction: Gio.SimpleAction | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'ApplicationWindow',
        Template,
        InternalChildren: [
          'welcome_view',
          'atlas_view',
          'cast_view',
          'tiles_view',
          'scene_editor_view',
          'data_view',
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
        },
      },
      ApplicationWindow,
    )
  }

  constructor(application: Adw.Application) {
    super({ application })
    this._installActions()
    this._shareSidebarState()
    // Mirror engine-driven zoom (scroll-wheel + Ctrl+= etc.) into the OSD label.
    this._engineCtl.onZoomChanged((zoom) => this._scene_editor_view.setZoom(zoom))
    // Same idea for the cursor coord readout on the OSD pill —
    // each tile-crossing of the pointer over the canvas updates the
    // `12, 7`-style label next to the zoom buttons. Engine handles
    // screen → world → tile + per-tile dedupe; we just forward.
    this._engineCtl.onPointerTileChanged(({ tileX, tileY }) => {
      this._scene_editor_view.setCursorTile(tileX, tileY)
    })
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
    // Every view's mode-rail forwards `mode-changed` at the view
    // level. Re-route all four through the central `win.mode` action
    // so navigation is consistent — the action's change-state handler
    // picks the right ViewStack page. Mutation handling + persistence
    // belongs to the per-mode controllers (constructed below);
    // view-side stays presentational.
    const setMode = (mode: string) => this._modeAction?.change_state(GLib.Variant.new_string(mode))
    this.signals.connect(this._atlas_view, 'mode-changed', (_v: AtlasView, mode: string) => setMode(mode))
    this.signals.connect(this._scene_editor_view, 'mode-changed', (_v: SceneEditorView, mode: string) => setMode(mode))
    this.signals.connect(this._cast_view, 'mode-changed', (_v: CastView, mode: string) => setMode(mode))
    this.signals.connect(this._tiles_view, 'mode-changed', (_v: TilesView, mode: string) => setMode(mode))

    // Scene editor → host bridge. The inspector mutates
    // `MapResource.mapData` in place via `engine.setLayerVisible` /
    // `setLayerLocked`, then asks the host to persist. Mirrors the
    // existing `scene-moved` → `_persistAtlasPosition` flow.
    this.signals.connect(this._scene_editor_view, 'persist-requested', () => {
      this._persistCurrentMap()
    })

    if (!this._castCtl) {
      this._castCtl = new CastController(this._cast_view, (msg) => this._showToast(msg))
      // Sprite-sets are shared project assets shown in BOTH the Cast
      // view (a character's sheet) and the Tiles view (a tileset). The
      // cast controller owns all sprite-set CRUD + collab broadcast, so
      // when its set list changes (import / delete / inbound peer op)
      // re-hydrate the Tiles view too.
      this._castCtl.onSpriteSetsChanged = () => {
        void this._tilesCtl?.setProject(this._loadedProject)
        this._dataCtl?.setProject(this._loadedProject)
      }
    }
    if (!this._tilesCtl) {
      this._tilesCtl = new TilesController(
        this._tiles_view,
        () => this._engineCtl.engine,
        (msg) => this._showToast(msg),
      )
    }
    if (!this._dataCtl) {
      this._dataCtl = new DataController(this._data_view, (msg) => this._showToast(msg))
      this._data_view.bindCallbacks({
        importAsset: (kind) => this._presentAssetImport(kind),
        openAsset: (id, kind) => this._openAsset(id, kind),
        renameAsset: (id, currentName) => this._presentRenameAsset(id, currentName),
        deleteAsset: (id, name, usedBy) => this._presentDeleteAsset(id, name, usedBy),
        setProjectField: (field, value) => this._dataCtl?.setProjectField(field, value),
      })
    }
    this.signals.connect(this._data_view, 'mode-changed', (_v: DataView, mode: string) => setMode(mode))
    // Tiles view → shared sprite-set CRUD on the cast controller. Import
    // and delete both flow through the one path so the copy/register +
    // collab broadcast live in a single place.
    this.signals.connect(this._tiles_view, 'spriteset-imported', (_v: TilesView, result: SpriteSetImportResult) => {
      void this._castCtl?.importSpriteSet(result)
    })
    this.signals.connect(this._tiles_view, 'spriteset-rename-requested', (_v: TilesView, id: string, name: string) => {
      this._castCtl?.renameSpriteSet(id, name)
    })
    this.signals.connect(this._tiles_view, 'spriteset-reorder-requested', (_v: TilesView, orderedIds: string[]) => {
      this._castCtl?.reorderSpriteSets(orderedIds)
    })
    this.signals.connect(this._tiles_view, 'spriteset-delete-requested', (_v: TilesView, id: string) => {
      this._castCtl?.deleteSpriteSet(id)
    })
    if (!this._sessionSvc) {
      // Resolve the core `@pixelrpg/engine` instance through the GJS
      // Engine widget — `widget.excalibur` is the same Engine class
      // (`executeCommand` / `applyRemoteCommand` / op-log etc.) that
      // CollabSession expects, so this is just an unwrap, not a
      // cross-API cast. Returns `null` until a project is loaded;
      // discovery flows work regardless.
      const engineProvider = () => this._engineCtl.engine?.excalibur ?? null
      this._sessionSvc = new SessionService(engineProvider, new LanSessionBackend(), generatePeerId())
      // Collaborators bar: clicking a participant chip follows it. Wired
      // once — the signal lives on the scene-editor view for the window's
      // lifetime.
      this._scene_editor_view.onParticipantActivated((peerId) => this._onParticipantActivated(peerId))
    }

    // Welcome view ↔ SessionService bridge. The window owns the
    // service (it spans the lifetime of every view), the Welcome
    // view is just the visual surface for browse + join. Start /
    // stop browsing tied to whether the welcome page is visible —
    // mDNS pings every couple of seconds and we don't want to
    // burn the network while the user is editing.
    this.signals.connect(this._welcome_view, 'session-selected', (_v: WelcomeView, service: DiscoveredService) => {
      void this._onJoinLanSession(service)
    })
    this.signals.connect(this._welcome_view, 'join-by-code', (_v: WelcomeView, roomId: string) => {
      void this._onJoinByRoomId(roomId)
    })
    // SessionService is not a GObject — use its typed `.on` instead
    // of `this.signals`. The unsubscribe closures live in
    // `_sessionUnsubscribes` so vfunc_unmap can tear them down
    // symmetrically.
    const svc = this._sessionSvc
    this._sessionUnsubscribes = [
      svc.on('service-discovered', (service) => this._welcome_view.addDiscoveredService(service)),
      svc.on('service-gone', (name) => this._welcome_view.removeDiscoveredService(name)),
      svc.on('error', (err) => this._showToast(_(`Session error: ${err.message}`))),
      // Joiner sandbox flow: host's project has been pulled into
      // a per-room sandbox directory. Open it as the active project
      // and once the engine is ready, attach it back to the
      // CollabSession so command sync + cursor rendering start.
      svc.on('sandbox-project-ready', (event) => {
        void this._loadSandboxProject(event.sandboxProjectPath)
      }),
      // Relay the AI assistant's cursor/presence to networked peers
      // while a session is live, so a remote human sees the AI too. The
      // AI's edits already sync via the shared op-log; this carries its
      // awareness frames. Cleared when the session goes idle.
      svc.on('state-changed', (state) => this._wireAssistantRelay(state)),
    ]

    // Start browsing whenever the welcome view is the visible page.
    this._refreshSessionBrowsing()
    this.signals.connect(this._stack, 'notify::visible-child-name', () => this._refreshSessionBrowsing())
  }

  /** Active subscriptions to {@link SessionService} events — torn down on unmap. */
  private _sessionUnsubscribes: Array<() => void> = []

  private _refreshSessionBrowsing(): void {
    if (!this._sessionSvc) return
    const visible = this._stack.get_visible_child_name()
    if (visible === 'welcome') this._sessionSvc.startBrowsing()
    else this._sessionSvc.stopBrowsing()
  }

  private async _onJoinLanSession(service: DiscoveredService): Promise<void> {
    // Joiner no longer requires a local project — SessionService
    // pulls the host's snapshot into a sandbox directory and
    // emits `sandbox-project-ready` which we load below.
    this._showToast(_(`Joining ${service.txt.project ?? service.name}…`))
    try {
      await this._sessionSvc?.joinLan(service)
    } catch (err) {
      this._showToast(_(`Could not join: ${(err as Error).message}`))
    }
  }

  private async _onJoinByRoomId(roomId: string): Promise<void> {
    this._showToast(_(`Joining room ${roomId}…`))
    try {
      await this._sessionSvc?.joinByRoomId(roomId)
    } catch (err) {
      this._showToast(_(`Could not join: ${(err as Error).message}`))
    }
  }

  /**
   * Load a shared-session sandbox project at the given path. Engine
   * attachment is **deferred** — `_hydrateSceneEditor`'s post-
   * `ensureForMap` hook (see {@link _maybeAttachEngineToSession})
   * actually wires the `CollabSession` to the engine once the user
   * navigates to a scene.
   *
   * Triggered by the SessionService's `sandbox-project-ready` event.
   *
   * Why deferred? The atlas view loads BEFORE any scene-editor
   * navigation, so `engineCtl.engine` is `null` at this point on the
   * joiner's first session. Pre-fix code attempted to attach here
   * and silently bailed when the engine was null — that left the
   * `SessionController` un-attached, so the joiner's own paints
   * never fired `COMMAND_EXECUTED`-driven `op` sends AND incoming
   * `tile.paint` ops from the host had no `applyInbound` to route
   * through. Bidirectional sync was structurally dead from the
   * joiner's perspective, even when the wire transport worked.
   *
   * On failure (project-load throws) the session stays in the
   * `awaiting-engine` state — the user can leave the session via
   * the existing controls.
   */
  private async _loadSandboxProject(projectPath: string): Promise<void> {
    try {
      await this._loadProjectFromPath(projectPath)
      this._showToast(_('Joined shared session — open a scene to start editing.'))
    } catch (err) {
      this._showToast(_(`Could not open shared session: ${(err as Error).message}`))
    }
  }

  /**
   * Attach the active engine to the current `CollabSession` if (and
   * only if) the session is waiting for one. Called from
   * `_hydrateSceneEditor` immediately after `ensureForMap` resolves,
   * which guarantees `_engineCtl.engine?.excalibur` is non-null.
   *
   * Idempotent / safe to call on every scene-editor entry:
   *   - no session              → no-op (`_sessionSvc` is undefined or state ≠ awaiting-engine)
   *   - host / already attached → no-op (state is `connected`, not `awaiting-engine`)
   *   - joiner waiting          → attach + flip state to `connected`
   *
   * Failures are toasted but don't reset the session — the user can
   * leave via the existing controls.
   */
  private _maybeAttachEngineToSession(): void {
    if (!this._sessionSvc) return
    if (this._sessionSvc.getState().kind !== 'awaiting-engine') return
    const engine = this._engineCtl.engine?.excalibur
    if (!engine) return
    try {
      this._sessionSvc.attachEngineToCurrentSession(engine)
      this._showToast(_('Live editing — your changes sync with the host.'))
    } catch (err) {
      console.warn('[ApplicationWindow] attachEngineToCurrentSession failed:', err)
      this._showToast(_('Could not start live sync — see logs.'))
    }
  }

  /**
   * Point the engine's assistant-awareness relay at the live
   * `CollabSession` (or clear it when the session goes idle), so the AI
   * collaborator's cursor/presence reach networked human peers too. The
   * AI's edits already propagate via the shared op-log — this is just the
   * awareness channel. See docs/concepts/ai-collaborator.md (Phase 5).
   */
  private _wireAssistantRelay(state: SessionState): void {
    const engine = this._engineCtl.engine?.excalibur
    const collab = 'collab' in state ? state.collab : null

    // Phase 5: relay the AI's awareness frames out to networked peers.
    engine?.setAssistantFrameRelay(collab ? (frame) => collab.awareness.relay(frame) : null)

    // Project-level (cast) sync — works without an engine, since cast
    // editing has no live scene. While a session is up the controller
    // broadcasts character upserts; inbound peer ops route back to it.
    this._castCtl?.setCollabSession(collab)
    if (collab) {
      collab.onProjectOpReceived = (op) => this._castCtl?.applyRemoteProjectOp(op)
      collab.onSpriteSetAddReceived = (payload) => this._castCtl?.applyRemoteSpriteSetAdd(payload)
      collab.onSpriteSetUpdateReceived = (payload) => this._castCtl?.applyRemoteSpriteSetUpdate(payload)
    }

    // Track the live session roster for the collaborators bar + follow.
    for (const unsub of this._collabAwarenessUnsubs) unsub()
    this._collabAwarenessUnsubs = []
    if (collab) {
      this._collabAwarenessUnsubs.push(collab.awareness.on('peer-changed', (peer) => this._onPeerChanged(peer)))
      this._collabAwarenessUnsubs.push(collab.awareness.on('peer-left', ({ peerId }) => this._onPeerLeft(peerId)))
    } else if (this._followedPeerId && this._followedPeerId !== ASSISTANT_PEER_ID) {
      // Session ended — stop following a (now-gone) human peer.
      this._setFollowedPeer(null)
    }
    this._refreshCollaborators()
  }

  /**
   * Open the Share dialog, building it lazily on first call. The
   * dialog stays alive for the window's lifetime — re-presenting it
   * after a `closed` is a no-op, since `present(parent)` only takes
   * effect when the dialog isn't currently mapped.
   */
  private _onShareSession(): void {
    if (!this._loadedProject) {
      this._showToast(_('Open a project before sharing it.'))
      return
    }
    if (!this._sessionSvc) return
    this._setupShareDialog()
    this._shareDialog?.syncWithSession(this._sessionSvc.getState(), buildPixelrpgJoinUrl)
    this._shareDialog?.present(this)
  }

  private _setupShareDialog(): void {
    if (this._shareDialog || !this._sessionSvc) return

    const dialog = new ShareDialog()
    const svc = this._sessionSvc

    dialog.connect('share-requested', () => {
      void this._startShare()
    })
    dialog.connect('stop-requested', () => {
      void this._stopShare()
    })
    dialog.connect('copy-link-requested', () => {
      const display = this.get_display()
      if (!display) return
      if (dialog.copyShareUrlToClipboard(display)) {
        this._showToast(_('Share link copied to clipboard.'))
      }
    })

    // Mirror SessionService state into the dialog so the user sees
    // hosting transitions live (URL appears the moment startHosting
    // resolves; status row swaps to "Editing with peer" on connect).
    this._sessionUnsubscribes.push(
      svc.on('state-changed', (state) => dialog.syncWithSession(state, buildPixelrpgJoinUrl)),
    )

    this._shareDialog = dialog
  }

  private async _startShare(): Promise<void> {
    if (!this._sessionSvc || !this._loadedProject) return
    try {
      const roomId = await this._sessionSvc.startHosting({
        sessionName: this._loadedProject.projectName,
        projectName: this._loadedProject.projectName,
        // Static display name — replaced by a GSettings-backed
        // value once the user can pick one in preferences.
        hostDisplayName: GLib.get_user_name() ?? 'host',
      })
      this._showToast(_(`Sharing as room ${roomId}.`))
    } catch (err) {
      this._showToast(_(`Could not start sharing: ${(err as Error).message}`))
    }
  }

  private async _stopShare(): Promise<void> {
    if (!this._sessionSvc) return
    await this._sessionSvc.stopHosting()
    // syncWithSession will flip the dialog back to its idle page via
    // the state-changed subscription wired in _setupShareDialog.
    this._showToast(_('Stopped sharing.'))
  }

  /**
   * Route a mode-rail mode change. `world` returns to the atlas;
   * `cast` opens the new Cast view (Phase 3); other modes still toast
   * "Coming soon" until their respective views are built.
   */
  private _onModeChanged(mode: string): void {
    switch (mode) {
      case 'world':
        // Only switch if we're not already showing the atlas. From the
        // welcome view, the user has to "Open Project" first; we don't
        // want clicking the mode rail in atlas/cast/scene-editor to
        // bounce them back to the welcome.
        if (this._loadedProject) this._setView('atlas')
        break
      case 'cast':
        if (this._loadedProject) {
          void this._castCtl?.refresh()
          this._setView('cast')
        }
        break
      case 'tiles':
        if (this._loadedProject) this._setView('tiles')
        break
      case 'data':
        if (this._loadedProject) this._setView('data')
        break
      case 'audio': {
        this._showToast(_('Coming soon — this mode is not yet implemented'))
        // Reset back to whichever view we were on; the action state
        // already advanced to the new mode but no view exists.
        const current = this._stack.get_visible_child_name()
        const fallback =
          current === 'cast' ? 'cast' : current === 'tiles' ? 'tiles' : current === 'data' ? 'data' : 'world'
        this._modeAction?.set_state(GLib.Variant.new_string(fallback))
        break
      }
    }
  }

  /** Present the unified import dialog for a Data-view asset of `kind`. */
  private _presentAssetImport(kind: SpriteSetKind): void {
    const dialog = new SpriteSetImportDialog()
    dialog.kind = kind
    dialog.connect('spriteset-imported', (_d: SpriteSetImportDialog, result: SpriteSetImportResult) => {
      void this._castCtl?.importSpriteSet(result)
    })
    dialog.present(this)
  }

  /** Jump from a Data-view asset row to its editor (Cast for sheets, Tiles for tilesets). */
  private _openAsset(id: string, kind: SpriteSetKind): void {
    if (!this._loadedProject) return
    if (kind === 'tileset') {
      this._setView('tiles')
      this._tiles_view.focusTileset(id)
      return
    }
    // Sprite sheet → open the first character (character-template entity)
    // whose appearance uses it, else just the Cast view.
    const character = this._loadedProject.resource.data?.entityLibrary?.find(
      (e) => isCharacterEntity(e) && getComponentData(e, 'visual')?.spriteSetId === id,
    )
    this._setView('cast')
    if (character) this._cast_view.focusCharacter(character.id)
  }

  /** Rename an asset's display name via a small dialog (Data view). */
  private _presentRenameAsset(id: string, currentName: string): void {
    const entry = new Gtk.Entry({ text: currentName, activatesDefault: true })
    const dialog = new Adw.AlertDialog({ heading: _('Rename asset'), extraChild: entry })
    dialog.add_response('cancel', _('Cancel'))
    dialog.add_response('rename', _('Rename'))
    dialog.set_response_appearance('rename', Adw.ResponseAppearance.SUGGESTED)
    dialog.set_default_response('rename')
    dialog.set_close_response('cancel')
    dialog.connect('response', (_d: Adw.AlertDialog, response: string) => {
      // Route through the cast controller — the single owner of sprite-set
      // file writes + collab broadcast (it re-hydrates the Data view via
      // `onSpriteSetsChanged`).
      if (response === 'rename') this._castCtl?.renameSpriteSet(id, entry.get_text())
    })
    dialog.present(this)
  }

  /** Confirm + delete an asset (sprite set) through the shared cast controller. */
  private _presentDeleteAsset(id: string, name: string, usedBy: number): void {
    const body =
      usedBy > 0
        ? _(`“${name}” is still used in ${usedBy} place(s). Deleting it may break them. Continue?`)
        : _(`“${name}” will be removed from the project, including its files. This cannot be undone.`)
    const dialog = new Adw.AlertDialog({ heading: _('Delete asset?'), body })
    dialog.add_response('cancel', _('Cancel'))
    dialog.add_response('delete', _('Delete'))
    dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE)
    dialog.set_default_response('cancel')
    dialog.set_close_response('cancel')
    dialog.connect('response', (_d: Adw.AlertDialog, response: string) => {
      if (response === 'delete') this._castCtl?.deleteSpriteSet(id)
    })
    dialog.present(this)
  }

  /**
   * Serialise the currently-edited map's `MapData` back to disk.
   * Called by the scene editor's `persist-requested` signal after
   * an in-place mutation (layer visibility, layer lock — and any
   * future inspector-driven map mutation).
   */
  private _persistCurrentMap(): void {
    if (!this._currentSceneId) return
    this._persistMap(this._currentSceneId, _('Could not save layer changes'))
  }

  /**
   * Write the atlas coordinates the user just dragged back into the
   * map's source JSON. In-memory state always updates so the card
   * position survives the session even if the disk write fails.
   */
  private _persistAtlasPosition(mapId: string, x: number, y: number): void {
    const mapResource = this._loadedProject?.resource.maps.get(mapId)
    if (!mapResource?.mapData) return
    const editorData = (mapResource.mapData.editorData ?? {}) as Record<string, unknown>
    editorData.atlasX = x
    editorData.atlasY = y
    mapResource.mapData.editorData = editorData
    this._persistMap(mapId, _('Could not save atlas position'))
  }

  /**
   * Write a map's `MapData` back to its source JSON. Best-effort —
   * a failure toasts but the in-memory mutation stays so the user
   * sees their change in the editor even when persistence fails.
   * Shared between `_persistCurrentMap` and `_persistAtlasPosition`.
   */
  private _persistMap(mapId: string, errorMessage: string): void {
    const mapResource = this._loadedProject?.resource.maps.get(mapId)
    if (!mapResource?.mapData) return
    const ok = writeTextFile(mapResource.sourcePath, MapFormat.serialize(mapResource.mapData))
    if (!ok) this._showToast(errorMessage)
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    for (const dispose of this._sessionUnsubscribes) dispose()
    this._sessionUnsubscribes = []
    this._sessionSvc?.stopBrowsing()
    super.vfunc_unmap()
  }

  /**
   * Bidirectionally bind this window's `show-library` / `show-inspector`
   * to every view's own pair. Effect: the sidebars retain their state
   * across view switches — opening the library in atlas keeps it open
   * after navigating to scene-editor, and closing it stays closed when
   * the user goes back. Welcome's library-less layout binds only the
   * inspector.
   */
  private _shareSidebarState(): void {
    const flags = GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL
    for (const view of [this._atlas_view, this._cast_view, this._tiles_view, this._scene_editor_view]) {
      this.bind_property('show-library', view, 'show-library', flags)
      this.bind_property('show-inspector', view, 'show-inspector', flags)
    }
    this.bind_property('show-inspector', this._welcome_view, 'show-inspector', flags)
    // The Data view has a mode rail but no inspector — bind only the library.
    this.bind_property('show-library', this._data_view, 'show-library', flags)
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
      const mode = value!.get_string()[0]
      this._onModeChanged(mode)
    })
    winActions.add_action(modeAction)
    this._modeAction = modeAction

    const toolAction = Gio.SimpleAction.new_stateful(
      'set-tool',
      GLib.VariantType.new('s'),
      // Default to the read-only `'select'` tool — clicking on the
      // canvas selects an object placement at that tile (or clears
      // the selection on empty tiles) without mutating the map.
      // Mutating tools (`pencil`, `eraser`) need an explicit pick
      // from the tool menu so a misclick can't accidentally paint
      // over existing artwork.
      GLib.Variant.new_string('select'),
    )
    toolAction.connect('change-state', (action, value) => {
      action.set_state(value!)
      const tool = value!.get_string()[0] as EditorTool
      // Tool ids are shared with the engine's `EditorTool` union, so
      // the GAction state string can be passed straight through.
      this._engineCtl.engine?.setActiveTool(tool)
      // Refresh the top-bar tool MenuButton's icon to match. The
      // popover-menu inside it already auto-updates its checkmark
      // from the stateful action; only the collapsed icon needs us.
      this._scene_editor_view.setActiveTool(tool)
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

    // Sidebar toggle actions. `Gio.PropertyAction` wraps the
    // SceneEditorView's boolean `show-library` / `show-inspector`
    // properties bi-directionally — the OSD toggle buttons that
    // live in the cross-package `FloatingTopBar` widget can't reach
    // a cross-package template binding, so PropertyAction is the
    // action-shaped bridge. Atlas + welcome stay inline + use
    // direct `bind template.show-…` bindings because their toggles
    // live in the same template. See `docs/concepts/responsive-chrome.md`.
    winActions.add_action(
      new Gio.PropertyAction({
        name: 'toggle-library',
        object: this,
        property_name: 'show-library',
      }),
    )
    winActions.add_action(
      new Gio.PropertyAction({
        name: 'toggle-inspector',
        object: this,
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

    // Select tool: the engine's `TileEditorSystem` emits
    // `PLACEMENT_SELECTED` when the user clicks while the select tool
    // is active — the system already mutated
    // `SelectedPlacementsComponent` so the canvas-side selection ring
    // updates; we mirror the pick into the right-inspector's
    // objects-tab row highlight. Empty-tile clicks land here with
    // `placementId: null` and clear the row highlight.
    //
    // Auto-open the right inspector on a hit (per the project-wide
    // policy in `docs/concepts/responsive-chrome.md`). Empty-tile
    // clicks leave it alone — there's no inspector content for an
    // empty selection, so popping the sidebar open would feel
    // surprising. The window-level `show-inspector` setter is a no-
    // op when already open.
    this._engineCtl.onPlacementSelected(({ placementId }) => {
      this._scene_editor_view.highlightPlacement(placementId)
      if (placementId) this.set_property('show-inspector', true)
    })

    // Grid lines + non-active-layer dimming are two INDEPENDENT
    // editor view flags. The user can have grid on / off and the
    // dimming on / off in any combination — they help with
    // different tasks (grid = tile alignment, dimming = layer
    // focus). The engine mirrors that split as `setShowGrid` +
    // `setDimInactiveLayers` against the same session-singleton
    // component, so each toggle drives just its own flag.
    const gridAction = Gio.SimpleAction.new_stateful('toggle-grid', null, GLib.Variant.new_boolean(false))
    gridAction.connect('change-state', (action, value) => {
      action.set_state(value!)
      this._engineCtl.engine?.setShowGrid(value!.get_boolean())
    })
    winActions.add_action(gridAction)

    const transparencyAction = Gio.SimpleAction.new_stateful(
      'toggle-transparency',
      null,
      GLib.Variant.new_boolean(false),
    )
    transparencyAction.connect('change-state', (action, value) => {
      action.set_state(value!)
      this._engineCtl.engine?.setDimInactiveLayers(value!.get_boolean())
    })
    winActions.add_action(transparencyAction)

    // Play / playtest toggle. Stateful boolean — clicking the
    // FloatingPlay button (action-name="win.play") activates the
    // action; the activate handler flips the state, the
    // change-state handler forwards into the engine to swap
    // `EditorModeComponent` ↔ `RuntimeModeComponent` on the active
    // scene. The engine's `PlayerSystem` reveals + drives the
    // player actor in runtime, hides it again on editor mode.
    const playAction = Gio.SimpleAction.new_stateful('play', null, GLib.Variant.new_boolean(false))
    playAction.connect('activate', () => {
      const current = playAction.get_state()?.get_boolean() ?? false
      playAction.change_state(GLib.Variant.new_boolean(!current))
    })
    playAction.connect('change-state', (action, value) => {
      action.set_state(value!)
      const isPlaying = value!.get_boolean()
      // Save unsaved tile edits before entering runtime so a crash
      // mid-playtest can't lose work. Best-effort — failures surface
      // as a toast but the playtest still proceeds.
      if (isPlaying) this._persistCurrentMap()
      this._engineCtl.engine?.setRuntimeMode(isPlaying)
      // Visual feedback on the FloatingPlay pill: icon + label swap
      // to "pause" while in playtest mode so it's clear what the
      // button will do on the next click.
      this._scene_editor_view.setPlaying(isPlaying)
    })
    winActions.add_action(playAction)
    this._playAction = playAction

    // AI-assistant pause toggle. The collaborators bar's pause button
    // (action-name="win.toggle-assistant-paused") activates this; the
    // change-state handler pauses the engine's assistant (its cursor +
    // paints are rejected) and swaps the button's icon to "resume". This
    // is the user's stay-in-control switch over the AI collaborator.
    const assistantPausedAction = Gio.SimpleAction.new_stateful(
      'toggle-assistant-paused',
      null,
      GLib.Variant.new_boolean(false),
    )
    assistantPausedAction.connect('activate', () => {
      const current = assistantPausedAction.get_state()?.get_boolean() ?? false
      assistantPausedAction.change_state(GLib.Variant.new_boolean(!current))
    })
    assistantPausedAction.connect('change-state', (action, value) => {
      action.set_state(value!)
      const paused = value!.get_boolean()
      this._engineCtl.engine?.excalibur?.setAssistantPaused(paused)
      this._scene_editor_view.setAssistantPaused(paused)
    })
    winActions.add_action(assistantPausedAction)

    // Camera-follow is now per-participant: clicking a chip in the
    // collaborators bar follows that participant (see
    // _onParticipantActivated), so there's no standalone follow action.

    // Keyboard accelerators: Ctrl+Z = undo, Ctrl+Shift+Z = redo,
    // Ctrl+G = toggle grid, Ctrl+T = toggle non-active-layer
    // transparency, F5 = play / pause playtest.
    const app = this.get_application() as Adw.Application | null
    app?.set_accels_for_action('win.undo', ['<Primary>z'])
    app?.set_accels_for_action('win.redo', ['<Primary><Shift>z', '<Primary>y'])
    app?.set_accels_for_action('win.toggle-grid', ['<Primary>g'])
    app?.set_accels_for_action('win.toggle-transparency', ['<Primary>t'])
    app?.set_accels_for_action('win.play', ['F5'])

    for (const name of ['switch-tileset', 'new-layer', 'open-recent-projects']) {
      winActions.add_action(new Gio.SimpleAction({ name }))
    }

    const backAction = new Gio.SimpleAction({ name: 'back-to-atlas' })
    backAction.connect('activate', () => this._showAtlas())
    winActions.add_action(backAction)

    const closeProjectAction = new Gio.SimpleAction({ name: 'close-project' })
    closeProjectAction.connect('activate', () => this._setView('welcome'))
    winActions.add_action(closeProjectAction)

    // Share-session — opens the Share dialog. Disabled until a
    // project loads; the mode-rail's share button binds to this
    // GAction so it greys out at the same time.
    const shareAction = new Gio.SimpleAction({ name: 'share-session' })
    shareAction.set_enabled(false)
    shareAction.connect('activate', () => this._onShareSession())
    winActions.add_action(shareAction)
    this._shareAction = shareAction
    app?.set_accels_for_action('win.share-session', ['<Primary><Shift>s'])

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

    const newCharacterAction = new Gio.SimpleAction({ name: 'new-character' })
    newCharacterAction.connect('activate', () => {
      if (!this._loadedProject) {
        this._showToast(_('Open a project first'))
        return
      }
      this._cast_view.presentNewCharacterDialog()
    })
    winActions.add_action(newCharacterAction)

    const newSpriteSetAction = new Gio.SimpleAction({ name: 'new-spriteset' })
    newSpriteSetAction.connect('activate', () => {
      if (!this._loadedProject) {
        this._showToast(_('Open a project first'))
        return
      }
      this._cast_view.presentSpriteSetImportDialog()
    })
    winActions.add_action(newSpriteSetAction)

    const newTilesetAction = new Gio.SimpleAction({ name: 'new-tileset' })
    newTilesetAction.connect('activate', () => {
      if (!this._loadedProject) {
        this._showToast(_('Open a project first'))
        return
      }
      this._tiles_view.presentTilesetImportDialog()
    })
    winActions.add_action(newTilesetAction)

    // Drill into a character / tileset detail sub-page by id — the
    // master-detail equivalent of `open-scene-by-id`. Card clicks do this
    // in the UI; the action lets tooling (the MCP bridge) + scripts reach
    // the detail page too.
    const openCharacterAction = Gio.SimpleAction.new('open-character', GLib.VariantType.new('s'))
    openCharacterAction.connect('activate', (_a, parameter) => {
      const id = parameter?.get_string()[0]
      if (id) this._cast_view.focusCharacter(id)
    })
    winActions.add_action(openCharacterAction)

    const openTilesetAction = Gio.SimpleAction.new('open-tileset', GLib.VariantType.new('s'))
    openTilesetAction.connect('activate', (_a, parameter) => {
      const id = parameter?.get_string()[0]
      if (id) this._tiles_view.focusTileset(id)
    })
    winActions.add_action(openTilesetAction)

    // Drill into a sprite-sheet detail sub-page by id — the Cast view's
    // Sprite-sheets section equivalent of `open-character`.
    const openSheetAction = Gio.SimpleAction.new('open-sheet', GLib.VariantType.new('s'))
    openSheetAction.connect('activate', (_a, parameter) => {
      const id = parameter?.get_string()[0]
      if (id) this._cast_view.focusSheet(id)
    })
    winActions.add_action(openSheetAction)

    // Present the "New animation" dialog for a sprite sheet. Optional
    // string id drills into that sheet first (so tooling can open it in
    // one call); empty targets the active sheet. Mainly for the MCP
    // bridge — the in-UI path is the sheet detail's "Add animation" row.
    const newAnimationAction = Gio.SimpleAction.new('new-animation', GLib.VariantType.new('s'))
    newAnimationAction.connect('activate', (_a, parameter) => {
      if (!this._loadedProject) {
        this._showToast(_('Open a project first'))
        return
      }
      const id = parameter?.get_string()[0]
      this._cast_view.presentNewAnimationDialog(id || undefined)
    })
    winActions.add_action(newAnimationAction)

    const openSceneAction = new Gio.SimpleAction({ name: 'open-scene' })
    openSceneAction.connect('activate', () => {
      const id = this._currentAtlasSelection()
      if (id) this._showSceneEditor(id)
    })
    winActions.add_action(openSceneAction)

    this.insert_action_group('win', winActions)
    // Keep a reference so the Control D-Bus interface can list / drive
    // these actions. Adw.ApplicationWindow (unlike Gtk.ApplicationWindow)
    // has no GActionMap that GtkApplication would export over
    // org.gtk.Actions, so external tooling reaches them through Control.
    this._winActions = winActions
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
      // Reset play state — the engine is gone; re-entering the scene
      // editor starts a fresh MapScene defaulted to editor mode. Without
      // this the stateful action would still report "playing" and the
      // first click would have to flip to false before actually playing.
      this._playAction?.change_state(GLib.Variant.new_boolean(false))
    }
    this._stack.set_visible_child_name(name)

    // When the mode rail is an overlay (narrow widths, `library-collapsed`),
    // selecting a page through it should dismiss it so the chosen view
    // isn't left covered. On wide layouts the rail is pinned and stays.
    if (name !== 'welcome' && this._cast_view.libraryCollapsed) {
      this.set_property('show-library', false)
    }

    // Keep `win.mode` in sync with the visible view so the mode rail's
    // active row matches what's on screen. `welcome` doesn't have a
    // mode — leave the action where it was so going welcome → back-to-
    // atlas restores the previous mode highlight.
    const modeForView: Record<ViewName, EditorMode | null> = {
      welcome: null,
      atlas: 'world',
      cast: 'cast',
      tiles: 'tiles',
      'scene-editor': 'world',
      data: 'data',
    }
    const targetMode = modeForView[name]
    if (targetMode && this._modeAction?.get_state()?.get_string()[0] !== targetMode) {
      // Use set_state (not change_state) to avoid recursing through
      // `_onModeChanged` — the view is already being set explicitly.
      this._modeAction.set_state(GLib.Variant.new_string(targetMode))
    }
    if (targetMode) this._syncModeRails(targetMode)
  }

  /**
   * Push the active mode into every view's ModeRail instance. Each
   * view owns its own ModeRail (atlas / cast / tiles / scene-editor),
   * and the rails only auto-update on their OWN row clicks. Without
   * this push, navigating via a path that bypasses a rail's click
   * (e.g. opening a scene from the atlas, or a programmatic
   * `_setView`) would leave the destination view's rail showing a
   * stale active row — the user-visible bug from #71's first review.
   *
   * Pushing to ALL rails (not just the active view's) keeps state in
   * sync for any future toggle to a different view.
   */
  private _syncModeRails(mode: EditorMode): void {
    this._atlas_view.syncActiveMode(mode)
    this._cast_view.syncActiveMode(mode)
    this._tiles_view.syncActiveMode(mode)
    this._scene_editor_view.syncActiveMode(mode)
    this._data_view.syncActiveMode(mode)
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

    // If we joined a shared session before any scene was open, the
    // engine was null at `_loadSandboxProject` time and the collab
    // wiring was deferred. Now that `ensureForMap` has booted the
    // engine, attach it so commands start flowing both ways.
    // No-op when there's no awaiting-engine session.
    this._maybeAttachEngineToSession()

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
      this._shareAction?.set_enabled(true)
      this._atlas_view.projectName = project.projectName
      this._scene_editor_view.projectName = project.projectName
      this._atlas_view.setWorld(project.scenes, project.teleports, project.resource)
      this._scenesById = new Map(project.scenes.map((s) => [s.id, s]))
      // Per-mode controllers own the cast + tiles data path; tell them
      // about the new project so their views can hydrate.
      this._castCtl?.setProject(project)
      this._tilesCtl?.setProject(project)
      this._dataCtl?.setProject(project)
      // A fresh project starts on the card overview, not a stale detail
      // page left over from the previous project.
      this._cast_view.resetToOverview()
      this._tiles_view.resetToOverview()
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

  /**
   * Read-only snapshot of the editor's live state for external tooling
   * (the `org.pixelrpg.maker.Control` D-Bus interface → MCP bridge).
   * Pulls together view + project + engine state that is otherwise
   * scattered across private fields and the engine controller.
   */
  getDebugStatus(): DebugStatus {
    const engine = this._engineCtl.engine
    const ex = engine?.excalibur ?? null
    return {
      view: this._stack.get_visible_child_name(),
      projectName: this._loadedProject?.projectName ?? null,
      projectPath: this._loadedProject?.projectPath ?? null,
      currentSceneId: this._currentSceneId,
      sceneIds: [...this._scenesById.keys()],
      scenes: [...this._scenesById.values()].map((s) => ({ id: s.id, name: s.name })),
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
      assistantPresent: ex?.isAssistantActive() ?? false,
      assistantPaused: ex?.isAssistantPaused() ?? false,
      participants: this.getParticipants(),
      followedPeerId: this._followedPeerId,
    }
  }

  /** Set the camera zoom to an absolute value (1 = 100%). No-op without an engine. */
  setZoom(zoom: number): void {
    this._applyZoom(zoom)
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
   * peers. Returns `false` if it couldn't be applied.
   */
  paintTile(layerId: string | null, tileX: number, tileY: number, spriteId?: number | null): boolean {
    return this._engineCtl.engine?.excalibur?.paintTileAt(layerId, tileX, tileY, spriteId) ?? false
  }

  /** Show/move the AI-assistant collaborator cursor at tile (x, y). Returns false without an engine. */
  setAssistantCursor(tileX: number, tileY: number): boolean {
    const applied = this._engineCtl.engine?.excalibur?.setAssistantCursor(tileX, tileY) ?? false
    if (applied && !this._assistantPresent) {
      this._assistantPresent = true
      this._announceAssistantOnce()
      this._refreshCollaborators()
    }
    return applied
  }

  /** Set the AI-assistant cursor's display name + colour. */
  setAssistantInfo(displayName: string, color: string): void {
    this._engineCtl.engine?.excalibur?.setAssistantInfo(displayName, color)
    this._assistantName = displayName
    this._assistantColor = color
    if (!this._assistantPresent) {
      this._assistantPresent = true
      this._announceAssistantOnce()
    }
    this._refreshCollaborators()
  }

  /** Remove the AI-assistant cursor/presence. */
  hideAssistant(): void {
    this._engineCtl.engine?.excalibur?.hideAssistant()
    this._assistantPresent = false
    this._assistantAnnounced = false
    if (this._followedPeerId === ASSISTANT_PEER_ID) this._setFollowedPeer(null)
    this._refreshCollaborators()
  }

  /**
   * Announce the FIRST assistant activation with a toast — a clear,
   * consent-style "an AI is now acting here" cue (not a silent takeover).
   * Re-armed on `HideAssistant`.
   */
  private _announceAssistantOnce(): void {
    if (this._assistantAnnounced) return
    this._assistantAnnounced = true
    this._showToast(_('AI assistant is now editing with you'))
  }

  /** The live `CollabSession` (host or joiner) if a session is active, else null. */
  private _activeCollab() {
    const state = this._sessionSvc?.getState()
    return state && 'collab' in state ? state.collab : null
  }

  /**
   * Rebuild the collaborators bar from the live roster: the local AI
   * assistant (if present) + every networked peer from the session
   * awareness. A relayed AI on a joiner arrives as a session peer with
   * `ASSISTANT_PEER_ID` — flagged `isAI` so it gets the assistant styling.
   */
  private _refreshCollaborators(): void {
    const participants = this.getParticipants()
    this._renderedPeerIds = new Set(participants.map((p) => p.peerId))
    this._scene_editor_view.setCollaborators(participants, this._followedPeerId)
  }

  /**
   * The live participant roster: the local AI assistant (if present) +
   * every networked peer from the session awareness. A relayed AI on a
   * joiner arrives as a session peer with `ASSISTANT_PEER_ID` — flagged
   * `isAI`. Shared by the collaborators bar + `getDebugStatus`.
   */
  getParticipants(): CollaboratorEntry[] {
    const participants: CollaboratorEntry[] = []
    if (this._assistantPresent) {
      participants.push({
        peerId: ASSISTANT_PEER_ID,
        name: this._assistantName,
        color: this._assistantColor,
        isAI: true,
      })
    }
    const collab = this._activeCollab()
    if (collab) {
      for (const peer of collab.awareness.getPeers()) {
        if (peer.peerId === ASSISTANT_PEER_ID && this._assistantPresent) continue // already listed locally
        participants.push({
          peerId: peer.peerId,
          name: peer.info.displayName,
          color: peer.info.color,
          isAI: peer.peerId === ASSISTANT_PEER_ID,
        })
      }
    }
    return participants
  }

  /** Toggle camera-follow for the clicked participant (clicking the followed one stops following). */
  private _onParticipantActivated(peerId: string): void {
    this.followParticipant(this._followedPeerId === peerId ? null : peerId)
  }

  /**
   * Follow `peerId` with the camera (pass `null` to stop). Public so the
   * Control interface can drive it too; chip clicks route through here via
   * {@link _onParticipantActivated}.
   */
  followParticipant(peerId: string | null): void {
    this._setFollowedPeer(peerId)
    // Jump straight to a followed human peer's current cursor (the engine
    // self-pans for the AI).
    if (peerId && peerId !== ASSISTANT_PEER_ID) {
      const peer = this._activeCollab()?.awareness.getPeer(peerId)
      if (peer?.cursor) this._engineCtl.engine?.excalibur?.panCameraTo(peer.cursor.x, peer.cursor.y)
    }
    this._refreshCollaborators()
  }

  /** The currently-followed participant peerId, or null. */
  get followedPeerId(): string | null {
    return this._followedPeerId
  }

  private _setFollowedPeer(peerId: string | null): void {
    this._followedPeerId = peerId
    const engine = this._engineCtl.engine?.excalibur
    // The engine pans itself for the AI (it owns the AI cursor); human
    // peers are panned from `_onPeerChanged` as their cursors arrive.
    engine?.setFollowAssistant(peerId === ASSISTANT_PEER_ID)
    // Stop the smooth glide when following no one.
    if (!peerId) engine?.stopCameraFollow()
  }

  /** A session peer's awareness changed — pan if it's the followed one; rebuild only on roster changes. */
  private _onPeerChanged(peer: AwarenessPeerState): void {
    if (peer.peerId === this._followedPeerId && peer.peerId !== ASSISTANT_PEER_ID && peer.cursor) {
      this._engineCtl.engine?.excalibur?.panCameraTo(peer.cursor.x, peer.cursor.y)
    }
    if (!this._renderedPeerIds.has(peer.peerId)) this._refreshCollaborators()
  }

  /** A session peer left — drop follow if it was followed, rebuild the bar. */
  private _onPeerLeft(peerId: string): void {
    if (this._followedPeerId === peerId) this._setFollowedPeer(null)
    this._refreshCollaborators()
  }

  /**
   * Capture the editor to PNG bytes for external tooling. `scope:
   * 'window'` renders the whole top-level (chrome + sidebars + canvas)
   * via the GSK renderer; `scope: 'canvas'` renders just the engine
   * widget. Returns `null` when nothing renderable is available (e.g.
   * the scene editor isn't open for `'canvas'`, or the window isn't
   * realised yet).
   */
  captureScreenshot(scope: 'window' | 'canvas'): Uint8Array | null {
    if (scope === 'canvas') {
      const engine = this._engineCtl.engine
      if (engine) return captureWidgetPng(engine)
    }
    return captureWidgetPng(this)
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
    void this._loadProjectFromPath(path)
  }

  /**
   * Start hosting a collaboration session — the headless equivalent of
   * the Share dialog's "Share" button (Control D-Bus → MCP). Requires a
   * loaded project; resolves with the room id joiners use. The host's
   * engine must be live (open a scene) by the time a joiner connects.
   */
  async startSession(): Promise<string> {
    if (!this._sessionSvc) throw new Error('Session service not ready (window not mapped yet)')
    if (!this._loadedProject) throw new Error('Open a project before hosting a session')
    return this._sessionSvc.startHosting({
      sessionName: this._loadedProject.projectName,
      projectName: this._loadedProject.projectName,
      hostDisplayName: GLib.get_user_name() ?? 'host',
    })
  }

  /**
   * Join a collaboration session by room id (the headless equivalent of
   * the Welcome view's "Join by code"). The window must be browsing
   * (i.e. on the welcome view) for the LAN path to find the host. The
   * existing `sandbox-project-ready` wiring loads the pulled project;
   * open a scene afterwards to attach the engine.
   */
  async joinSession(roomId: string): Promise<void> {
    if (!this._sessionSvc) throw new Error('Session service not ready (window not mapped yet)')
    await this._sessionSvc.joinByRoomId(roomId)
  }

  /** JSON-safe snapshot of the current collaboration session state. */
  getSessionState(): SessionSnapshot {
    const state = this._sessionSvc?.getState() ?? { kind: 'idle' as const }
    const snap: SessionSnapshot = { kind: state.kind }
    if ('roomId' in state) snap.roomId = state.roomId
    if ('port' in state) snap.port = state.port
    if ('role' in state) snap.role = state.role
    if ('sandboxProjectPath' in state) snap.sandboxProjectPath = state.sandboxProjectPath
    return snap
  }

  /**
   * Enumerate the `app.*` and `win.*` actions for external tooling
   * (Control D-Bus → MCP bridge). `Adw.ApplicationWindow` has no
   * GtkApplicationWindow-style auto-export, so this is how a client
   * discovers what {@link activateAction} / {@link changeActionState}
   * can drive.
   */
  listActions(): ActionList {
    return { app: this._describeActions('app'), win: this._describeActions('win') }
  }

  /**
   * Activate an action by scope + name, optionally with a parameter.
   * The parameter `GLib.Variant` is built from the action's declared
   * parameter type, so a plain JS value is enough.
   */
  activateAction(scope: ActionScope, name: string, value?: unknown): void {
    const group = this._actionGroup(scope)
    if (!group) throw new Error(`No '${scope}' action group`)
    if (!group.has_action(name)) throw new Error(`Unknown action ${scope}.${name}`)
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
    const group = this._actionGroup(scope)
    if (!group) throw new Error(`No '${scope}' action group`)
    if (!group.has_action(name)) throw new Error(`Unknown action ${scope}.${name}`)
    group.change_action_state(name, buildVariant(group.get_action_state_type(name), value))
  }

  private _actionGroup(scope: ActionScope): Gio.ActionGroup | null {
    if (scope === 'app') return this.get_application()
    return this._winActions
  }

  private _describeActions(scope: ActionScope): ActionDescriptor[] {
    const group = this._actionGroup(scope)
    if (!group) return []
    return group
      .list_actions()
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        name,
        enabled: group.get_action_enabled(name),
        parameterType: group.get_action_parameter_type(name)?.dup_string() ?? null,
        stateType: group.get_action_state_type(name)?.dup_string() ?? null,
      }))
  }
}

/**
 * Build a `GLib.Variant` for an action parameter/state from a plain JS
 * value, using the action's declared type when known and otherwise
 * inferring from the JS runtime type.
 */
function buildVariant(type: GLib.VariantType | null, value: unknown): GLib.Variant {
  switch (type?.dup_string() ?? null) {
    case 's':
      return GLib.Variant.new_string(String(value))
    case 'b':
      return GLib.Variant.new_boolean(Boolean(value))
    case 'i':
      return GLib.Variant.new_int32(Number(value))
    case 'u':
      return GLib.Variant.new_uint32(Number(value))
    case 'd':
      return GLib.Variant.new_double(Number(value))
  }
  if (typeof value === 'string') return GLib.Variant.new_string(value)
  if (typeof value === 'boolean') return GLib.Variant.new_boolean(value)
  if (typeof value === 'number') {
    return Number.isInteger(value) ? GLib.Variant.new_int32(value) : GLib.Variant.new_double(value)
  }
  throw new Error(`Cannot build a GLib.Variant from ${typeof value}`)
}

GObject.type_ensure(ApplicationWindow.$gtype)

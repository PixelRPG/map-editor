import type Gdk from '@girs/gdk-4.0'
import type Gtk from '@girs/gtk-4.0'
import type { Engine } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import type { CollaboratorEntry } from '@pixelrpg/gjs'
import type { CollabIdentityService } from './collab-identity.service.ts'
import type { CollabSession } from './collab-session.ts'
import type { DiscoveredService } from './lan-discovery-parse.ts'
import { connectionIndicator, type ConnectionIndicator } from './connection-indicator.ts'
import { LanSessionBackend } from './lan-session-backend.ts'
import { generatePeerId, SessionService, type SessionState } from './session-service.ts'
import { TogetherController } from './together-controller.ts'

/** What pair-editing needs from the window that hosts it. */
export interface SessionCoordinatorContext {
  /** The live core engine, or `null` before any scene has been opened. */
  getEngine(): Engine | null
  showToast(message: string): void
  /** The loaded project's display name, or `null` when none is open. */
  getProjectName(): string | null
  /** Modal parent + clipboard owner for the Together dialog. */
  getParentWindow(): Gtk.Widget
  getDisplay(): Gdk.Display | null
  /** A LAN host appeared / vanished — the welcome view lists them. */
  addDiscoveredService(service: DiscoveredService): void
  removeDiscoveredService(name: string): void
  /** The host's project was pulled into a per-room sandbox directory. */
  onSandboxProjectReady(projectPath: string): void
  /** Project-op channel: the store broadcasts + applies inbound peer ops. */
  setStoreCollabSession(collab: CollabSession | null): void
  /** Show (or hide, on `none`) the connection chip — REDESIGN.md § 4.7. */
  setConnectionIndicator(indicator: ConnectionIndicator): void
  /** Live roster for the collaborators bar + camera follow. */
  setPresenceSession(collab: CollabSession | null): void
  /** The live roster, AI first, exactly as the roster chip shows it. */
  getParticipants(): CollaboratorEntry[]
  /** peerId → the map that peer is on, already resolved to its name. */
  getPeerLocations(): ReadonlyMap<string, string>
  /** The peer the camera follows, or `null`. */
  getFollowedPeerId(): string | null
  /** Toggle camera-follow, exactly as activating the roster chip's row does. */
  toggleFollow(peerId: string): void
  /** Whether the AI collaborator is paused right now. */
  isAssistantPaused(): boolean
  /** Pause or resume the AI collaborator. */
  setAssistantPaused(paused: boolean): void
  /** The user's chosen name / colour and the two Together switches. */
  getIdentity(): CollabIdentityService
}

/**
 * Owns pair-editing: the {@link SessionService} lifetime, its event
 * subscriptions, the Together dialog, and the wiring that points the engine's
 * assistant-awareness relay + the project store + the presence roster at
 * whatever session is live.
 */
export class SessionCoordinator {
  private _svc: SessionService | null = null
  /** Closes the link-blip subscription of the session shown right now. */
  private _linkUnsub: (() => void) | null = null
  /** Drained atomically on `stop()` — every subscription opened by `start()`. */
  private _unsubscribes: Array<() => void> = []
  private readonly _together: TogetherController
  /**
   * The local peer id. Generated once here (the service takes it at
   * construction) and read back by Together, which has to add the local
   * user to the roster itself: awareness carries everyone BUT us.
   */
  private readonly _peerId = generatePeerId()

  constructor(private readonly ctx: SessionCoordinatorContext) {
    this._together = new TogetherController({
      getSessionService: () => this._svc,
      getProjectName: () => this.ctx.getProjectName(),
      showToast: (message) => this.ctx.showToast(message),
      getParentWindow: () => this.ctx.getParentWindow(),
      getDisplay: () => this.ctx.getDisplay(),
      getHostDisplayName: () => this.ctx.getIdentity().displayName,
      getSelfPeerId: () => this._peerId,
      getParticipants: () => this.ctx.getParticipants(),
      getPeerLocations: () => this.ctx.getPeerLocations(),
      getFollowedPeerId: () => this.ctx.getFollowedPeerId(),
      toggleFollow: (peerId) => this.ctx.toggleFollow(peerId),
      isAssistantPaused: () => this.ctx.isAssistantPaused(),
      setAssistantPaused: (paused) => this.ctx.setAssistantPaused(paused),
      getIdentity: () => this.ctx.getIdentity(),
      registerSessionUnsub: (unsub) => this._unsubscribes.push(unsub),
    })
  }

  /**
   * Construct the service (once) and (re)open its subscriptions. The
   * engine provider is lazy: welcome-view discovery works without a
   * project, and joining rejects until an engine is available.
   */
  start(): void {
    // The colour default is a hash of the peer id, so the identity
    // service cannot answer `colour` until it knows ours. Here and not
    // in the constructor: this coordinator is a field initializer of the
    // window, which runs before the window's own constructor body has
    // assigned the identity service.
    this.ctx.getIdentity().setPeerId(this._peerId)
    if (!this._svc) {
      this._svc = new SessionService(
        () => this.ctx.getEngine(),
        new LanSessionBackend(),
        this._peerId,
        // snapshotTimeoutMs, peerConnectTimeoutMs, rtcFactory — all
        // production defaults; only tests override them.
        undefined,
        undefined,
        undefined,
        () => {
          const identity = this.ctx.getIdentity()
          return { displayName: identity.displayName, color: identity.colour }
        },
      )
    }
    const svc = this._svc
    // SessionService is not a GObject, so its unsubscribe closures go in
    // this list rather than the window's `SignalScope`.
    this._unsubscribes = [
      svc.on('service-discovered', (service) => this.ctx.addDiscoveredService(service)),
      svc.on('service-gone', (name) => this.ctx.removeDiscoveredService(name)),
      svc.on('error', (err) => this.ctx.showToast(_(`Session error: ${err.message}`))),
      svc.on('sandbox-project-ready', (event) => this.ctx.onSandboxProjectReady(event.sandboxProjectPath)),
      svc.on('state-changed', (state) => this._wireSession(state)),
    ]
  }

  /** The local peer id — the awareness roster carries everyone but us. */
  get selfPeerId(): string {
    return this._peerId
  }

  /** Whether the service exists yet — it is built on the window's first map. */
  get isReady(): boolean {
    return this._svc != null
  }

  stop(): void {
    for (const dispose of this._unsubscribes) dispose()
    this._unsubscribes = []
    this._linkUnsub?.()
    this._linkUnsub = null
    this._svc?.stopBrowsing()
  }

  /**
   * mDNS pings every couple of seconds, so browsing is tied to the
   * welcome view being visible rather than left running while editing.
   */
  setBrowsing(enabled: boolean): void {
    if (!this._svc) return
    if (enabled) this._svc.startBrowsing()
    else this._svc.stopBrowsing()
  }

  /** Open Together (REDESIGN.md § 4.7). */
  presentTogether(): void {
    this._together.present()
  }

  /**
   * Open Together and join `roomId` — the `pixelrpg://join/<code>` deep
   * link's landing surface. Following the link is the consent, so this
   * joins straight away and shows the handshake.
   */
  presentTogetherForJoin(roomId: string): void {
    this._together.presentForJoin(roomId)
  }

  /**
   * Re-render Together from the live roster. The window calls this
   * wherever it refreshes the roster chip: presence changes are not
   * session-state changes, so the dialog's own `state-changed`
   * subscription would leave a stale "where they are" on screen.
   */
  refreshTogether(): void {
    this._together.refresh()
  }

  /** Drop the dialog's handlers. Called from the window's teardown. */
  release(): void {
    this._together.release()
  }

  /**
   * Re-announce our presence after the user renamed or recoloured
   * themselves in Preferences, so the roster everyone else sees follows.
   * A no-op without a live session — the next `CollabSession` reads the
   * identity at construction anyway.
   */
  refreshLocalIdentity(): void {
    const identity = this.ctx.getIdentity()
    this.activeCollab()?.awareness.setLocalInfo({
      displayName: identity.displayName,
      color: identity.colour,
    })
    this.refreshTogether()
  }

  /**
   * Join a discovered LAN session. No local project needed — the service
   * pulls the host's snapshot into a sandbox and emits
   * `sandbox-project-ready`, which the window loads.
   */
  async joinLan(service: DiscoveredService): Promise<void> {
    this.ctx.showToast(_(`Joining ${service.txt.project ?? service.name}…`))
    try {
      await this._svc?.joinLan(service)
    } catch (err) {
      this.ctx.showToast(_(`Could not join: ${(err as Error).message}`))
    }
  }

  async joinByRoomId(roomId: string): Promise<void> {
    this.ctx.showToast(_(`Joining room ${roomId}…`))
    try {
      await this._svc?.joinByRoomId(roomId)
    } catch (err) {
      this.ctx.showToast(_(`Could not join: ${(err as Error).message}`))
    }
  }

  /**
   * Attach the live engine to a session that is waiting for one. Safe to
   * call on every scene-editor entry:
   *   - no session / host / already attached → no-op
   *   - joiner waiting                       → attach + flip to `connected`
   *
   * Without it a joiner who joined before opening any scene stays
   * un-attached: their own paints never reach the op channel and inbound
   * ops have no `applyInbound` to route through — sync is structurally
   * dead even when the transport works.
   */
  attachEngineIfAwaiting(): void {
    if (!this._svc) return
    if (this._svc.getState().kind !== 'awaiting-engine') return
    const engine = this.ctx.getEngine()
    if (!engine) return
    try {
      this._svc.attachEngineToCurrentSession(engine)
      this.ctx.showToast(_('Live editing — your changes sync with the host.'))
    } catch (err) {
      console.warn('[SessionCoordinator] attachEngineToCurrentSession failed:', err)
      this.ctx.showToast(_('Could not start live sync — see logs.'))
    }
  }

  /** Re-point the relay + store + roster at the live session (idempotent). */
  refreshWiring(): void {
    if (this._svc) this._wireSession(this._svc.getState())
  }

  async startHosting(sessionName: string): Promise<string> {
    if (!this._svc) throw new Error('Session service not ready (window not mapped yet)')
    return this._svc.startHosting({
      sessionName,
      projectName: sessionName,
      hostDisplayName: this.ctx.getIdentity().displayName,
      publishLocally: this.ctx.getIdentity().visibleNearby,
    })
  }

  async join(roomId: string): Promise<void> {
    if (!this._svc) throw new Error('Session service not ready (window not mapped yet)')
    await this._svc.joinByRoomId(roomId)
  }

  async leave(reason: string): Promise<void> {
    await this._svc?.leaveSession(reason)
  }

  getState(): SessionState | null {
    return this._svc?.getState() ?? null
  }

  /** The live `CollabSession` (host or joiner), else `null`. */
  activeCollab(): CollabSession | null {
    const state = this._svc?.getState()
    return state && 'collab' in state ? state.collab : null
  }

  /**
   * Point everything that cares at `state`'s session (or clear it when
   * the session goes idle). The AI's *edits* already propagate via the
   * shared op-log; the relay carries its awareness frames so a remote
   * human sees the AI cursor too (ai-collaborator.md, Phase 5).
   */
  private _wireSession(state: SessionState): void {
    const collab = 'collab' in state ? state.collab : null

    this.ctx.getEngine()?.setAssistantFrameRelay(collab ? (frame) => collab.awareness.relay(frame) : null)

    // Project-level sync works without an engine — cast/library editing
    // has no live scene. The store broadcasts every project-level
    // mutation and is the single applier of inbound peer ops.
    this.ctx.setStoreCollabSession(collab)
    this.ctx.setPresenceSession(collab)

    this._linkUnsub?.()
    this._linkUnsub = null
    const show = () =>
      this.ctx.setConnectionIndicator(connectionIndicator(state, collab?.peer.isReconnecting() ?? false))
    if (collab) {
      const sub = collab.peer.events.on('link-changed', show)
      this._linkUnsub = () => sub.close()
    }
    show()
  }
}

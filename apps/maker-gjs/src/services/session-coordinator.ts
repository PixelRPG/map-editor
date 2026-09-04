import type Gdk from '@girs/gdk-4.0'
import type Gtk from '@girs/gtk-4.0'
import type { Engine } from '@pixelrpg/engine'
import GLib from '@girs/glib-2.0'
import { gettext as _ } from 'gettext'
import type { CollabSession } from './collab-session.ts'
import type { DiscoveredService } from './lan-discovery-parse.ts'
import { LanSessionBackend } from './lan-session-backend.ts'
import { generatePeerId, SessionService, type SessionState } from './session-service.ts'
import { ShareSessionController } from './share-session-controller.ts'

/** What pair-editing needs from the window that hosts it. */
export interface SessionCoordinatorContext {
  /** The live core engine, or `null` before any scene has been opened. */
  getEngine(): Engine | null
  showToast(message: string): void
  /** The loaded project's display name, or `null` when none is open. */
  getProjectName(): string | null
  /** Modal parent + clipboard owner for the Share dialog. */
  getParentWindow(): Gtk.Widget
  getDisplay(): Gdk.Display | null
  /** A LAN host appeared / vanished — the welcome view lists them. */
  addDiscoveredService(service: DiscoveredService): void
  removeDiscoveredService(name: string): void
  /** The host's project was pulled into a per-room sandbox directory. */
  onSandboxProjectReady(projectPath: string): void
  /** Project-op channel: the store broadcasts + applies inbound peer ops. */
  setStoreCollabSession(collab: CollabSession | null): void
  /** Live roster for the collaborators bar + camera follow. */
  setPresenceSession(collab: CollabSession | null): void
}

/**
 * Owns pair-editing: the {@link SessionService} lifetime, its event
 * subscriptions, the Share dialog, and the wiring that points the engine's
 * assistant-awareness relay + the project store + the presence roster at
 * whatever session is live.
 */
export class SessionCoordinator {
  private _svc: SessionService | null = null
  /** Drained atomically on `stop()` — every subscription opened by `start()`. */
  private _unsubscribes: Array<() => void> = []
  private readonly _share: ShareSessionController

  constructor(private readonly ctx: SessionCoordinatorContext) {
    this._share = new ShareSessionController({
      getSessionService: () => this._svc,
      getProjectName: () => this.ctx.getProjectName(),
      showToast: (message) => this.ctx.showToast(message),
      getParentWindow: () => this.ctx.getParentWindow(),
      getDisplay: () => this.ctx.getDisplay(),
      getHostDisplayName: () => GLib.get_user_name() ?? 'host',
      registerSessionUnsub: (unsub) => this._unsubscribes.push(unsub),
    })
  }

  /**
   * Construct the service (once) and (re)open its subscriptions. The
   * engine provider is lazy: welcome-view discovery works without a
   * project, and joining rejects until an engine is available.
   */
  start(): void {
    if (!this._svc) {
      this._svc = new SessionService(() => this.ctx.getEngine(), new LanSessionBackend(), generatePeerId())
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

  /** Whether the service exists yet — it is built on the window's first map. */
  get isReady(): boolean {
    return this._svc != null
  }

  stop(): void {
    for (const dispose of this._unsubscribes) dispose()
    this._unsubscribes = []
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

  /** Open the Share dialog. */
  presentShareDialog(): void {
    this._share.present()
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
      hostDisplayName: GLib.get_user_name() ?? 'host',
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
  }
}

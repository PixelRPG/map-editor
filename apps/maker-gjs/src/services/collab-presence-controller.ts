import { ASSISTANT_PEER_ID, type AwarenessPeerState } from '@pixelrpg/engine'
import type { CollaboratorEntry } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import type { AssistantStateService } from './assistant-state.service.ts'
import type { CollabSession } from './collab-session.ts'
import { buildParticipantRoster } from './participant-roster.ts'

/** The slice of the live engine (`engine.excalibur`) the controller drives. */
export interface CollabPresenceEngine {
  setAssistantCursor(tileX: number, tileY: number): boolean
  setAssistantInfo(displayName: string, color: string): void
  hideAssistant(): void
  setFollowAssistant(follow: boolean): void
  panCameraTo(worldX: number, worldY: number): void
  stopCameraFollow(): void
}

/** What the controller needs from its host (the {@link ApplicationWindow}). */
export interface CollabPresenceHost {
  /** The live engine assistant/camera surface, or `null` without a live scene. */
  getEngine(): CollabPresenceEngine | null
  /** The active `CollabSession` (host or joiner), or `null` when solo. */
  getActiveCollab(): CollabSession | null
  /** The shared single-source-of-truth assistant state (presence/identity/pause). */
  readonly assistantState: AssistantStateService
  /** Push the roster + followed peer into the collaborators bar (scene-editor view). */
  setCollaboratorsOnView(participants: CollaboratorEntry[], followedPeerId: string | null): void
  /** Surface a transient message to the user (a toast). */
  showToast(message: string): void
}

/**
 * Owns the maker's collaboration-presence surface — the AI-assistant
 * cursor/identity, the collaborators-bar roster, camera-follow, and the
 * live-session awareness subscriptions. Extracted out of the
 * `ApplicationWindow` god-object so the window stays a thin coordinator
 * (ApplicationWindow split, step 3).
 *
 * Injected host accessors keep it reading the window's live state. The
 * window's public `setAssistant*` / `followParticipant` / `getParticipants`
 * API (driven by the Control/MCP plane) delegates here unchanged; session
 * wiring calls {@link attachSession} when a session opens/closes.
 */
export class CollabPresenceController {
  private _announced = false
  private _followedPeerId: string | null = null
  /** Subscriptions to the live session awareness — torn down on session change. */
  private _awarenessUnsubs: Array<() => void> = []
  /** peerIds currently shown in the collaborators bar — to skip rebuilds on cursor-only ticks. */
  private _renderedPeerIds = new Set<string>()

  constructor(private readonly host: CollabPresenceHost) {}

  // ── AI-assistant presence surface (driven by the Control/MCP plane) ──

  /** Whether the user has paused the assistant (read by the Control plane's pause guard). */
  isAssistantPaused(): boolean {
    return this.host.assistantState.paused
  }

  /** Show/move the AI-assistant collaborator cursor at tile (x, y). Returns false without an engine. */
  setAssistantCursor(tileX: number, tileY: number): boolean {
    const applied = this.host.getEngine()?.setAssistantCursor(tileX, tileY) ?? false
    if (applied && this.host.assistantState.setPresent(true)) {
      this._announceOnce()
      this.refreshCollaborators()
    }
    return applied
  }

  /**
   * Mark the AI assistant present without moving its cursor. The Control
   * D-Bus surface calls this on every mutating method, so ANY external
   * driver (MCP bridge, scripts) shows up in the participants bar the
   * moment it starts acting — visibility must not depend on the driver
   * announcing itself via `SetAssistantInfo` / `SetAssistantCursor` first.
   */
  ensureAssistantPresence(): void {
    if (!this.host.assistantState.setPresent(true)) return
    // Mirror into the engine (when one is live) so `isAssistantActive`
    // and the participants bar agree about the assistant being around.
    // A later engine recreation re-mirrors via `_syncEngineUiState`.
    this.host.getEngine()?.setAssistantInfo(this.host.assistantState.name, this.host.assistantState.color)
    this._announceOnce()
    this.refreshCollaborators()
  }

  /** Set the AI-assistant cursor's display name + colour. */
  setAssistantInfo(displayName: string, color: string): void {
    this.host.getEngine()?.setAssistantInfo(displayName, color)
    this.host.assistantState.setInfo(displayName, color)
    if (this.host.assistantState.setPresent(true)) this._announceOnce()
    this.refreshCollaborators()
  }

  /** Remove the AI-assistant cursor/presence. */
  hideAssistant(): void {
    this.host.getEngine()?.hideAssistant()
    this.host.assistantState.setPresent(false)
    this._announced = false
    if (this._followedPeerId === ASSISTANT_PEER_ID) this._setFollowedPeer(null)
    this.refreshCollaborators()
  }

  /**
   * Announce the FIRST assistant activation with a toast — a clear,
   * consent-style "an AI is now acting here" cue (not a silent takeover).
   * Re-armed on {@link hideAssistant}.
   */
  private _announceOnce(): void {
    if (this._announced) return
    this._announced = true
    this.host.showToast(_('AI assistant is now editing with you'))
  }

  // ── Collaborators-bar roster + camera-follow ──

  /**
   * The live participant roster: the local AI assistant (if present) +
   * every networked peer from the session awareness. A relayed AI on a
   * joiner arrives as a session peer with `ASSISTANT_PEER_ID` — flagged
   * `isAI`. Shared by the collaborators bar + `getDebugStatus`.
   */
  getParticipants(): CollaboratorEntry[] {
    const assistant = this.host.assistantState
    return buildParticipantRoster(
      assistant.present ? { name: assistant.name, color: assistant.color } : null,
      this.host.getActiveCollab()?.awareness.getPeers() ?? [],
      ASSISTANT_PEER_ID,
    )
  }

  /** Rebuild the collaborators bar from the live roster. */
  refreshCollaborators(): void {
    const participants = this.getParticipants()
    this._renderedPeerIds = new Set(participants.map((p) => p.peerId))
    this.host.setCollaboratorsOnView(participants, this._followedPeerId)
  }

  /** Toggle camera-follow for the clicked participant (clicking the followed one stops following). */
  onParticipantActivated(peerId: string): void {
    this.followParticipant(this._followedPeerId === peerId ? null : peerId)
  }

  /**
   * Follow `peerId` with the camera (pass `null` to stop). Public so the
   * Control interface can drive it too; chip clicks route through here via
   * {@link onParticipantActivated}.
   */
  followParticipant(peerId: string | null): void {
    this._setFollowedPeer(peerId)
    // Jump straight to a followed human peer's current cursor (the engine
    // self-pans for the AI).
    if (peerId && peerId !== ASSISTANT_PEER_ID) {
      const peer = this.host.getActiveCollab()?.awareness.getPeer(peerId)
      if (peer?.cursor) this.host.getEngine()?.panCameraTo(peer.cursor.x, peer.cursor.y)
    }
    this.refreshCollaborators()
  }

  /** The currently-followed participant peerId, or null. */
  get followedPeerId(): string | null {
    return this._followedPeerId
  }

  private _setFollowedPeer(peerId: string | null): void {
    this._followedPeerId = peerId
    const engine = this.host.getEngine()
    // The engine pans itself for the AI (it owns the AI cursor); human
    // peers are panned from `onPeerChanged` as their cursors arrive.
    engine?.setFollowAssistant(peerId === ASSISTANT_PEER_ID)
    // Stop the smooth glide when following no one.
    if (!peerId) engine?.stopCameraFollow()
  }

  /** A session peer's awareness changed — pan if it's the followed one; rebuild only on roster changes. */
  private _onPeerChanged(peer: AwarenessPeerState): void {
    if (peer.peerId === this._followedPeerId && peer.peerId !== ASSISTANT_PEER_ID && peer.cursor) {
      this.host.getEngine()?.panCameraTo(peer.cursor.x, peer.cursor.y)
    }
    if (!this._renderedPeerIds.has(peer.peerId)) this.refreshCollaborators()
  }

  /** A session peer left — drop follow if it was followed, rebuild the bar. */
  private _onPeerLeft(peerId: string): void {
    if (this._followedPeerId === peerId) this._setFollowedPeer(null)
    this.refreshCollaborators()
  }

  /**
   * (Re)bind to a session's awareness roster — called by the window's
   * session-wiring when a session opens (`collab`) or closes (`null`).
   * Tears down the previous subscriptions first, then either subscribes to
   * the new session's peer-changed/peer-left or, on close, stops following
   * a now-gone human peer. Ends by refreshing the bar.
   */
  attachSession(collab: CollabSession | null): void {
    for (const unsub of this._awarenessUnsubs) unsub()
    this._awarenessUnsubs = []
    if (collab) {
      this._awarenessUnsubs.push(collab.awareness.on('peer-changed', (peer) => this._onPeerChanged(peer)))
      this._awarenessUnsubs.push(collab.awareness.on('peer-left', ({ peerId }) => this._onPeerLeft(peerId)))
    } else if (this._followedPeerId && this._followedPeerId !== ASSISTANT_PEER_ID) {
      // Session ended — stop following a (now-gone) human peer.
      this._setFollowedPeer(null)
    }
    this.refreshCollaborators()
  }
}

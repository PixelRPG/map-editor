import type Gdk from '@girs/gdk-4.0'
import type Gtk from '@girs/gtk-4.0'
import type { CollaboratorEntry } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import { TogetherDialog } from '../widgets/together-dialog.ts'
import type { CollabIdentityService } from './collab-identity.service.ts'
import { buildPixelrpgJoinUrl } from './pixelrpg-url.ts'
import type { SessionService } from './session-service.ts'
import { buildTogetherPresentation } from './together-model.ts'

/**
 * The invite link for a room, or `null` when no valid link exists.
 *
 * A host's room id comes from `generateRoomId` and always builds, but a
 * joiner's arrived off the wire or out of a typed code, and
 * `buildPixelrpgJoinUrl` throws rather than hand out a link that would
 * not parse. Together shows the code regardless and just dims Copy.
 */
function safeJoinUrl(roomId: string): string | null {
  try {
    return buildPixelrpgJoinUrl(roomId)
  } catch {
    return null
  }
}

/** What the {@link TogetherController} needs from its host (the `ApplicationWindow`). */
export interface TogetherHost {
  /** The session orchestrator, or `null` until the window is mapped. */
  getSessionService(): SessionService | null
  /** The loaded project's display name, or `null` when no project is open. */
  getProjectName(): string | null
  /** Surface a transient message to the user (a toast). */
  showToast(message: string): void
  /** The widget the dialog is parented to (the window). */
  getParentWindow(): Gtk.Widget
  /** The `Gdk.Display` for clipboard access, or `null` if unrealised. */
  getDisplay(): Gdk.Display | null
  /** Static host display name for the mDNS TXT record. */
  getHostDisplayName(): string
  /** The local peer id — the roster carries everyone BUT us. */
  getSelfPeerId(): string
  /** The live roster, AI first, exactly as the roster chip shows it. */
  getParticipants(): CollaboratorEntry[]
  /** peerId → the map that peer is on, already resolved to its name. */
  getPeerLocations(): ReadonlyMap<string, string>
  /** The peer the camera follows, or `null`. */
  getFollowedPeerId(): string | null
  /** Toggle camera-follow, exactly as clicking the roster chip's row does. */
  toggleFollow(peerId: string): void
  /** Whether the AI collaborator is paused right now. */
  isAssistantPaused(): boolean
  /** Pause or resume the AI collaborator. */
  setAssistantPaused(paused: boolean): void
  /** The user's chosen name / colour and the two Together switches. */
  getIdentity(): CollabIdentityService
  /**
   * Hand a session-event unsubscribe back to the host so the window's
   * single teardown list drains it on unmap. Together's `state-changed`
   * subscription lives for the window's lifetime exactly like the other
   * SessionService subscriptions, so it belongs in the same (atomic)
   * drain rather than a separate controller lifecycle.
   */
  registerSessionUnsub(unsub: () => void): void
}

/**
 * Owns the Together dialog (REDESIGN.md § 4.7) — presence, invite and
 * stop-sharing in one surface.
 *
 * Successor to `ShareSessionController`, which drove a dialog whose
 * three pages were the session machine's own states. The difference is
 * not cosmetic: Together is live, so it has to be re-rendered on roster
 * changes as well as on session-state changes, which is why
 * {@link refresh} exists and why the window calls it from the same place
 * it refreshes the roster chip. Everything the dialog shows comes out of
 * `together-model.ts` (unit-tested, GTK-free); this class is the wiring.
 */
export class TogetherController {
  private _dialog: TogetherDialog | null = null
  /** Guards the nearby switch against the write our own sync performs. */
  private _syncing = false

  constructor(private readonly host: TogetherHost) {}

  /**
   * Open Together. Built lazily on first call and kept for the window's
   * lifetime — re-presenting after a `closed` is a no-op on an
   * `Adw.Dialog` that is still mapped, and keeps the dialog's scroll
   * position between visits.
   *
   * Unlike the Share dialog this does NOT refuse without a project: who
   * is here and what your colour is are answerable at any time, and the
   * solo page says what is missing. Only *starting* a share needs one.
   */
  present(): void {
    const dialog = this._ensureDialog()
    if (!dialog) return
    this.refresh()
    dialog.present(this.host.getParentWindow())
  }

  /**
   * Open Together for a `pixelrpg://join/<code>` deep link and join that
   * room (REDESIGN.md § 3.4). Following the link IS the consent, so this
   * joins rather than parking the code in a field the user then has to
   * confirm — and Together shows the handshake while it runs.
   */
  presentForJoin(roomId: string): void {
    this.present()
    const svc = this.host.getSessionService()
    if (!svc) {
      this.host.showToast(_('Not ready to join yet — try again in a moment.'))
      return
    }
    void svc.joinByRoomId(roomId).catch((err) => {
      this.host.showToast(_('Could not join: %s').replace('%s', (err as Error).message))
      this.refresh()
    })
  }

  /** Re-render from the live session + roster. Cheap when the dialog was never opened. */
  refresh(): void {
    const dialog = this._dialog
    if (!dialog) return
    const state = this.host.getSessionService()?.getState() ?? { kind: 'idle' }
    const identity = this.host.getIdentity()
    const view = buildTogetherPresentation({
      session: {
        kind: state.kind,
        roomId: 'roomId' in state ? state.roomId : undefined,
        role: 'role' in state ? state.role : undefined,
      },
      projectName: this.host.getProjectName(),
      selfPeerId: this.host.getSelfPeerId(),
      selfName: identity.displayName,
      selfColor: identity.colour,
      participants: this.host.getParticipants(),
      followedPeerId: this.host.getFollowedPeerId(),
      locations: this.host.getPeerLocations(),
      shareUrlFor: safeJoinUrl,
    })
    this._syncing = true
    try {
      dialog.nearbyRow.set_active(identity.visibleNearby)
      dialog.sync(view, this.host.isAssistantPaused())
    } finally {
      this._syncing = false
    }
  }

  /** Drop the dialog's handlers on window teardown. */
  release(): void {
    this._dialog?.release()
  }

  private _ensureDialog(): TogetherDialog | null {
    if (this._dialog) return this._dialog
    const svc = this.host.getSessionService()
    if (!svc) return null

    const dialog = new TogetherDialog()
    dialog.connect('start-requested', () => {
      void this._startShare()
    })
    dialog.connect('stop-requested', () => {
      void this._stopShare()
    })
    dialog.connect('copy-requested', () => {
      const display = this.host.getDisplay()
      if (!display) return
      if (dialog.copyShareUrlToClipboard(display)) this.host.showToast(_('Invite link copied.'))
    })
    dialog.connect('follow-toggled', (_dialog, peerId) => {
      this.host.toggleFollow(peerId)
      this.refresh()
    })
    // Only the pause action, not the preference beside it: the action is
    // the single writer and persists the preference itself, so pausing
    // from here, from the primary menu and from the roster chip all end
    // up saying the same thing.
    dialog.connect('assistant-toggled', (_dialog, enabled) => {
      this.host.setAssistantPaused(!enabled)
      this.refresh()
    })
    dialog.nearbyRow.connect('notify::active', () => {
      if (this._syncing) return
      // Takes effect on the NEXT share: `avahi-publish` is bound to the
      // running session, and withdrawing the advertisement mid-session
      // would leave joiners that already resolved it connecting to a
      // session the welcome list no longer shows.
      this.host.getIdentity().visibleNearby = dialog.nearbyRow.get_active()
    })

    // Mirror SessionService state into the dialog so hosting transitions
    // are visible live. Registered into the host's teardown list so it
    // drains with the other session subscriptions.
    this.host.registerSessionUnsub(svc.on('state-changed', () => this.refresh()))

    this._dialog = dialog
    return dialog
  }

  private async _startShare(): Promise<void> {
    const svc = this.host.getSessionService()
    const projectName = this.host.getProjectName()
    if (!svc || projectName == null) {
      this.host.showToast(_('Open a project before sharing it.'))
      return
    }
    try {
      await svc.startHosting({
        sessionName: projectName,
        projectName,
        hostDisplayName: this.host.getHostDisplayName(),
        publishLocally: this.host.getIdentity().visibleNearby,
      })
    } catch (err) {
      this.host.showToast(_('Could not start sharing: %s').replace('%s', (err as Error).message))
    }
    this.refresh()
  }

  private async _stopShare(): Promise<void> {
    const svc = this.host.getSessionService()
    if (!svc) return
    await svc.stopHosting()
    this.host.showToast(_('Stopped sharing.'))
    this.refresh()
  }
}

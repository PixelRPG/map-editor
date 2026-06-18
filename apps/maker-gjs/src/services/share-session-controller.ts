import type Gdk from '@girs/gdk-4.0'
import type Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import { ShareDialog } from '../widgets/share-dialog.ts'
import { buildPixelrpgJoinUrl } from './pixelrpg-url.ts'
import type { SessionService } from './session-service.ts'

/** What the {@link ShareSessionController} needs from its host (the `ApplicationWindow`). */
export interface ShareSessionHost {
  /** The session orchestrator, or `null` until the window is mapped. */
  getSessionService(): SessionService | null
  /** The loaded project's display name, or `null` when no project is open. */
  getProjectName(): string | null
  /** Surface a transient message to the user (a toast). */
  showToast(message: string): void
  /** The widget the modal dialog is parented to (the window). */
  getParentWindow(): Gtk.Widget
  /** The `Gdk.Display` for clipboard access, or `null` if unrealised. */
  getDisplay(): Gdk.Display | null
  /** Static host display name for the mDNS TXT record. */
  getHostDisplayName(): string
  /**
   * Hand a session-event unsubscribe back to the host so the window's
   * single teardown list drains it on unmap. The share dialog's
   * `state-changed` subscription lives for the window's lifetime exactly
   * like the other SessionService subscriptions, so it belongs in the same
   * (atomic) drain — not a separate controller lifecycle.
   */
  registerSessionUnsub(unsub: () => void): void
}

/**
 * Owns the Share dialog lifecycle — the self-contained UI surface the
 * window used to host inline. Extracted out of the `ApplicationWindow`
 * god-object (split, step 4). Build-verify only (GTK-coupled), like the
 * sibling controllers; the session lifecycle itself (the desync-critical
 * `_sessionSvc` / awareness-relay seam) deliberately stays in the window.
 */
export class ShareSessionController {
  private _dialog: ShareDialog | null = null

  constructor(private readonly host: ShareSessionHost) {}

  /**
   * Open the Share dialog (built lazily on first call). The dialog stays
   * alive for the window's lifetime — re-presenting after a `closed` is a
   * no-op since `present(parent)` only takes effect when unmapped.
   */
  present(): void {
    if (!this.host.getProjectName()) {
      this.host.showToast(_('Open a project before sharing it.'))
      return
    }
    const svc = this.host.getSessionService()
    if (!svc) return
    this._ensureDialog(svc)
    this._dialog?.syncWithSession(svc.getState(), buildPixelrpgJoinUrl)
    this._dialog?.present(this.host.getParentWindow())
  }

  private _ensureDialog(svc: SessionService): void {
    if (this._dialog) return

    const dialog = new ShareDialog()

    dialog.connect('share-requested', () => {
      void this._startShare()
    })
    dialog.connect('stop-requested', () => {
      void this._stopShare()
    })
    dialog.connect('copy-link-requested', () => {
      const display = this.host.getDisplay()
      if (!display) return
      if (dialog.copyShareUrlToClipboard(display)) {
        this.host.showToast(_('Share link copied to clipboard.'))
      }
    })

    // Mirror SessionService state into the dialog so the user sees hosting
    // transitions live (URL appears the moment startHosting resolves;
    // status row swaps to "Editing with peer" on connect). Registered into
    // the host's teardown list so it drains with the other session subs.
    this.host.registerSessionUnsub(
      svc.on('state-changed', (state) => dialog.syncWithSession(state, buildPixelrpgJoinUrl)),
    )

    this._dialog = dialog
  }

  private async _startShare(): Promise<void> {
    const svc = this.host.getSessionService()
    const projectName = this.host.getProjectName()
    if (!svc || projectName == null) return
    try {
      const roomId = await svc.startHosting({
        sessionName: projectName,
        projectName,
        hostDisplayName: this.host.getHostDisplayName(),
      })
      this.host.showToast(_(`Sharing as room ${roomId}.`))
    } catch (err) {
      this.host.showToast(_(`Could not start sharing: ${(err as Error).message}`))
    }
  }

  private async _stopShare(): Promise<void> {
    const svc = this.host.getSessionService()
    if (!svc) return
    await svc.stopHosting()
    // syncWithSession flips the dialog back to its idle page via the
    // state-changed subscription wired in _ensureDialog.
    this.host.showToast(_('Stopped sharing.'))
  }
}

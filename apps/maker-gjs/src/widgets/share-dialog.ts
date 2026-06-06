import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { SignalScope } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import type { SessionState } from '../services/session-service.ts'

import Template from './share-dialog.blp'

export type SharePresentationState =
  | { kind: 'idle' }
  | { kind: 'hosting'; shareUrl: string; peerCount: number }
  | { kind: 'connected'; shareUrl: string; peerLabel: string }

/**
 * Modal dialog that walks the user through Pair-Editing hosting.
 *
 * Two visible states — `idle` (call-to-action to start sharing) and
 * `hosting` (link copy + peer status + stop). The same dialog shows
 * the `connected` variant inline: status row swaps to "Editing with
 * <peer>", everything else stays put so closing the dialog leaves
 * the session running.
 *
 * Signals (cheap, action-shaped) — the owning `ApplicationWindow`
 * wires them through to the {@link SessionService}:
 *
 *  - `share-requested` — user clicked **Start Sharing** in the idle
 *    state. Caller is expected to invoke `SessionService.startHosting`
 *    and then push the resulting state via {@link setPresentation}.
 *
 *  - `stop-requested` — user clicked **Stop Sharing** from the
 *    hosting state.
 *
 *  - `copy-link-requested` — user clicked the copy-link button next
 *    to the share URL.
 *
 * Layout & lifecycle live entirely in Blueprint + this thin TS
 * class; no business logic / no network code reaches here. That
 * keeps the dialog Storybook-driveable later on (one
 * `setPresentation` call per fixture).
 */
export class ShareDialog extends Adw.Dialog {
  declare _state_stack: Gtk.Stack
  declare _idle_subtitle: Gtk.Label
  declare _share_button: Gtk.Button
  declare _hosting_status_icon: Gtk.Image
  declare _hosting_status_label: Gtk.Label
  declare _share_link_row: Adw.EntryRow
  declare _copy_link_button: Gtk.Button
  declare _lan_status_row: Adw.ActionRow
  declare _stop_button: Gtk.Button

  private signals = new SignalScope()
  private presentation: SharePresentationState = { kind: 'idle' }

  static {
    GObject.registerClass(
      {
        GTypeName: 'ShareDialog',
        Template,
        InternalChildren: [
          'state_stack',
          'idle_subtitle',
          'share_button',
          'hosting_status_icon',
          'hosting_status_label',
          'share_link_row',
          'copy_link_button',
          'lan_status_row',
          'stop_button',
        ],
        Signals: {
          'share-requested': {},
          'stop-requested': {},
          'copy-link-requested': {},
        },
      },
      ShareDialog,
    )
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._share_button, 'clicked', () => this.emit('share-requested'))
    this.signals.connect(this._stop_button, 'clicked', () => this.emit('stop-requested'))
    this.signals.connect(this._copy_link_button, 'clicked', () => this.emit('copy-link-requested'))
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  /**
   * Push UI state — the dialog stays mounted across SessionService
   * transitions so the user sees the link appear as soon as
   * `startHosting` resolves.
   */
  setPresentation(state: SharePresentationState): void {
    this.presentation = state
    if (state.kind === 'idle') {
      this._state_stack.set_visible_child_name('idle')
      return
    }
    this._state_stack.set_visible_child_name('hosting')
    this._share_link_row.set_text(state.shareUrl)
    if (state.kind === 'hosting') {
      const waiting = state.peerCount === 0
      this._hosting_status_icon.set_from_icon_name('network-transmit-receive-symbolic')
      this._hosting_status_label.set_text(
        waiting ? _('Waiting for a peer to join…') : _('Connected — %d peer(s)').replace('%d', String(state.peerCount)),
      )
      this._lan_status_row.set_subtitle(_('Advertised via Avahi/mDNS'))
    } else {
      this._hosting_status_icon.set_from_icon_name('emblem-shared-symbolic')
      this._hosting_status_label.set_text(_('Editing with %s').replace('%s', state.peerLabel))
      this._lan_status_row.set_subtitle(_('Active — peer connected via local network'))
    }
  }

  /**
   * Translate the {@link SessionService} state machine into the
   * dialog's simpler 3-mode presentation. Called from
   * `application-window.ts` whenever the session bus emits.
   */
  syncWithSession(state: SessionState, shareUrlFor: (roomId: string) => string): void {
    switch (state.kind) {
      case 'idle':
      case 'browsing':
        this.setPresentation({ kind: 'idle' })
        return
      case 'hosting':
        this.setPresentation({ kind: 'hosting', shareUrl: shareUrlFor(state.roomId), peerCount: 0 })
        return
      case 'connecting':
        // Mid-handshake. Keep the previous look so the user doesn't
        // see a flash back to idle — the next `connected` event will
        // refresh it.
        return
      case 'connected':
        if (state.role === 'host') {
          this.setPresentation({
            kind: 'connected',
            shareUrl: shareUrlFor(state.roomId),
            peerLabel: _('a peer'),
          })
          return
        }
        // Joiner side: we don't show the share UI — close the dialog
        // if it's still up, the user came in as guest.
        this.force_close()
        return
    }
  }

  getPresentation(): SharePresentationState {
    return this.presentation
  }

  /**
   * Copy the currently-shown URL to the default clipboard. Returns
   * `false` if the dialog is in the idle state (no URL to copy).
   */
  copyShareUrlToClipboard(display: Gdk.Display): boolean {
    if (this.presentation.kind === 'idle') return false
    const clipboard = display.get_clipboard()
    clipboard.set(this.presentation.shareUrl)
    return true
  }
}

GObject.type_ensure(ShareDialog.$gtype)

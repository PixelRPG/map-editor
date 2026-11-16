import Adw from '@girs/adw-1'
import type Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import { normaliseJoinCode } from '../services/welcome-model.ts'

/**
 * "Join with a code…" from the welcome column's *Play together* section
 * (REDESIGN § 4.1). The LAN list next to it needs no typing; this is
 * its cross-internet counterpart, where a friend sent a room code or a
 * `pixelrpg://join/<id>` link over chat.
 *
 * An `Adw.AlertDialog` rather than a composite template, like
 * `world/map-dialogs.ts`: a single throwaway field with no state worth
 * keeping between presentations. What counts as a code is
 * {@link normaliseJoinCode}, which has its own spec.
 *
 * `onJoin` runs with a validated room id. An empty or malformed entry
 * keeps the dialog open so the pasted text can be corrected, rather
 * than closing and silently doing nothing.
 */
export function presentJoinByCodeDialog(parent: Gtk.Widget, onJoin: (roomId: string) => void): void {
  const dialog = new Adw.AlertDialog({
    heading: _('Join a game'),
    body: _('Paste the code or link a friend sent you.'),
  })

  const codeRow = new Adw.EntryRow({ title: _('Code or link') })
  const group = new Adw.PreferencesGroup()
  group.add(codeRow)
  dialog.set_extra_child(group)

  dialog.add_response('cancel', _('Cancel'))
  dialog.add_response('join', _('Join'))
  dialog.set_response_appearance('join', Adw.ResponseAppearance.SUGGESTED)
  dialog.set_default_response('join')
  dialog.set_close_response('cancel')

  // The Join response stays insensitive until the text can be a room
  // id, so a typo is visible before the dialog closes.
  const refresh = () => dialog.set_response_enabled('join', normaliseJoinCode(codeRow.get_text()) !== null)
  codeRow.connect('changed', refresh)
  refresh()

  dialog.connect('response', (_d: Adw.AlertDialog, response: string) => {
    if (response !== 'join') return
    const roomId = normaliseJoinCode(codeRow.get_text())
    if (roomId) onJoin(roomId)
  })

  dialog.present(parent)
}

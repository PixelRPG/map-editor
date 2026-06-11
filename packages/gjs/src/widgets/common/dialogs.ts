import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

/** Options for {@link confirmDestructive}. */
export interface ConfirmDestructiveOptions {
  /** Dialog heading, e.g. `_('Delete tileset?')`. */
  heading: string
  /** Dialog body — pass usage-aware copy here when the caller has it. */
  body: string
  /** Label of the destructive response. Defaults to a translated "Delete". */
  destructiveLabel?: string
  /** Label of the cancel response. Defaults to a translated "Cancel". */
  cancelLabel?: string
}

/**
 * Present a destructive-confirm `Adw.AlertDialog` (cancel + destructive
 * response) over `parent` and resolve with the user's choice.
 *
 * Encodes the dialog policy once: the cancel response is both the
 * default response (Enter must not destroy) and the close response
 * (Escape / close = cancel), and the confirm response carries the
 * DESTRUCTIVE appearance per the GNOME HIG.
 *
 * @returns `true` when the destructive response was chosen, `false` on
 *   cancel / close.
 */
export function confirmDestructive(parent: Gtk.Widget, options: ConfirmDestructiveOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = new Adw.AlertDialog({ heading: options.heading, body: options.body })
    dialog.add_response('cancel', options.cancelLabel ?? _('Cancel'))
    dialog.add_response('confirm', options.destructiveLabel ?? _('Delete'))
    dialog.set_response_appearance('confirm', Adw.ResponseAppearance.DESTRUCTIVE)
    dialog.set_default_response('cancel')
    dialog.set_close_response('cancel')
    dialog.connect('response', (_d: Adw.AlertDialog, response: string) => resolve(response === 'confirm'))
    dialog.present(parent)
  })
}

/** Options for {@link promptRename}. */
export interface PromptRenameOptions {
  /** Dialog heading, e.g. `_('Rename tileset')`. */
  heading: string
  /** Current name, pre-filled into the entry. */
  current: string
  /** Label of the confirm response. Defaults to a translated "Rename". */
  confirmLabel?: string
  /** Label of the cancel response. Defaults to a translated "Cancel". */
  cancelLabel?: string
}

/**
 * Present a rename-prompt `Adw.AlertDialog` (a `Gtk.Entry` pre-filled
 * with the current name) over `parent` and resolve with the new name.
 *
 * The confirm response is SUGGESTED and the default (the entry
 * activates it via Enter); Escape / close cancels.
 *
 * @returns the trimmed new name, or `null` when cancelled or left blank.
 */
export function promptRename(parent: Gtk.Widget, options: PromptRenameOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const entry = new Gtk.Entry({ text: options.current, activatesDefault: true })
    const dialog = new Adw.AlertDialog({ heading: options.heading, extraChild: entry })
    dialog.add_response('cancel', options.cancelLabel ?? _('Cancel'))
    dialog.add_response('rename', options.confirmLabel ?? _('Rename'))
    dialog.set_response_appearance('rename', Adw.ResponseAppearance.SUGGESTED)
    dialog.set_default_response('rename')
    dialog.set_close_response('cancel')
    dialog.connect('response', (_d: Adw.AlertDialog, response: string) => {
      const name = entry.get_text().trim()
      resolve(response === 'rename' && name ? name : null)
    })
    dialog.present(parent)
  })
}

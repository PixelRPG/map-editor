import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { CREDIT_ROLES, type CreditRole } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import { type CreditDraft, creditDraftProblems } from '../../services/credits-edit.ts'

/** Translated label per role; a closed set, so every role has one. */
export const CREDIT_ROLE_LABELS: Record<CreditRole, () => string> = {
  art: () => _('Pictures'),
  sound: () => _('Sound effects'),
  music: () => _('Music'),
  story: () => _('Story'),
  code: () => _('Code'),
  other: () => _('Something else'),
}

const DIALOG_WIDTH = 420

/**
 * Present the add / edit form for one credit. `onSave` gets the validated
 * draft; `onRemove` is given only when an existing entry is being edited.
 * Built imperatively like the other Game-page dialogs: a throwaway form.
 */
export function presentCreditDialog(
  parent: Gtk.Widget,
  options: { readonly title: string; readonly draft: CreditDraft; readonly saveLabel: string },
  onSave: (draft: CreditDraft) => void,
  onRemove: (() => void) | null,
): Adw.Dialog {
  const draft: CreditDraft = { ...options.draft }

  const nameRow = new Adw.EntryRow({ title: _('Who or what'), text: draft.name })
  const roleRow = new Adw.ComboRow({
    title: _('They made'),
    model: Gtk.StringList.new(CREDIT_ROLES.map((role) => CREDIT_ROLE_LABELS[role]())),
    selected: Math.max(0, CREDIT_ROLES.indexOf(draft.role)),
  })
  const licenseRow = new Adw.EntryRow({ title: _('Licence'), text: draft.license })
  const urlRow = new Adw.EntryRow({ title: _('Web address'), text: draft.url, inputPurpose: Gtk.InputPurpose.URL })

  const group = new Adw.PreferencesGroup()
  for (const row of [nameRow, roleRow, licenseRow, urlRow]) group.add(row)

  const urlHint = new Gtk.Label({
    label: _('A web address starts with http:// or https://'),
    xalign: 0,
    wrap: true,
    visible: false,
    marginStart: 12,
    marginEnd: 12,
  })
  urlHint.add_css_class('error')
  urlHint.add_css_class('caption')

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12,
    marginTop: 12,
    marginBottom: 24,
    marginStart: 12,
    marginEnd: 12,
  })
  box.append(group)
  box.append(urlHint)

  const dialog = new Adw.Dialog({ title: options.title, contentWidth: DIALOG_WIDTH })

  if (onRemove) {
    const removeGroup = new Adw.PreferencesGroup()
    const removeRow = new Adw.ButtonRow({ title: _('Remove from credits') })
    removeRow.add_css_class('destructive-action')
    removeRow.connect('activated', () => {
      dialog.close()
      onRemove()
    })
    removeGroup.add(removeRow)
    box.append(removeGroup)
  }

  const save = new Gtk.Button({ label: options.saveLabel })
  save.add_css_class('suggested-action')
  const cancel = new Gtk.Button({ label: _('Cancel') })
  cancel.connect('clicked', () => dialog.close())

  const header = new Adw.HeaderBar({ showStartTitleButtons: false, showEndTitleButtons: false })
  header.pack_start(cancel)
  header.pack_end(save)

  const view = new Adw.ToolbarView({
    content: new Gtk.ScrolledWindow({
      hscrollbarPolicy: Gtk.PolicyType.NEVER,
      propagateNaturalHeight: true,
      child: box,
    }),
  })
  view.add_top_bar(header)
  dialog.set_child(view)
  dialog.set_default_widget(save)

  // The url hint only appears once there is something wrong to say; an
  // empty name just keeps Save off, no scolding before the first letter.
  const sync = (): void => {
    draft.name = nameRow.get_text()
    draft.license = licenseRow.get_text()
    draft.url = urlRow.get_text()
    draft.role = CREDIT_ROLES[roleRow.get_selected()] ?? 'other'
    const problems = creditDraftProblems(draft)
    save.set_sensitive(!problems.nameMissing && !problems.urlInvalid)
    urlHint.set_visible(problems.urlInvalid)
    if (problems.urlInvalid) urlRow.add_css_class('error')
    else urlRow.remove_css_class('error')
  }
  for (const row of [nameRow, licenseRow, urlRow]) row.connect('changed', sync)
  roleRow.connect('notify::selected', sync)
  save.connect('clicked', () => {
    sync()
    const problems = creditDraftProblems(draft)
    if (problems.nameMissing || problems.urlInvalid) return
    dialog.close()
    onSave({ ...draft })
  })
  sync()

  dialog.present(parent)
  return dialog
}

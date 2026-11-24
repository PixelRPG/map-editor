import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { FLAG_KINDS, FLAG_SCOPES, type FlagKind, type FlagScope } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import { comboRow } from '../common/preference-rows.ts'

/** What the dialog hands back: the name typed, the kind picked and whose memory it is. */
export interface NewFlagChoice {
  name: string
  kind: FlagKind
  scope: FlagScope
}

/** The kind labels, in {@link FLAG_KINDS} order; a function so they follow the locale. */
function kindLabels(): Record<FlagKind, string> {
  return {
    'yes-no': _('Yes or no'),
    number: _('A number'),
    text: _('A word or text'),
  }
}

/**
 * The scope labels, in {@link FLAG_SCOPES} order. Worded as the question
 * an author actually has — "is this one fact, or one per thing?" — rather
 * than as the word the save record uses, because "scope" is a programmer's
 * name for it. See `docs/concepts/save-record.md`.
 */
function scopeLabels(): Record<FlagScope, string> {
  return {
    game: _('The whole game'),
    thing: _('Each thing on its own'),
  }
}

/**
 * The scope choice as one radio row per answer rather than a dropdown.
 * The dialog is as narrow as the phone window, and a `ComboRow` there
 * ellipsises its value to "Das ganze S…" — the one thing it exists to
 * say. Two rows also show both answers at once, which is the point: the
 * difference only becomes visible when you can compare them.
 */
function scopeGroupFor(
  scope: FlagScope,
  labels: Record<FlagScope, string>,
  onPick: (s: FlagScope) => void,
): Adw.PreferencesGroup {
  const group = new Adw.PreferencesGroup({
    title: _('Remembered by'),
    description: _('“Each thing on its own” gives every chest, door or pot its own answer.'),
  })
  let first: Gtk.CheckButton | null = null
  for (const candidate of FLAG_SCOPES) {
    const check = new Gtk.CheckButton({ active: candidate === scope })
    if (first) check.set_group(first)
    else first = check
    const row = new Adw.ActionRow({ title: labels[candidate], activatableWidget: check })
    row.add_prefix(check)
    check.connect('toggled', () => {
      if (check.get_active()) onPick(candidate)
    })
    group.add(row)
  }
  return group
}

/**
 * Ask for a new flag's name, kind and scope over `parent`. Create stays
 * off while the name is empty and Enter in the entry activates it; the
 * kind starts on yes/no and the scope on the whole game, the common
 * cases. Resolves `null` on cancel.
 */
export function promptNewFlag(parent: Gtk.Widget, fixedKind?: FlagKind): Promise<NewFlagChoice | null> {
  return new Promise((resolve) => {
    const entry = new Gtk.Entry({
      placeholderText: _('Name, like “Has the key”'),
      activatesDefault: true,
    })
    const kindText = kindLabels()
    const scopeText = scopeLabels()
    let kind: FlagKind = fixedKind ?? 'yes-no'
    let scope: FlagScope = 'game'

    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12 })
    box.append(entry)

    if (!fixedKind) {
      const kindGroup = new Adw.PreferencesGroup()
      kindGroup.add(
        comboRow(
          _('Holds'),
          FLAG_KINDS.map((k) => ({ value: k, label: kindText[k] })),
          kind,
          (value) => {
            kind = value as FlagKind
          },
        ),
      )
      box.append(kindGroup)
    }

    box.append(
      scopeGroupFor(scope, scopeText, (picked) => {
        scope = picked
      }),
    )

    const dialog = new Adw.AlertDialog({
      heading: _('New flag'),
      body: _('A flag is something the game remembers. Give it a name and say what it holds.'),
      extraChild: box,
    })
    dialog.add_response('cancel', _('Cancel'))
    dialog.add_response('create', _('Create'))
    dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED)
    dialog.set_response_enabled('create', false)
    dialog.set_default_response('create')
    dialog.set_close_response('cancel')
    entry.connect('changed', () => dialog.set_response_enabled('create', entry.get_text().trim() !== ''))
    dialog.connect('response', (_d: Adw.AlertDialog, response: string) => {
      const name = entry.get_text().trim()
      resolve(response === 'create' && name ? { name, kind, scope } : null)
    })
    dialog.present(parent)
    entry.grab_focus()
  })
}

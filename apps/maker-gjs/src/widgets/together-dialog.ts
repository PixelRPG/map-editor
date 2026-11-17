import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { SignalScope } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import type { TogetherPerson, TogetherPresentation } from '../services/together-model.ts'
import { ColourDot } from './colour-dot.ts'

import Template from './together-dialog.blp'

/**
 * Typed view of the signals {@link TogetherDialog} registers, layered on
 * the parent's own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own
 * signals has to spell them out.
 */
export interface TogetherDialogSignals extends Adw.Dialog.SignalSignatures {
  'start-requested': () => void
  'stop-requested': () => void
  'copy-requested': () => void
  /** The Follow toggle on a peer row was clicked — argument is its peerId. */
  'follow-toggled': (peerId: string) => void
  /** The AI row's switch was moved — argument is "should the assistant take part". */
  'assistant-toggled': (enabled: boolean) => void
}

/**
 * Together (REDESIGN.md § 4.7): who is in the session, how to invite
 * someone, and how to stop.
 *
 * Replaces the three-page `ShareDialog`, whose pages were the *session
 * machine's* states rather than anything a user asked about ("idle",
 * "hosting", "connected"). Here presence comes first and the transport
 * second: the People list exists in every mode — alone, it is one row
 * with your own name and colour in it — and only the Invite section
 * changes shape.
 *
 * The dialog is a pure renderer of {@link TogetherPresentation}: it
 * holds no session state, derives nothing, and every button turns into a
 * signal. `together-model.ts` decides what the three sections say and is
 * unit-tested without GTK.
 */
export class TogetherDialog extends Adw.Dialog {
  declare _people_group: Adw.PreferencesGroup
  declare _invite_group: Adw.PreferencesGroup
  declare _invite_stack: Gtk.Stack
  declare _solo_hint: Gtk.Label
  declare _start_button: Gtk.Button
  declare _starting_label: Gtk.Label
  declare _code_label: Gtk.Label
  declare _code_hint: Gtk.Label
  declare _copy_button: Gtk.Button
  declare _nearby_row: Adw.SwitchRow
  declare _stop_group: Adw.PreferencesGroup
  declare _stop_row: Adw.ButtonRow

  static {
    GObject.registerClass(
      {
        GTypeName: 'TogetherDialog',
        Template,
        InternalChildren: [
          'people_group',
          'invite_group',
          'invite_stack',
          'solo_hint',
          'start_button',
          'starting_label',
          'code_label',
          'code_hint',
          'copy_button',
          'nearby_row',
          'stop_group',
          'stop_row',
        ],
        Signals: {
          'start-requested': {},
          'stop-requested': {},
          'copy-requested': {},
          'follow-toggled': { param_types: [GObject.TYPE_STRING] },
          'assistant-toggled': { param_types: [GObject.TYPE_BOOLEAN] },
        },
      },
      TogetherDialog,
    )
  }

  declare connect: GObject.SignalMethods<this, TogetherDialogSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, TogetherDialogSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, TogetherDialogSignals>['emit']

  /** Rows currently in the People group — removed wholesale on each sync. */
  private _rows: Gtk.Widget[] = []
  /** Suppresses the AI switch's own `notify` while a sync writes into it. */
  private _syncing = false
  private readonly _scope = new SignalScope()
  private _shareUrl: string | null = null

  constructor() {
    super()
    this._scope.connect(this._start_button, 'clicked', () => this.emit('start-requested'))
    this._scope.connect(this._stop_row, 'activated', () => this.emit('stop-requested'))
    this._scope.connect(this._copy_button, 'clicked', () => this.emit('copy-requested'))
  }

  /** The switch row the controller binds to the `visible-nearby` preference. */
  get nearbyRow(): Adw.SwitchRow {
    return this._nearby_row
  }

  /**
   * Render `view`. `assistantPaused` is the live pause state, which is
   * session-scoped and therefore not part of the presentation model.
   */
  sync(view: TogetherPresentation, assistantPaused: boolean): void {
    this._syncing = true
    try {
      this._syncPeople(view, assistantPaused)
      this._syncInvite(view)
    } finally {
      this._syncing = false
    }
  }

  /**
   * Put {@link TogetherPresentation.shareUrl} on the clipboard. Returns
   * whether there was anything to copy, so the caller only toasts on a
   * copy that happened.
   */
  copyShareUrlToClipboard(display: Gdk.Display): boolean {
    if (!this._shareUrl) return false
    display.get_clipboard().set(this._shareUrl)
    return true
  }

  private _syncPeople(view: TogetherPresentation, assistantPaused: boolean): void {
    for (const row of this._rows) this._people_group.remove(row)
    this._rows = []
    for (const person of view.people) {
      const row = person.isAI ? this._buildAssistantRow(person, assistantPaused) : this._buildPersonRow(person)
      this._people_group.add(row)
      this._rows.push(row)
    }
    this._people_group.set_description(view.people.length > 1 ? '' : _('Nobody else is here yet.'))
  }

  private _buildPersonRow(person: TogetherPerson): Adw.ActionRow {
    const row = new Adw.ActionRow({
      title: person.isSelf ? _('%s (you)').replace('%s', person.name) : person.name,
      subtitle: person.location ?? '',
    })
    row.add_prefix(new ColourDot(person.color))

    // No "Follow yourself", and nothing to follow on a peer who has not
    // said where they are — the camera would have no target.
    if (!person.isSelf && person.location) {
      const follow = new Gtk.ToggleButton({
        label: person.following ? _('Following') : _('Follow'),
        valign: Gtk.Align.CENTER,
        active: person.following,
        css_classes: ['flat'],
        tooltip_text: person.following
          ? _('Stop following %s').replace('%s', person.name)
          : _('Follow %s around the project').replace('%s', person.name),
      })
      this._scope.connect(follow, 'clicked', () => {
        if (this._syncing) return
        this.emit('follow-toggled', person.peerId)
      })
      row.add_suffix(follow)
    }
    return row
  }

  /**
   * The AI collaborator's row. A switch reading "is it taking part"
   * rather than a Pause button, because a *pause* control is on when the
   * thing is off — the one phrasing of this row that cannot be misread
   * at a glance. The desaturated avatar § 4.7 asks for is the dimmed
   * subtitle plus the pause glyph here; the roster chip keeps the
   * greyed-out disc.
   */
  private _buildAssistantRow(person: TogetherPerson, paused: boolean): Adw.SwitchRow {
    const row = new Adw.SwitchRow({
      title: person.name,
      subtitle: paused ? _('Paused') : (person.location ?? _('Editing with you')),
      active: !paused,
    })
    const prefix = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4, valign: Gtk.Align.CENTER })
    prefix.append(new ColourDot(person.color))
    if (paused) {
      prefix.append(new Gtk.Image({ icon_name: 'media-playback-pause-symbolic', pixel_size: 12 }))
      row.add_css_class('dim-label')
    }
    row.add_prefix(prefix)
    this._scope.connect(row, 'notify::active', () => {
      if (this._syncing) return
      this.emit('assistant-toggled', row.get_active())
    })
    return row
  }

  private _syncInvite(view: TogetherPresentation): void {
    this._shareUrl = view.shareUrl
    switch (view.mode) {
      case 'solo':
        this._invite_stack.set_visible_child_name('solo')
        this._solo_hint.set_label(
          view.projectName
            ? _('Share “%s” and a friend can edit it with you.').replace('%s', view.projectName)
            : _('Open a project to share it.'),
        )
        this._start_button.set_sensitive(view.projectName != null)
        break
      case 'starting':
        this._invite_stack.set_visible_child_name('starting')
        this._starting_label.set_label(_('Connecting…'))
        break
      case 'sharing':
      case 'joined':
        this._invite_stack.set_visible_child_name('code')
        this._code_label.set_label(view.code ?? '')
        this._code_hint.set_label(
          view.mode === 'sharing'
            ? _('Give this code to a friend, or send them the link.')
            : _('You joined with this code. Anyone else can use it too.'),
        )
        break
    }
    this._copy_button.set_sensitive(view.shareUrl != null)
    // Advertising is the host's to decide; a joiner is not publishing
    // anything, so the switch would be a control over nothing.
    this._nearby_row.set_visible(view.mode !== 'joined')
    this._stop_group.set_visible(view.mode === 'sharing')
  }

  /**
   * Drop every handler this dialog opened. The dialog itself lives for
   * the window's lifetime (re-presenting a closed `Adw.Dialog` is what
   * makes its state survive), so this runs on window teardown, not on
   * close.
   */
  release(): void {
    this._scope.disconnectAll()
  }
}

GObject.type_ensure(TogetherDialog.$gtype)

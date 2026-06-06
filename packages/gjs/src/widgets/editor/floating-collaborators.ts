import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import Template from './floating-collaborators.blp'

/** One participant chip's data — fed in from the live awareness roster. */
export interface CollaboratorEntry {
  readonly peerId: string
  readonly name: string
  /** CSS-style colour token (`#rrggbb`) — matches the on-canvas cursor. */
  readonly color: string
  /** True for the in-process AI assistant (gets the pause control). */
  readonly isAI: boolean
}

/**
 * Bottom-left floating participants bar (see
 * `docs/concepts/ai-collaborator.md`). Generalises the AI presence pill
 * to the whole session roster: the AI assistant + any networked human
 * peers. Clicking a chip asks the host to follow that participant with
 * the camera; the AI chip also exposes a pause/resume control.
 *
 * Pure view — it renders whatever roster {@link setParticipants} is given
 * and emits `participant-activated` on a chip click. ApplicationWindow
 * owns the roster (aggregating the engine's AI presence + the
 * CollabSession awareness) and the follow/pause behaviour.
 */
export class FloatingCollaborators extends Adw.Bin {
  declare _chips_box: Gtk.Box
  declare _pause_button: Gtk.Button

  private _paused = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgFloatingCollaborators',
        Template,
        InternalChildren: ['chips_box', 'pause_button'],
        Properties: {
          paused: GObject.ParamSpec.boolean(
            'paused',
            'Paused',
            'Whether the user has paused the AI assistant',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
        Signals: {
          // Emitted with the clicked participant's peerId — the window
          // toggles follow for it.
          'participant-activated': { param_types: [GObject.TYPE_STRING] },
        },
      },
      FloatingCollaborators,
    )
  }

  get paused(): boolean {
    return this._paused
  }

  set paused(value: boolean) {
    if (this._paused === value) return
    this._paused = value
    this._pause_button.iconName = value ? 'media-playback-start-symbolic' : 'media-playback-pause-symbolic'
    this._pause_button.tooltipText = value ? _('Resume the assistant') : _('Pause the assistant')
    this.notify('paused')
  }

  /**
   * Rebuild the chip row from the live roster. `followedId` highlights the
   * currently-followed participant (or none). The pause control is shown
   * only when an AI participant is present. The whole bar hides when the
   * roster is empty.
   */
  setParticipants(participants: CollaboratorEntry[], followedId: string | null): void {
    let child = this._chips_box.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._chips_box.remove(child)
      child = next
    }

    for (const participant of participants) {
      this._chips_box.append(this._buildChip(participant, participant.peerId === followedId))
    }

    this._pause_button.set_visible(participants.some((p) => p.isAI))
    this.set_visible(participants.length > 0)
  }

  private _buildChip(participant: CollaboratorEntry, followed: boolean): Gtk.Button {
    const button = new Gtk.Button()
    button.add_css_class('flat')
    // The accent ("suggested-action") marks the followed participant.
    if (followed) button.add_css_class('suggested-action')
    button.tooltipText = followed
      ? _('Following %s — click to stop').replace('%s', participant.name)
      : _('Follow %s').replace('%s', participant.name)

    // A colour bullet (matching the on-canvas cursor) + the name, via
    // Pango markup — no per-widget CSS provider to manage.
    const label = new Gtk.Label()
    label.useMarkup = true
    const colour = GLib.markup_escape_text(participant.color, -1)
    const name = GLib.markup_escape_text(participant.name, -1)
    label.set_markup(`<span foreground="${colour}">●</span> ${name}`)
    button.set_child(label)

    button.connect('clicked', () => this.emit('participant-activated', participant.peerId))
    return button
  }
}

GObject.type_ensure(FloatingCollaborators.$gtype)

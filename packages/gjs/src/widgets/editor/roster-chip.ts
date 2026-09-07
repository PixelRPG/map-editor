import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import Pango from '@girs/pango-1.0'
import { gettext as _ } from 'gettext'

import {
  AVATAR_STACK_HEIGHT,
  avatarSlots,
  avatarStackWidth,
  type AvatarSlot,
  overflowCount,
  pauseBars,
} from './roster-chip.geometry.ts'

/** One participant chip's data — fed in from the live awareness roster. */
export interface CollaboratorEntry {
  readonly peerId: string
  readonly name: string
  /** CSS-style colour token (`#rrggbb`) — matches the on-canvas cursor. */
  readonly color: string
  /** True for the in-process AI assistant (gets the pause control). */
  readonly isAI: boolean
  /** The peer's tier, from awareness presence — shown as the row subtitle. */
  readonly fullView?: boolean
}

/**
 * The overlapping discs the chip shows: one per participant in that
 * participant's cursor colour, the AI's marked with a star, capped at
 * three with a "+N" caption after them.
 *
 * A custom `Gtk.Widget` rather than three `Adw.Avatar`s in a box,
 * because the overlap needs negative spacing and GTK forbids negative
 * margins; a `Gtk.Fixed` would work but drawing is both simpler and
 * cheaper for a 22 px disc.
 */
export class AvatarStack extends Gtk.Widget {
  private _participants: CollaboratorEntry[] = []
  private _paused = false

  static {
    GObject.registerClass({ GTypeName: 'PixelRpgAvatarStack' }, AvatarStack)
  }

  constructor() {
    super()
    this.valign = Gtk.Align.CENTER
  }

  setParticipants(participants: CollaboratorEntry[]): void {
    this._participants = participants
    this.queue_resize()
    this.queue_draw()
  }

  setPaused(paused: boolean): void {
    if (this._paused === paused) return
    this._paused = paused
    this.queue_draw()
  }

  vfunc_measure(orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    if (orientation === Gtk.Orientation.HORIZONTAL) {
      const w = Math.max(avatarStackWidth(this._participants.length), 1)
      return [w, w, -1, -1]
    }
    return [AVATAR_STACK_HEIGHT, AVATAR_STACK_HEIGHT, -1, -1]
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const slots = avatarSlots(this._participants.length)
    for (const slot of slots) {
      const participant = this._participants[slot.index]
      if (!participant) continue
      this._drawDisc(snapshot, slot, participant)
    }
    const aiSlot = slots.find((slot) => this._participants[slot.index]?.isAI)
    if (this._paused && aiSlot) this._drawPause(snapshot, aiSlot)
  }

  private _drawDisc(snapshot: Gtk.Snapshot, slot: AvatarSlot, participant: CollaboratorEntry): void {
    const rgba = new Gdk.RGBA()
    if (!rgba.parse(participant.color)) rgba.parse('#9aa0a6')
    // A hairline ring in the window background separates overlapping discs.
    const [found, bg] = this.get_style_context().lookup_color('window_bg_color')
    const ring = found ? bg : new Gdk.RGBA({ red: 0, green: 0, blue: 0, alpha: 0.6 })
    fillCircle(snapshot, slot.x - 1, slot.y - 1, slot.size + 2, ring)
    fillCircle(snapshot, slot.x, slot.y, slot.size, rgba)

    const glyph = participant.isAI ? '✦' : firstGrapheme(participant.name)
    const layout = this.create_pango_layout(glyph)
    layout.set_font_description(Pango.FontDescription.from_string(`Bold ${Math.round(slot.size * 0.42)}px`))
    const [width, height] = layout.get_pixel_size()
    snapshot.save()
    snapshot.translate(
      new Graphene.Point({
        x: slot.x + (slot.size - width) / 2,
        y: slot.y + (slot.size - height) / 2,
      }),
    )
    snapshot.append_layout(layout, new Gdk.RGBA({ red: 1, green: 1, blue: 1, alpha: 1 }))
    snapshot.restore()
  }

  private _drawPause(snapshot: Gtk.Snapshot, slot: AvatarSlot): void {
    const scrim = new Gdk.RGBA({ red: 0, green: 0, blue: 0, alpha: 0.45 })
    fillCircle(snapshot, slot.x, slot.y, slot.size, scrim)
    const white = new Gdk.RGBA({ red: 1, green: 1, blue: 1, alpha: 0.95 })
    for (const bar of pauseBars(slot)) {
      const rect = new Graphene.Rect()
      rect.init(bar.x, bar.y, bar.w, bar.h)
      snapshot.append_color(white, rect)
    }
  }
}

/**
 * The participants pill: an avatar stack that opens the roster.
 *
 * It replaces the bottom-left `FloatingCollaborators` bar, which cost
 * 13 688 px² of canvas whenever anyone was in the session — including
 * the AI assistant, which is present whenever the editor is driven by
 * an agent. `docs/concepts/ai-collaborator.md` treats the roster as the
 * content and the pill as the frame, so only the frame changed: the
 * rows, the follow toggle and the AI pause control are the same.
 *
 * Hidden while the roster is empty, so a solo session pays nothing.
 */
export class RosterChip extends Gtk.MenuButton {
  private _stack: AvatarStack
  private _list: Gtk.ListBox
  private _overflow: Gtk.Label
  private _paused = false
  private _participants: CollaboratorEntry[] = []
  private _followedId: string | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgRosterChip',
        Properties: {
          // Notified on every roster change, because the chip's WIDTH is
          // what decides whether the tool group still fits beside it —
          // the scene editor re-runs its ladder on this.
          'roster-size': GObject.ParamSpec.int(
            'roster-size',
            'Roster size',
            'How many participants the chip is currently showing',
            GObject.ParamFlags.READABLE,
            0,
            999,
            0,
          ),
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
      RosterChip,
    )
  }

  constructor() {
    super()
    this.add_css_class('flat')
    this.set_tooltip_text(_('Session participants'))
    this.set_visible(false)

    this._stack = new AvatarStack()
    this._overflow = new Gtk.Label({ visible: false })
    this._overflow.add_css_class('caption')
    const child = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4 })
    child.append(this._stack)
    child.append(this._overflow)
    this.set_child(child)

    this._list = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list'] })
    this._list.set_size_request(260, -1)
    const popover = new Gtk.Popover()
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 8,
      margin_top: 8,
      margin_bottom: 8,
      margin_start: 8,
      margin_end: 8,
    })
    const heading = new Gtk.Label({ label: _('In this session'), halign: Gtk.Align.START })
    heading.add_css_class('caption-heading')
    heading.add_css_class('dim-label')
    box.append(heading)
    box.append(this._list)
    popover.set_child(box)
    this.set_popover(popover)
  }

  get rosterSize(): number {
    return this._participants?.length ?? 0
  }

  get paused(): boolean {
    return this._paused ?? false
  }

  set paused(value: boolean) {
    if (this._paused === value) return
    this._paused = value
    this._stack.setPaused(value)
    this._rebuildRows()
    this.notify('paused')
  }

  /**
   * Rebuild from the live roster. `followedId` marks the participant the
   * camera follows. The chip hides itself when the roster is empty — a
   * hidden child takes no space in the pill.
   */
  setParticipants(participants: CollaboratorEntry[], followedId: string | null): void {
    this._participants = participants
    this._followedId = followedId
    this._stack.setParticipants(participants)
    const extra = overflowCount(participants.length)
    this._overflow.set_label(extra > 0 ? `+${extra}` : '')
    this._overflow.set_visible(extra > 0)
    this.set_visible(participants.length > 0)
    this.set_tooltip_text(
      participants.length === 1
        ? _('%s is in this session').replace('%s', participants[0].name)
        : _('%d people in this session').replace('%d', String(participants.length)),
    )
    this._rebuildRows()
    this.notify('roster-size')
  }

  private _rebuildRows(): void {
    let row = this._list.get_first_child()
    while (row) {
      const next = row.get_next_sibling()
      this._list.remove(row)
      row = next
    }
    for (const participant of this._participants) {
      this._list.append(this._buildRow(participant))
    }
  }

  private _buildRow(participant: CollaboratorEntry): Adw.ActionRow {
    const followed = participant.peerId === this._followedId
    const row = new Adw.ActionRow({ title: participant.name })
    if (participant.fullView !== undefined) {
      row.set_subtitle(participant.fullView ? _('Full view') : _('Simple view'))
    }

    const follow = new Gtk.ToggleButton({
      label: followed ? _('Following') : _('Follow'),
      valign: Gtk.Align.CENTER,
      active: followed,
      tooltip_text: followed
        ? _('Following %s — click to stop').replace('%s', participant.name)
        : _('Follow %s').replace('%s', participant.name),
    })
    follow.add_css_class('flat')
    follow.connect('clicked', () => this.emit('participant-activated', participant.peerId))
    row.add_suffix(follow)

    if (participant.isAI) {
      const pause = new Gtk.Button({
        icon_name: this._paused ? 'media-playback-start-symbolic' : 'media-playback-pause-symbolic',
        tooltip_text: this._paused ? _('Resume the assistant') : _('Pause the assistant'),
        action_name: 'win.toggle-assistant-paused',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat', 'circular'],
      })
      row.add_suffix(pause)
    }
    return row
  }
}

function fillCircle(snapshot: Gtk.Snapshot, x: number, y: number, size: number, color: Gdk.RGBA): void {
  const rect = new Graphene.Rect()
  rect.init(x, y, size, size)
  const rounded = new Gsk.RoundedRect()
  rounded.init_from_rect(rect, size / 2)
  snapshot.push_rounded_clip(rounded)
  snapshot.append_color(color, rect)
  snapshot.pop()
}

/** First visible character of a name, for the disc's initial. */
function firstGrapheme(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return [...trimmed][0].toUpperCase()
}

GObject.type_ensure(AvatarStack.$gtype)
GObject.type_ensure(RosterChip.$gtype)

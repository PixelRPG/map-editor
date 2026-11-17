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
 * The participants pill: an avatar stack that opens Together.
 *
 * It replaces the bottom-left `FloatingCollaborators` bar, which cost
 * 13 688 px² of canvas whenever anyone was in the session — including
 * the AI assistant, which is present whenever the editor is driven by
 * an agent. `docs/concepts/ai-collaborator.md` treats the roster as the
 * content and the pill as the frame; since REDESIGN.md § 4.7 the
 * content moved into the Together dialog, so the chip is now purely
 * the frame: it shows WHO is here and opens the one place that says
 * what you can do about it.
 *
 * A plain `Gtk.Button` on `win.share-session` rather than a
 * `Gtk.MenuButton` over a popover, because the popover's rows (Follow,
 * the AI pause) were a second, smaller copy of Together's rows —
 * Follow in particular has to name a map to be useful, which a 260 px
 * popover cannot. One roster, one place to read it.
 *
 * Always visible, including solo: an empty roster is not "no feature",
 * it is "nobody here yet", and a chip that only appears once someone
 * else arrives is a chip nobody can use to invite them. Solo shows an
 * "add person" icon in the same slot the discs take later, so the pill
 * does not resize the moment the first peer joins.
 */
export class RosterChip extends Gtk.Button {
  private _stack: AvatarStack
  private _overflow: Gtk.Label
  private _invite: Gtk.Image
  private _paused = false
  private _participants: CollaboratorEntry[] = []

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
      },
      RosterChip,
    )
  }

  constructor() {
    super()
    this.add_css_class('flat')
    this.set_action_name('win.share-session')

    this._stack = new AvatarStack()
    this._stack.set_visible(false)
    this._overflow = new Gtk.Label({ visible: false })
    this._overflow.add_css_class('caption')
    this._invite = new Gtk.Image({ icon_name: 'contact-new-symbolic' })
    const child = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4 })
    child.append(this._invite)
    child.append(this._stack)
    child.append(this._overflow)
    this.set_child(child)
    this._applySolo()
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
    this.notify('paused')
  }

  /**
   * Rebuild from the live roster.
   *
   * An empty roster falls back to the invite icon rather than hiding
   * the chip: see the class note. Everything else about a participant —
   * where they are, following them, pausing the AI — is Together's.
   */
  setParticipants(participants: CollaboratorEntry[]): void {
    this._participants = participants
    if (participants.length === 0) {
      this._applySolo()
      this.notify('roster-size')
      return
    }
    this._invite.set_visible(false)
    this._stack.set_visible(true)
    this._stack.setParticipants(participants)
    const extra = overflowCount(participants.length)
    this._overflow.set_label(extra > 0 ? `+${extra}` : '')
    this._overflow.set_visible(extra > 0)
    this.set_tooltip_text(
      participants.length === 1
        ? _('%s is in this session').replace('%s', participants[0].name)
        : _('%d people in this session').replace('%d', String(participants.length)),
    )
    this.notify('roster-size')
  }

  private _applySolo(): void {
    this._stack.set_visible(false)
    this._stack.setParticipants([])
    this._overflow.set_visible(false)
    this._invite.set_visible(true)
    this.set_tooltip_text(_('Invite someone to this project'))
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

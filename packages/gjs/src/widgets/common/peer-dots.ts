import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

import { ColourDot } from './colour-dot.ts'

/** Diameter (px) of one presence dot on a card or list row. */
export const PEER_DOT_PX = 10

/** Gap between dots. Small enough to read as one cluster, not a list. */
const PEER_DOT_SPACING = 2

/**
 * How many dots are drawn before the rest collapse into "+N".
 *
 * Three, like the roster chip's avatar stack: the question a card
 * answers is "is anyone here", and past three the count says more than
 * the colours do.
 */
const PEER_DOT_MAX = 3

/**
 * One peer, reduced to what a presence dot needs: a colour to draw and
 * a name for the tooltip.
 *
 * Presentational, so it lives next to the widget rather than in the
 * session layer — a scene card must not be able to reach a session.
 */
export interface PeerMarker {
  readonly peerId: string
  readonly name: string
  /** CSS-style colour token (`#rrggbb`) — the same hue as this peer's cursor. */
  readonly color: string
  readonly isAI: boolean
}

/**
 * The "who is here" cluster: one coloured dot per person working on the
 * thing this widget sits on — a map's card in the atlas, a character's
 * row in the Cast roster, a tileset's card in Graphics.
 *
 * REDESIGN.md § 4.7 asks presence to be visible where the work is, not
 * only in the Together dialog: the atlas is where a map is chosen, so
 * it is also where "Mia is already in the forest" has to be readable.
 *
 * Hidden while nobody is there, so a solo project pays no layout for
 * it — `set_visible(false)` rather than a zero-size widget, because a
 * `Gtk.Box` still allocates spacing around an empty visible child.
 */
export class PeerDots extends Gtk.Box {
  static {
    GObject.registerClass({ GTypeName: 'PixelRpgPeerDots' }, PeerDots)
  }

  private _overflow = new Gtk.Label({ cssClasses: ['caption', 'dim-label'], visible: false })
  private _dots: ColourDot[] = []
  private _count = 0

  constructor(private readonly _size: number = PEER_DOT_PX) {
    super({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: PEER_DOT_SPACING,
      valign: Gtk.Align.CENTER,
      visible: false,
    })
    this.append(this._overflow)
  }

  /**
   * Show `peers`, reusing the dots already built.
   *
   * Presence changes whenever anyone navigates, and these widgets sit
   * inside galleries that are expensive to rebuild (a Graphics card
   * carries a rendered character preview), so this never destroys a
   * parent — it repaints in place, exactly like `AtlasCanvas.setStartMapId`.
   */
  setPeers(peers: readonly PeerMarker[]): void {
    const shown = peers.slice(0, PEER_DOT_MAX)
    while (this._dots.length > shown.length) {
      const dot = this._dots.pop()
      if (dot) this.remove(dot)
    }
    while (this._dots.length < shown.length) {
      const dot = new ColourDot('', this._size)
      this.insert_child_after(dot, this._dots[this._dots.length - 1] ?? null)
      this._dots.push(dot)
    }
    for (const [i, peer] of shown.entries()) this._dots[i]?.setColor(peer.color)

    const hidden = peers.length - shown.length
    this._overflow.set_label(hidden > 0 ? `+${hidden}` : '')
    this._overflow.set_visible(hidden > 0)

    // The colours are the only thing on screen, and a colour is not a
    // name — the tooltip is what makes the cluster answer "who".
    this.set_tooltip_text(peers.length > 0 ? peers.map((p) => p.name).join(', ') : null)
    this._count = peers.length
    this.set_visible(peers.length > 0)
  }

  /** How many people this cluster currently stands for — for tests and the debug status. */
  get peerCount(): number {
    return this._count
  }
}

GObject.type_ensure(PeerDots.$gtype)

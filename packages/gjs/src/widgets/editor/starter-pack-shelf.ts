import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Pango from '@girs/pango-1.0'
import { gettext as _ } from 'gettext'

import { SheetThumbnail } from '../tiles/sheet-thumbnail.ts'

/** What one pack card shows. The host decides the state; the shelf only draws it. */
export interface StarterPackCard {
  id: string
  name: string
  license: string
  /** `new`: a tap adds it · `attach`: a tap puts it on this map · `added`: already on this map. */
  state: 'new' | 'attach' | 'added'
  /** The pack's whole sheet. */
  preview: Gdk.Texture | null
}

export interface StarterPackShelfSignals extends Gtk.Box.SignalSignatures {
  'pack-selected': (packId: string) => void
}

const THUMB_WIDTH = 120
const THUMB_HEIGHT = 72

interface CardWidgets {
  button: Gtk.Button
  spinner: Adw.Spinner
  check: Gtk.Image
}

/**
 * The "Starter packs" shelf (REDESIGN § 6.5): a card per ready-made
 * tileset, two to a row on a phone. A tap emits `pack-selected` and the
 * host adds the pack; while it copies, {@link setBusy} swaps the card's
 * tick for a spinner and holds the other cards still.
 *
 * Hidden whole while it has no cards — an empty shelf is dead furniture.
 */
export class StarterPackShelf extends Gtk.Box {
  private _flow: Gtk.FlowBox
  private _cards = new Map<string, CardWidgets>()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgStarterPackShelf',
        Signals: { 'pack-selected': { param_types: [GObject.TYPE_STRING] } },
      },
      StarterPackShelf,
    )
  }

  declare connect: GObject.SignalMethods<this, StarterPackShelfSignals>['connect']
  declare emit: GObject.SignalMethods<this, StarterPackShelfSignals>['emit']

  constructor() {
    super({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, visible: false })
    const heading = new Gtk.Label({ label: _('Starter packs'), halign: Gtk.Align.START })
    heading.add_css_class('heading')
    this.append(heading)
    this._flow = new Gtk.FlowBox({
      selection_mode: Gtk.SelectionMode.NONE,
      homogeneous: true,
      min_children_per_line: 2,
      max_children_per_line: 4,
      column_spacing: 12,
      row_spacing: 12,
      valign: Gtk.Align.START,
    })
    this.append(this._flow)
  }

  /** Replace the cards. An empty list hides the shelf. */
  setCards(cards: readonly StarterPackCard[]): void {
    this._flow.remove_all()
    this._cards.clear()
    for (const card of cards) {
      const widgets = this._buildCard(card)
      this._cards.set(card.id, widgets)
      this._flow.append(widgets.button)
    }
    this.set_visible(cards.length > 0)
  }

  /** Show the spinner on one card and ignore taps until `null`. */
  setBusy(packId: string | null): void {
    this._flow.set_sensitive(packId === null)
    for (const [id, widgets] of this._cards) widgets.spinner.set_visible(id === packId)
    if (packId !== null) {
      const widgets = this._cards.get(packId)
      if (widgets) widgets.check.set_visible(false)
    }
  }

  private _buildCard(card: StarterPackCard): CardWidgets {
    const thumb = new SheetThumbnail({ width: THUMB_WIDTH, height: THUMB_HEIGHT })
    thumb.setSheet(card.preview)
    thumb.set_halign(Gtk.Align.CENTER)

    const name = new Gtk.Label({ label: card.name, ellipsize: Pango.EllipsizeMode.END, xalign: 0, hexpand: true })
    name.add_css_class('heading')
    const license = new Gtk.Label({ label: card.license, xalign: 0, ellipsize: Pango.EllipsizeMode.END })
    license.add_css_class('dim-label')
    license.add_css_class('caption')
    const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true })
    text.append(name)
    text.append(license)

    const check = new Gtk.Image({ icon_name: 'object-select-symbolic', visible: card.state === 'added' })
    const spinner = new Adw.Spinner({ visible: false })
    const foot = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, valign: Gtk.Align.CENTER })
    foot.append(text)
    foot.append(check)
    foot.append(spinner)

    const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
    content.set_margin_top(6)
    content.set_margin_bottom(6)
    content.set_margin_start(6)
    content.set_margin_end(6)
    content.append(thumb)
    content.append(foot)

    const button = new Gtk.Button({ child: content })
    button.add_css_class('card')
    button.set_tooltip_text(
      card.state === 'added'
        ? _('Paint with “%s”').replace('%s', card.name)
        : _('Add “%s” to this map').replace('%s', card.name),
    )
    button.connect('clicked', () => this.emit('pack-selected', card.id))
    return { button, spinner, check }
  }
}

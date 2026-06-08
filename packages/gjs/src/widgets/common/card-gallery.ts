import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Pango from '@girs/pango-1.0'
import { gettext as _ } from 'gettext'

import Template from './card-gallery.blp'

/** Edge length (px) of a card's square preview area. */
const PREVIEW_SIZE = 96
/** Cap on the title/subtitle width so a long name can't widen a card. */
const LABEL_MAX_CHARS = 16

/**
 * One entry rendered as a card by {@link CardGallery}. Presentational
 * only — the gallery never mutates project data; it emits id-carrying
 * signals the host turns into the actual mutation.
 */
export interface GalleryCardItem {
  /** Stable id echoed back in `item-activated` / `delete-requested`. */
  id: string
  /** Bold card heading (character / tileset name). */
  title: string
  /** Caption under the title (kind, sprite count, …). */
  subtitle: string
  /** Optional accent pill on the card (e.g. `Player`). */
  badge?: string | null
  /** Preview image. When null, {@link fallbackIcon} is shown instead. */
  paintable?: Gdk.Paintable | null
  /** Symbolic icon shown when {@link paintable} is null. */
  fallbackIcon?: string
  /** When true the card shows a trash affordance emitting `delete-requested`. */
  deletable?: boolean
}

/**
 * Reusable, responsive grid of Adwaita cards — the single visual
 * vocabulary the Cast view (characters) and the Tiles view (tilesets)
 * share for listing their project entities. Each card carries a
 * preview, a title + subtitle, an optional accent badge, and an
 * optional delete affordance.
 *
 * The widget is purely presentational: `setItems` rebuilds the grid,
 * `setActiveId` moves the selection ring, and user interaction surfaces
 * as two signals the host wires to its controller:
 *
 * - `item-activated::<id>` — a card was clicked (select it).
 * - `delete-requested::<id>` — a card's trash button was clicked. The
 *   host owns the confirm dialog + the actual removal.
 *
 * Responsiveness comes for free from the underlying `Gtk.FlowBox`:
 * cards reflow from a single column (phone) up to five per row
 * (desktop) against the allocated width — no breakpoint wiring needed.
 */
export class CardGallery extends Adw.Bin {
  declare _stack: Gtk.Stack
  declare _flow: Gtk.FlowBox

  private _emptyTitle = _('Nothing here yet')
  private _emptyIcon = 'view-grid-symbolic'
  private _deleteTooltip = _('Delete')
  private _activeId: string | null = null
  /** card-button by item id, so `setActiveId` can move the selection ring. */
  private _cardsById = new Map<string, Gtk.Button>()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgCardGallery',
        Template,
        InternalChildren: ['stack', 'flow'],
        Properties: {
          'empty-title': GObject.ParamSpec.string(
            'empty-title',
            'Empty Title',
            'Caption shown when the gallery has no items',
            GObject.ParamFlags.READWRITE,
            _('Nothing here yet'),
          ),
          'empty-icon': GObject.ParamSpec.string(
            'empty-icon',
            'Empty Icon',
            'Symbolic icon shown in the empty state',
            GObject.ParamFlags.READWRITE,
            'view-grid-symbolic',
          ),
          'delete-tooltip': GObject.ParamSpec.string(
            'delete-tooltip',
            'Delete Tooltip',
            'Tooltip on each card delete button',
            GObject.ParamFlags.READWRITE,
            _('Delete'),
          ),
        },
        Signals: {
          'item-activated': { param_types: [GObject.TYPE_STRING] },
          'delete-requested': { param_types: [GObject.TYPE_STRING] },
        },
      },
      CardGallery,
    )
  }

  constructor() {
    super()
    // Start on the empty page so a gallery shown before its first
    // `setItems` doesn't flash an empty grid.
    this._stack.set_visible_child_name('empty')
  }

  get emptyTitle(): string {
    return this._emptyTitle ?? ''
  }

  set emptyTitle(value: string) {
    if (this._emptyTitle === value) return
    this._emptyTitle = value
    this.notify('empty-title')
  }

  get emptyIcon(): string {
    return this._emptyIcon ?? 'view-grid-symbolic'
  }

  set emptyIcon(value: string) {
    if (this._emptyIcon === value) return
    this._emptyIcon = value
    this.notify('empty-icon')
  }

  get deleteTooltip(): string {
    return this._deleteTooltip ?? ''
  }

  set deleteTooltip(value: string) {
    if (this._deleteTooltip === value) return
    this._deleteTooltip = value
    this.notify('delete-tooltip')
  }

  /**
   * Replace every card. Items are rendered in array order. Switches to
   * the empty state when the list is empty. The active selection ring
   * is preserved if the active id is still present.
   */
  setItems(items: GalleryCardItem[]): void {
    this._clear()
    for (const item of items) {
      const child = this._buildCard(item)
      this._flow.append(child)
    }
    this._stack.set_visible_child_name(items.length === 0 ? 'empty' : 'grid')
    if (this._activeId && !this._cardsById.has(this._activeId)) this._activeId = null
    this._applyHighlight()
  }

  /**
   * Move the selection ring to the card with `id` (or clear it with
   * `null`). No-op if the id isn't present — the next `setItems` with a
   * matching item will pick it up.
   */
  setActiveId(id: string | null): void {
    if (this._activeId === id) return
    this._activeId = id
    this._applyHighlight()
  }

  private _clear(): void {
    let child = this._flow.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._flow.remove(child)
      child = next
    }
    this._cardsById.clear()
  }

  private _applyHighlight(): void {
    for (const [id, card] of this._cardsById) {
      if (id === this._activeId) card.add_css_class('card-gallery-selected')
      else card.remove_css_class('card-gallery-selected')
    }
  }

  /**
   * Build one card: a `card`-styled `Gtk.Button` (the whole card is the
   * click target) wrapped in a `Gtk.Overlay` so the optional delete
   * button can float in the top-right corner. The overlay child sits
   * above the card button, so clicking trash never also activates the
   * card underneath.
   */
  private _buildCard(item: GalleryCardItem): Gtk.Overlay {
    const card = new Gtk.Button({ cssClasses: ['card', 'card-gallery-card'] })
    card.connect('clicked', () => this.emit('item-activated', item.id))

    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
      marginTop: 10,
      marginBottom: 10,
      marginStart: 10,
      marginEnd: 10,
    })

    box.append(this._buildPreview(item))

    const title = new Gtk.Label({
      label: item.title,
      halign: Gtk.Align.CENTER,
      ellipsize: Pango.EllipsizeMode.END,
      maxWidthChars: LABEL_MAX_CHARS,
    })
    title.add_css_class('heading')
    box.append(title)

    if (item.subtitle) {
      const subtitle = new Gtk.Label({
        label: item.subtitle,
        halign: Gtk.Align.CENTER,
        ellipsize: Pango.EllipsizeMode.END,
        maxWidthChars: LABEL_MAX_CHARS,
      })
      subtitle.add_css_class('caption')
      subtitle.add_css_class('dim-label')
      box.append(subtitle)
    }

    if (item.badge) {
      const badge = new Gtk.Label({ label: item.badge, halign: Gtk.Align.CENTER })
      badge.add_css_class('caption')
      badge.add_css_class('accent')
      box.append(badge)
    }

    card.set_child(box)

    const overlay = new Gtk.Overlay()
    overlay.set_child(card)

    if (item.deletable) {
      const trash = new Gtk.Button({
        iconName: 'user-trash-symbolic',
        tooltipText: this.deleteTooltip,
        cssClasses: ['flat', 'circular', 'card-gallery-delete'],
        halign: Gtk.Align.END,
        valign: Gtk.Align.START,
        marginTop: 6,
        marginEnd: 6,
      })
      trash.connect('clicked', () => this.emit('delete-requested', item.id))
      overlay.add_overlay(trash)
    }

    this._cardsById.set(item.id, card)
    return overlay
  }

  /**
   * Square preview cell. Uses a `Gtk.Picture` for a sprite/sheet
   * paintable (aspect-preserving, scales to fit), falling back to a
   * symbolic `Gtk.Image` when no paintable is available so a card is
   * never blank.
   */
  private _buildPreview(item: GalleryCardItem): Gtk.Widget {
    const frame = new Gtk.Box({
      halign: Gtk.Align.CENTER,
      cssClasses: ['card-gallery-preview'],
      widthRequest: PREVIEW_SIZE,
      heightRequest: PREVIEW_SIZE,
    })
    if (item.paintable) {
      const picture = new Gtk.Picture({
        contentFit: Gtk.ContentFit.CONTAIN,
        canShrink: true,
        hexpand: true,
        vexpand: true,
      })
      picture.set_paintable(item.paintable)
      frame.append(picture)
    } else {
      const icon = new Gtk.Image({
        iconName: item.fallbackIcon ?? 'image-missing-symbolic',
        pixelSize: Math.round(PREVIEW_SIZE / 2),
        hexpand: true,
        vexpand: true,
      })
      icon.add_css_class('dim-label')
      frame.append(icon)
    }
    return frame
  }
}

GObject.type_ensure(CardGallery.$gtype)

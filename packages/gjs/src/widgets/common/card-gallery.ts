import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import Gio from '@girs/gio-2.0'
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
 * Optional contract a card's preview widget can implement so the gallery
 * can tell it when its card is the active or hovered one — e.g. an
 * animated character preview that should only move while highlighted.
 * Previews that don't implement it (a plain `Gtk.Picture`) are ignored.
 */
export interface CardPreview extends Gtk.Widget {
  setHighlighted(highlighted: boolean): void
}

function isCardPreview(widget: Gtk.Widget): widget is CardPreview {
  return typeof (widget as Partial<CardPreview>).setHighlighted === 'function'
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
  private _hoveredId: string | null = null
  /** card-button by item id, so `setActiveId` can move the selection ring. */
  private _cardsById = new Map<string, Gtk.Button>()
  /** highlightable previews by id, so the active/hovered one can animate. */
  private _previewsById = new Map<string, CardPreview>()

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
            'Delete Label',
            "Label of the delete item in each card's three-dots menu",
            GObject.ParamFlags.READWRITE,
            _('Delete'),
          ),
        },
        Signals: {
          // A card was clicked (select it).
          'item-activated': { param_types: [GObject.TYPE_STRING] },
          // A card was double-clicked or its menu's "open" chosen — open
          // the full detail view for it.
          'item-opened': { param_types: [GObject.TYPE_STRING] },
          // The card's three-dots menu → delete was chosen. The host
          // owns the confirm dialog + the actual removal.
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
   *
   * `buildPreview`, when given, supplies a custom preview WIDGET for a
   * card (e.g. an animated character preview) instead of the static
   * {@link GalleryCardItem.paintable}; returning `null` falls back to the
   * paintable/icon. The gallery owns the returned widget's lifecycle
   * (it's destroyed when the card is cleared), so the factory should
   * return a fresh widget per call.
   */
  setItems(items: GalleryCardItem[], buildPreview?: (item: GalleryCardItem) => Gtk.Widget | null): void {
    this._clear()
    for (const item of items) {
      const child = this._buildCard(item, buildPreview)
      this._flow.append(child)
    }
    this._stack.set_visible_child_name(items.length === 0 ? 'empty' : 'grid')
    if (this._activeId && !this._cardsById.has(this._activeId)) this._activeId = null
    this._applyHighlight()
    this._refreshPreviewStates()
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
    this._refreshPreviewStates()
  }

  private _clear(): void {
    let child = this._flow.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._flow.remove(child)
      child = next
    }
    this._cardsById.clear()
    this._previewsById.clear()
    this._hoveredId = null
  }

  private _applyHighlight(): void {
    for (const [id, card] of this._cardsById) {
      if (id === this._activeId) card.add_css_class('card-gallery-selected')
      else card.remove_css_class('card-gallery-selected')
    }
  }

  /**
   * Tell each highlightable preview whether its card is the active or
   * hovered one, so only that card animates (the rest stay static).
   */
  private _refreshPreviewStates(): void {
    for (const [id, preview] of this._previewsById) {
      preview.setHighlighted(id === this._activeId || id === this._hoveredId)
    }
  }

  /**
   * Build one card: a `card`-styled `Gtk.Button` (the whole card is the
   * click target) wrapped in a `Gtk.Overlay` so the optional delete
   * button can float in the top-right corner. The overlay child sits
   * above the card button, so clicking trash never also activates the
   * card underneath.
   */
  private _buildCard(item: GalleryCardItem, buildPreview?: (item: GalleryCardItem) => Gtk.Widget | null): Gtk.Overlay {
    const card = new Gtk.Button({ cssClasses: ['card', 'card-gallery-card'] })
    card.connect('clicked', () => this.emit('item-activated', item.id))
    // Double-click opens the detail view. A capture-phase gesture sees
    // the press before the button's own click gesture; we don't claim
    // it, so the single-click `item-activated` still fires.
    const dbl = new Gtk.GestureClick()
    dbl.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    dbl.connect('pressed', (_g: Gtk.GestureClick, nPress: number) => {
      if (nPress === 2) this.emit('item-opened', item.id)
    })
    card.add_controller(dbl)

    // Hover highlights the card's preview (e.g. starts its animation),
    // so the hovered card moves even when it isn't the selected one.
    const motion = new Gtk.EventControllerMotion()
    motion.connect('enter', () => {
      this._hoveredId = item.id
      this._refreshPreviewStates()
    })
    motion.connect('leave', () => {
      if (this._hoveredId === item.id) this._hoveredId = null
      this._refreshPreviewStates()
    })
    card.add_controller(motion)

    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
      marginTop: 10,
      marginBottom: 10,
      marginStart: 10,
      marginEnd: 10,
    })

    const preview = buildPreview?.(item) ?? this._buildPreview(item)
    if (isCardPreview(preview)) this._previewsById.set(item.id, preview)
    box.append(preview)

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

    // Per-card actions live in a standard GNOME three-dots menu
    // (`Gtk.MenuButton` + `Gio.Menu`) in the corner — not a bare trash
    // icon. Only deletable items get the menu (built-ins have no
    // actions). The `card.delete` action drives the host's confirm +
    // removal via `delete-requested`.
    if (item.deletable) {
      const menu = Gio.Menu.new()
      menu.append(this.deleteTooltip, 'card.delete')
      const menuButton = new Gtk.MenuButton({
        iconName: 'view-more-symbolic',
        tooltipText: _('More options'),
        cssClasses: ['flat', 'circular', 'card-gallery-menu'],
        halign: Gtk.Align.END,
        valign: Gtk.Align.START,
        marginTop: 6,
        marginEnd: 6,
        menuModel: menu,
      })
      const group = new Gio.SimpleActionGroup()
      const deleteAction = new Gio.SimpleAction({ name: 'delete' })
      deleteAction.connect('activate', () => this.emit('delete-requested', item.id))
      group.add_action(deleteAction)
      menuButton.insert_action_group('card', group)
      overlay.add_overlay(menuButton)
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

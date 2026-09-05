import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import { GalleryCard, type GalleryCardItem, type GalleryCardLabels } from './gallery-card.ts'

import Template from './card-gallery.blp'

GObject.type_ensure(GalleryCard.$gtype)

/**
 * Reusable, responsive grid of Adwaita cards — the single visual
 * vocabulary the Cast view (characters) and the Tiles view (tilesets)
 * share for listing their project entities. Each card ({@link GalleryCard})
 * carries a preview, a title + subtitle, an optional accent badge, and a
 * three-dots action menu.
 *
 * The widget is purely presentational: `setItems` rebuilds the grid,
 * `setActiveId` moves the selection ring, and user interaction surfaces
 * as signals the host wires to its controller:
 *
 * - `item-activated::<id>` — a card was clicked (select it).
 * - `item-opened::<id>` — a card was double-clicked or its menu's "open"
 *   chosen — open the full detail view.
 * - `rename-requested::<id>` / `delete-requested::<id>` — the host owns
 *   the prompt / confirm dialog and the actual mutation.
 * - `reorder-requested::<draggedId>::<targetId>` — only when `reorderable`.
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
  private _openLabel = _('Edit')
  private _renameLabel = _('Rename')
  private _reorderable = false
  private _activeId: string | null = null
  private _hoveredId: string | null = null
  /** Id of the card currently being dragged (drag-reorder), else null. */
  private _dragId: string | null = null
  /** Cards by item id, so `setActiveId` can move the selection ring. */
  private _cardsById = new Map<string, GalleryCard>()

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
          'open-label': GObject.ParamSpec.string(
            'open-label',
            'Open Label',
            "Label of the open/edit item in each card's three-dots menu",
            GObject.ParamFlags.READWRITE,
            _('Edit'),
          ),
          'rename-label': GObject.ParamSpec.string(
            'rename-label',
            'Rename Label',
            "Label of the rename item in each card's three-dots menu",
            GObject.ParamFlags.READWRITE,
            _('Rename'),
          ),
          reorderable: GObject.ParamSpec.boolean(
            'reorderable',
            'Reorderable',
            'Whether cards can be drag-reordered (emits `reorder-requested`)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
        Signals: {
          'item-activated': { param_types: [GObject.TYPE_STRING] },
          'item-opened': { param_types: [GObject.TYPE_STRING] },
          'rename-requested': { param_types: [GObject.TYPE_STRING] },
          'delete-requested': { param_types: [GObject.TYPE_STRING] },
          // Args: dragged card id, target card id. The host reorders +
          // persists; the gallery doesn't mutate its own model.
          'reorder-requested': { param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING] },
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
    this._applyLabels()
    this.notify('delete-tooltip')
  }

  get openLabel(): string {
    return this._openLabel ?? _('Edit')
  }

  set openLabel(value: string) {
    if (this._openLabel === value) return
    this._openLabel = value
    this._applyLabels()
    this.notify('open-label')
  }

  get renameLabel(): string {
    return this._renameLabel ?? _('Rename')
  }

  set renameLabel(value: string) {
    if (this._renameLabel === value) return
    this._renameLabel = value
    this._applyLabels()
    this.notify('rename-label')
  }

  get reorderable(): boolean {
    return this._reorderable ?? false
  }

  /**
   * Cards install their drag controllers unconditionally and read this
   * flag when a drag starts, so flipping it reaches cards that already
   * exist — setting it after `setItems` used to be a silent no-op.
   */
  set reorderable(value: boolean) {
    if (this._reorderable === value) return
    this._reorderable = value
    for (const card of this._cardsById.values()) card.reorderable = value
    this.notify('reorderable')
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
      const card = this._buildCard(item, buildPreview?.(item) ?? null)
      this._cardsById.set(item.id, card)
      this._flow.append(card)
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
    this._hoveredId = null
  }

  /**
   * Move the selection ring and tell each highlightable preview whether
   * its card is the active or hovered one, so only that card animates
   * (the rest stay static).
   */
  private _applyHighlight(): void {
    for (const [id, card] of this._cardsById) {
      card.selected = id === this._activeId
      card.preview?.setHighlighted(id === this._activeId || id === this._hoveredId)
    }
  }

  /** Push the current menu wording onto every live card. */
  private _applyLabels(): void {
    const labels = this._labels()
    for (const card of this._cardsById.values()) card.labels = labels
  }

  private _labels(): GalleryCardLabels {
    return { open: this.openLabel, rename: this.renameLabel, delete: this.deleteTooltip }
  }

  private _buildCard(item: GalleryCardItem, preview: Gtk.Widget | null): GalleryCard {
    const card = new GalleryCard(item, this._labels(), preview)
    card.connect('activated', () => this.emit('item-activated', item.id))
    card.connect('opened', () => this.emit('item-opened', item.id))
    card.connect('rename-requested', () => this.emit('rename-requested', item.id))
    card.connect('delete-requested', () => this.emit('delete-requested', item.id))
    card.connect('hover-changed', (_c: GalleryCard, hovered: boolean) => {
      if (hovered) this._hoveredId = item.id
      else if (this._hoveredId === item.id) this._hoveredId = null
      this._applyHighlight()
    })
    card.connect('reorder-requested', (_c: GalleryCard, draggedId: string) =>
      this.emit('reorder-requested', draggedId, item.id),
    )
    card.enableReorder(
      () => this._dragId,
      (id) => {
        this._dragId = id
      },
      () => {
        this._dragId = null
      },
    )
    card.reorderable = this._reorderable
    return card
  }
}

GObject.type_ensure(CardGallery.$gtype)

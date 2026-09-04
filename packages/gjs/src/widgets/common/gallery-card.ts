import Gdk from '@girs/gdk-4.0'
import Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Pango from '@girs/pango-1.0'
import { gettext as _ } from 'gettext'

/** Edge length (px) of a card's square preview area. */
const PREVIEW_SIZE = 96

/** Cap on the title/subtitle width so a long name can't widen a card. */
const LABEL_MAX_CHARS = 16

/** Milliseconds within which a second click counts as a double-click. */
const DOUBLE_CLICK_PRESSES = 2

/**
 * One entry rendered as a card by `CardGallery`. Presentational
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
  /** When true the card's menu offers "Rename", emitting `rename-requested`. */
  renamable?: boolean
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

export function isCardPreview(widget: Gtk.Widget): widget is CardPreview {
  return typeof (widget as Partial<CardPreview>).setHighlighted === 'function'
}

/** Menu-item wording, passed down from the gallery's translatable properties. */
export interface GalleryCardLabels {
  open: string
  rename: string
  delete: string
}

/**
 * One card in a {@link CardGallery}: a `card`-styled `Gtk.Button` (the
 * whole card is the click target) inside a `Gtk.Overlay` so the
 * three-dots action menu can float in the top-right corner. The overlay
 * child sits above the card button, so opening the menu never also
 * activates the card underneath.
 *
 * Everything the user does surfaces as a signal — the card never mutates
 * project data and never learns what the gallery does with the event.
 */
export class GalleryCard extends Gtk.Overlay {
  private _id = ''
  /** The card button, so the gallery can move the selection ring onto it. */
  private _button: Gtk.Button
  /** The preview widget when it can be told about highlight state, else null. */
  private _preview: CardPreview | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgGalleryCard',
        Signals: {
          activated: {},
          opened: {},
          'rename-requested': {},
          'delete-requested': {},
          // Pointer entered (`true`) or left (`false`) the card.
          'hover-changed': { param_types: [GObject.TYPE_BOOLEAN] },
          // A card was dropped onto this one; payload is the dragged id.
          'reorder-requested': { param_types: [GObject.TYPE_STRING] },
        },
      },
      GalleryCard,
    )
  }

  constructor(item: GalleryCardItem, labels: GalleryCardLabels, preview: Gtk.Widget | null) {
    super()
    this._id = item.id
    this._button = this._buildButton(item, preview ?? buildDefaultPreview(item))
    this.set_child(this._button)
    this.add_overlay(this._buildMenuButton(item, labels))
  }

  get id(): string {
    return this._id
  }

  /** The highlightable preview, or `null` when the preview can't animate. */
  get preview(): CardPreview | null {
    return this._preview
  }

  /** Mirror the design's selection ring via a style class on the card button. */
  set selected(value: boolean) {
    if (value) this._button.add_css_class('card-gallery-selected')
    else this._button.remove_css_class('card-gallery-selected')
  }

  /**
   * Make the card drag-reorderable: a `Gtk.DragSource` carrying the id
   * (string) + a `Gtk.DropTarget` that emits `reorder-requested` with the
   * dragged id on drop. Click vs drag is disambiguated by GTK's drag
   * threshold, so single-click select still works.
   */
  enableReorder(draggedId: () => string | null, onDragStart: (id: string) => void, onDragEnd: () => void): void {
    const dragSource = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE })
    dragSource.connect('prepare', () => {
      onDragStart(this._id)
      const value = new GObject.Value()
      value.init(GObject.TYPE_STRING)
      value.set_string(this._id)
      return Gdk.ContentProvider.new_for_value(value)
    })
    dragSource.connect('drag-begin', () => dragSource.set_icon(Gtk.WidgetPaintable.new(this._button), 0, 0))
    dragSource.connect('drag-end', () => onDragEnd())
    this._button.add_controller(dragSource)

    const dropTarget = Gtk.DropTarget.new(GObject.TYPE_STRING, Gdk.DragAction.MOVE)
    dropTarget.connect('drop', () => {
      const dragged = draggedId()
      if (dragged === null || dragged === this._id) return false
      this.emit('reorder-requested', dragged)
      return true
    })
    this._button.add_controller(dropTarget)
  }

  private _buildButton(item: GalleryCardItem, preview: Gtk.Widget): Gtk.Button {
    const card = new Gtk.Button({ cssClasses: ['card', 'card-gallery-card'] })
    card.connect('clicked', () => this.emit('activated'))
    // Double-click opens the detail view. A capture-phase gesture sees
    // the press before the button's own click gesture; we don't claim
    // it, so the single-click `activated` still fires.
    const dbl = new Gtk.GestureClick()
    dbl.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    dbl.connect('pressed', (_g: Gtk.GestureClick, nPress: number) => {
      if (nPress === DOUBLE_CLICK_PRESSES) this.emit('opened')
    })
    card.add_controller(dbl)

    // Hover highlights the card's preview (e.g. starts its animation),
    // so the hovered card moves even when it isn't the selected one.
    const motion = new Gtk.EventControllerMotion()
    motion.connect('enter', () => this.emit('hover-changed', true))
    motion.connect('leave', () => this.emit('hover-changed', false))
    card.add_controller(motion)

    if (isCardPreview(preview)) this._preview = preview
    card.set_child(this._buildBody(item, preview))
    return card
  }

  private _buildBody(item: GalleryCardItem, preview: Gtk.Widget): Gtk.Box {
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
      marginTop: 10,
      marginBottom: 10,
      marginStart: 10,
      marginEnd: 10,
    })
    box.append(preview)
    box.append(buildLabel(item.title, ['heading']))
    if (item.subtitle) box.append(buildLabel(item.subtitle, ['caption', 'dim-label']))
    if (item.badge) box.append(buildLabel(item.badge, ['caption', 'accent']))
    return box
  }

  /**
   * Per-card actions live in a standard GNOME three-dots menu
   * (`Gtk.MenuButton` + `Gio.Menu`) in the corner — not a bare trash
   * icon. "Edit" (→ open the detail page) is always offered; "Rename" and
   * "Delete" only for items that allow them (built-ins can't be removed).
   */
  private _buildMenuButton(item: GalleryCardItem, labels: GalleryCardLabels): Gtk.MenuButton {
    const menu = Gio.Menu.new()
    const group = new Gio.SimpleActionGroup()
    const add = (name: string, label: string, signal: string) => {
      menu.append(label, `card.${name}`)
      const action = new Gio.SimpleAction({ name })
      action.connect('activate', () => this.emit(signal))
      group.add_action(action)
    }
    add('open', labels.open, 'opened')
    if (item.renamable) add('rename', labels.rename, 'rename-requested')
    if (item.deletable) add('delete', labels.delete, 'delete-requested')

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
    menuButton.insert_action_group('card', group)
    return menuButton
  }
}

function buildLabel(text: string, cssClasses: string[]): Gtk.Label {
  return new Gtk.Label({
    label: text,
    halign: Gtk.Align.CENTER,
    ellipsize: Pango.EllipsizeMode.END,
    maxWidthChars: LABEL_MAX_CHARS,
    cssClasses,
  })
}

/**
 * Square preview cell. Uses a `Gtk.Picture` for a sprite/sheet paintable
 * (aspect-preserving, scales to fit), falling back to a symbolic
 * `Gtk.Image` when no paintable is available so a card is never blank.
 */
function buildDefaultPreview(item: GalleryCardItem): Gtk.Widget {
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
    frame.append(
      new Gtk.Image({
        iconName: item.fallbackIcon ?? 'image-missing-symbolic',
        pixelSize: Math.round(PREVIEW_SIZE / 2),
        hexpand: true,
        vexpand: true,
        cssClasses: ['dim-label'],
      }),
    )
  }
  return frame
}

GObject.type_ensure(GalleryCard.$gtype)

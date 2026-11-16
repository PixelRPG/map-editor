import Gdk from '@girs/gdk-4.0'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'

/** One entry of a row's context menu: a label and the `win.*` action it fires. */
export interface RowMenuItem {
  /** Already translated — the caller owns the msgid. */
  readonly label: string
  /** Fully qualified action name, e.g. `win.delete-character`. */
  readonly action: string
}

/**
 * The context menu shared by every row of one list — right-click on a
 * pointer, long-press on touch.
 *
 * ONE `Gtk.PopoverMenu` per list, not one per row: a popover is a
 * `GtkNative`, so it takes no part in its parent's layout and only needs
 * a parent to position against. It is re-pointed at the press position
 * and its model rebuilt with the pressed row's id as the action target,
 * so a row that is rebuilt (the roster is rebuilt on every change) never
 * leaves a stale menu behind.
 *
 * The gestures live on the rows and die with them; only the popover
 * outlives a rebuild, and the host drops it in `vfunc_unmap` — a
 * `set_parent`ed popover is a real child and has to be taken off by
 * hand, or the parent is finalized with children still attached.
 */
export class RowContextMenu {
  private _popover: Gtk.PopoverMenu | null = null

  constructor(
    private readonly _parent: Gtk.Widget,
    private readonly _items: readonly RowMenuItem[],
  ) {}

  /**
   * Make `row` open the menu for `id`. `select` runs first: every item is
   * targeted at `id`, but the row the user pressed should also become the
   * open one, so the detail and the menu never disagree.
   */
  attach(row: Gtk.Widget, id: string, select: () => void): void {
    const open = (x: number, y: number): void => {
      select()
      this._popup(row, id, x, y)
    }

    const longPress = new Gtk.GestureLongPress()
    longPress.connect('pressed', (_g: Gtk.GestureLongPress, x: number, y: number) => open(x, y))
    row.add_controller(longPress)

    const secondary = new Gtk.GestureClick({ button: Gdk.BUTTON_SECONDARY })
    secondary.connect('pressed', (_g: Gtk.GestureClick, _n: number, x: number, y: number) => open(x, y))
    row.add_controller(secondary)
  }

  /** Close and unparent the popover. Call from the host's `vfunc_unmap`. */
  dispose(): void {
    if (!this._popover) return
    if (this._popover.get_parent()) {
      this._popover.popdown()
      this._popover.unparent()
    }
    this._popover = null
  }

  private _popup(row: Gtk.Widget, id: string, x: number, y: number): void {
    const popover = this._ensurePopover()
    popover.set_menu_model(this._buildModel(id))
    const point = new Graphene.Point()
    point.init(x, y)
    const [ok, inParent] = row.compute_point(this._parent, point)
    if (!ok) return
    popover.set_pointing_to(
      new Gdk.Rectangle({ x: Math.round(inParent.x), y: Math.round(inParent.y), width: 1, height: 1 }),
    )
    popover.popup()
  }

  private _buildModel(id: string): Gio.Menu {
    const menu = new Gio.Menu()
    for (const item of this._items) {
      const entry = Gio.MenuItem.new(item.label, null)
      entry.set_action_and_target_value(item.action, GLib.Variant.new_string(id))
      menu.append_item(entry)
    }
    return menu
  }

  private _ensurePopover(): Gtk.PopoverMenu {
    if (this._popover) return this._popover
    const popover = new Gtk.PopoverMenu({ hasArrow: false })
    popover.set_parent(this._parent)
    this._popover = popover
    return popover
  }
}

import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'

/**
 * Shared base for the Library's chip pages (Characters / Graphics). The
 * host `LibraryView` owns the mode rail, the header and the window's
 * shared sidebar state; a page only needs to know whether the window
 * is narrow, because that is what collapses its own master-detail
 * split (`Adw.NavigationSplitView` / `Adw.OverlaySplitView`) into a
 * drill-down and re-homes a pinned inspector into a bottom sheet.
 *
 * Abstract in practice: it carries no template. A page with no split
 * to collapse (Things) does not extend it — an unused property is a
 * promise nobody keeps.
 */
export class LibraryPage extends Adw.Bin {
  private _inspectorCollapsed = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgLibraryPage',
        Properties: {
          'inspector-collapsed': GObject.ParamSpec.boolean(
            'inspector-collapsed',
            'Inspector Collapsed',
            "Whether the page's own split should collapse to a drill-down (responsive breakpoint)",
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      LibraryPage,
    )
  }

  /**
   * Hook fired after `inspector-collapsed` changes — default no-op.
   * Graphics overrides it to re-home its tile inspector between the
   * desktop sidebar and the phone bottom sheet.
   */
  protected _onInspectorCollapsedChanged(_collapsed: boolean): void {}

  get inspectorCollapsed(): boolean {
    return this._inspectorCollapsed
  }

  set inspectorCollapsed(value: boolean) {
    if (this._inspectorCollapsed === value) return
    this._inspectorCollapsed = value
    this.notify('inspector-collapsed')
    this._onInspectorCollapsedChanged(value)
  }
}

GObject.type_ensure(LibraryPage.$gtype)

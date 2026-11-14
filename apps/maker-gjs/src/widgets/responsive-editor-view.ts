import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'

/**
 * Signal surface {@link ResponsiveEditorView} hands its subclasses.
 *
 * The base registers no signal of its own since the rail's
 * `mode-changed` went away with the rail, but the subclasses that DO
 * register signals still layer theirs on this alias, so adding one here
 * later reaches all of them at once.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own
 * signals now has to spell them out — `SignalMethods` refines the
 * inherited method rather than replacing it at run time.
 */
export type ResponsiveEditorViewSignals = Adw.Bin.SignalSignatures

/**
 * Shared base for the shell editor views (World / Library / Game) and
 * the map editor. They all expose the same responsive-shell contract to
 * the application window — the `show-inspector` / `inspector-collapsed`
 * properties the window binds and the breakpoints drive, a `compact`
 * flag the phone breakpoint sets, and a `full-view` tier. This base owns
 * that machinery so the views don't each repeat it; per-view
 * side-effects hook in via `_onInspectorCollapsedChanged`.
 *
 * Abstract in practice: it carries no template — each subclass supplies
 * its own `.blp`. Views that have no inspector (Game) simply leave the
 * inherited inspector properties unused.
 */
export class ResponsiveEditorView extends Adw.Bin {
  /**
   * The header's `Adw.ViewSwitcher`, bound by the templates of the three
   * shell views. The map editor has no shell navigation, so its template
   * declares none and {@link attachShellSwitcher} is a no-op there.
   */
  declare _view_switcher?: Adw.ViewSwitcher

  private _showInspector = false
  private _inspectorCollapsed = false
  private _compact = false
  private _fullView = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgResponsiveEditorView',
        Properties: {
          'show-inspector': GObject.ParamSpec.boolean(
            'show-inspector',
            'Show Inspector',
            'Whether the right inspector sidebar is visible (shared across views)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'inspector-collapsed': GObject.ParamSpec.boolean(
            'inspector-collapsed',
            'Inspector Collapsed',
            'Whether the inspector should auto-overlay (responsive breakpoint)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          compact: GObject.ParamSpec.boolean(
            'compact',
            'Compact',
            'Whether the window is at the phone tier, where the shell destinations move to the window\u2019s bottom switcher bar and the header shows the page title instead',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full view',
            'Whether the view renders everything (Full view) or the Simple-view subset — pushed from the app tier',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      ResponsiveEditorView,
    )
  }

  /**
   * Point the header switcher at the window's shell stack.
   *
   * A plain method rather than a property binding because `shell_stack`
   * lives in the window's own template: a Blueprint `bind` cannot cross
   * a template boundary, so the window calls this once per shell view
   * after construction.
   */
  attachShellSwitcher(stack: Adw.ViewStack): void {
    if (this._view_switcher) this._view_switcher.stack = stack
  }

  /**
   * Hook fired after `inspector-collapsed` changes — default no-op.
   * Views with a quick-view sidebar or a reparenting inspector override
   * it (e.g. Cast/Tiles hide the quick-view; Tiles also re-homes its
   * inspector between the desktop sidebar and the phone bottom sheet).
   */
  protected _onInspectorCollapsedChanged(_collapsed: boolean): void {}

  /**
   * Hook fired after `full-view` changes — default no-op. A view whose
   * widgets have no template binding to reach (a components editor built
   * in code) pushes the tier into them here.
   */
  protected _onFullViewChanged(_fullView: boolean): void {}

  /** Hook fired after `compact` changes — default no-op. */
  protected _onCompactChanged(_compact: boolean): void {}

  get fullView(): boolean {
    return this._fullView
  }

  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this.notify('full-view')
    this._onFullViewChanged(value)
  }

  get compact(): boolean {
    return this._compact
  }

  set compact(value: boolean) {
    if (this._compact === value) return
    this._compact = value
    this.notify('compact')
    this._onCompactChanged(value)
  }

  get showInspector(): boolean {
    return this._showInspector
  }

  set showInspector(value: boolean) {
    if (this._showInspector === value) return
    this._showInspector = value
    this.notify('show-inspector')
  }

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

GObject.type_ensure(ResponsiveEditorView.$gtype)

import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type { EditorMode, ModeRail } from '@pixelrpg/gjs'

/**
 * Shared base for the mode-rail editor views (Atlas / Cast / Tiles /
 * Scene-editor / Data). They all expose the same responsive-shell
 * contract to the application window — the `show-library` /
 * `library-collapsed` (+ `show-inspector` / `inspector-collapsed`)
 * properties the window binds + the breakpoints drive, a `syncActiveMode`
 * to highlight the rail, and a `mode-changed` signal re-emitted from the
 * rail. This base owns that machinery so the ~5 views don't each repeat
 * it; per-view side-effects hook in via `_onInspectorCollapsedChanged`.
 *
 * Abstract in practice: it carries no template — each subclass supplies
 * its own `.blp` (with a `mode_rail` InternalChild) and re-emits
 * `mode-changed` from it. Views that have no inspector (Data) simply
 * leave the inherited inspector properties unused.
 */
export class ResponsiveEditorView extends Adw.Bin {
  // Bound by each subclass's template (its `mode_rail` InternalChild).
  declare _mode_rail: ModeRail

  private _showLibrary = false
  private _showInspector = false
  private _libraryCollapsed = false
  private _inspectorCollapsed = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgResponsiveEditorView',
        Properties: {
          'show-library': GObject.ParamSpec.boolean(
            'show-library',
            'Show Library',
            'Whether the left mode-rail sidebar is visible (shared across views)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'show-inspector': GObject.ParamSpec.boolean(
            'show-inspector',
            'Show Inspector',
            'Whether the right inspector sidebar is visible (shared across views)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'library-collapsed': GObject.ParamSpec.boolean(
            'library-collapsed',
            'Library Collapsed',
            'Whether the mode rail should auto-overlay (responsive breakpoint)',
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
        },
        Signals: {
          'mode-changed': { param_types: [GObject.TYPE_STRING] },
        },
      },
      ResponsiveEditorView,
    )
  }

  /** Highlight the ModeRail's active row (called when the host changes view). */
  syncActiveMode(mode: EditorMode): void {
    this._mode_rail.activeMode = mode
  }

  /**
   * Hook fired after `inspector-collapsed` changes — default no-op.
   * Views with a quick-view sidebar or a reparenting inspector override
   * it (e.g. Cast/Tiles hide the quick-view; Tiles also re-homes its
   * inspector between the desktop sidebar and the phone bottom sheet).
   */
  protected _onInspectorCollapsedChanged(_collapsed: boolean): void {}

  get showLibrary(): boolean {
    return this._showLibrary
  }

  set showLibrary(value: boolean) {
    if (this._showLibrary === value) return
    this._showLibrary = value
    this.notify('show-library')
  }

  get showInspector(): boolean {
    return this._showInspector
  }

  set showInspector(value: boolean) {
    if (this._showInspector === value) return
    this._showInspector = value
    this.notify('show-inspector')
  }

  get libraryCollapsed(): boolean {
    return this._libraryCollapsed
  }

  set libraryCollapsed(value: boolean) {
    if (this._libraryCollapsed === value) return
    this._libraryCollapsed = value
    this.notify('library-collapsed')
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

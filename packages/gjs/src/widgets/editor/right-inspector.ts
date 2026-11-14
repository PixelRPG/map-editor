import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import { LayersPage } from './layers-page'
import { ObjectsTab } from './objects-tab'
import { SelectedPage } from './selected-page'
import Template from './right-inspector.blp'
import { TilesTab } from './tiles-tab'

GObject.type_ensure(TilesTab.$gtype)
GObject.type_ensure(LayersPage.$gtype)
GObject.type_ensure(ObjectsTab.$gtype)
GObject.type_ensure(SelectedPage.$gtype)

/**
 * Right-side inspector for the scene editor.
 *
 * Hosts an `Adw.ViewStack` + `Adw.ViewSwitcherBar` with four pages:
 * **Tiles**, **Layers**, **Objects**, **Props**. Each tab is exposed as
 * a property so the application shell can populate it (tiles, stamps,
 * layer list, object placements, scene metadata).
 */
export class RightInspector extends Adw.Bin {
  declare _stack: Adw.ViewStack
  declare _tiles_tab: TilesTab
  declare _layers_page: LayersPage
  declare _objects_tab: ObjectsTab
  declare _selected_page: SelectedPage

  private _collapsed = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgRightInspector',
        Template,
        InternalChildren: ['stack', 'tiles_tab', 'layers_page', 'objects_tab', 'selected_page'],
        Properties: {
          'visible-page': GObject.ParamSpec.string(
            'visible-page',
            'Visible Page',
            'Name of the active tab (tiles, layers, objects, props)',
            GObject.ParamFlags.READWRITE,
            'tiles',
          ),
          // Mirrors the parent view's `inspector-collapsed` — drives
          // the visibility of the in-overlay close button. See
          // `docs/concepts/responsive-chrome.md` § "In-overlay close
          // affordance".
          collapsed: GObject.ParamSpec.boolean(
            'collapsed',
            'Collapsed',
            'Whether the inspector is in overlay-drawer mode (narrow widths)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      RightInspector,
    )
  }

  get tilesTab(): TilesTab {
    return this._tiles_tab
  }

  get layersPage(): LayersPage {
    return this._layers_page
  }

  get objectsTab(): ObjectsTab {
    return this._objects_tab
  }

  get selectedPage(): SelectedPage {
    return this._selected_page
  }

  get visiblePage(): string {
    return this._stack.get_visible_child_name() ?? 'tiles'
  }

  set visiblePage(value: string) {
    this._stack.set_visible_child_name(value)
    this.notify('visible-page')
  }

  get collapsed(): boolean {
    return this._collapsed
  }

  set collapsed(value: boolean) {
    if (this._collapsed === value) return
    this._collapsed = value
    this.notify('collapsed')
  }
}

GObject.type_ensure(RightInspector.$gtype)

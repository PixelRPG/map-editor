import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import { LayersTab } from './layers-tab'
import { ObjectsTab } from './objects-tab'
import { PropsTab } from './props-tab'
import { TilesTab } from './tiles-tab'

import Template from './right-inspector.blp'

GObject.type_ensure(TilesTab.$gtype)
GObject.type_ensure(LayersTab.$gtype)
GObject.type_ensure(ObjectsTab.$gtype)
GObject.type_ensure(PropsTab.$gtype)

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
  declare _layers_tab: LayersTab
  declare _objects_tab: ObjectsTab
  declare _props_tab: PropsTab

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgRightInspector',
        Template,
        InternalChildren: ['stack', 'tiles_tab', 'layers_tab', 'objects_tab', 'props_tab'],
        Properties: {
          'visible-page': GObject.ParamSpec.string(
            'visible-page',
            'Visible Page',
            'Name of the active tab (tiles, layers, objects, props)',
            GObject.ParamFlags.READWRITE,
            'tiles',
          ),
        },
      },
      RightInspector,
    )
  }

  get tilesTab(): TilesTab {
    return this._tiles_tab
  }

  get layersTab(): LayersTab {
    return this._layers_tab
  }

  get objectsTab(): ObjectsTab {
    return this._objects_tab
  }

  get propsTab(): PropsTab {
    return this._props_tab
  }

  get visiblePage(): string {
    return this._stack.get_visible_child_name() ?? 'tiles'
  }

  set visiblePage(value: string) {
    this._stack.set_visible_child_name(value)
    this.notify('visible-page')
  }
}

GObject.type_ensure(RightInspector.$gtype)

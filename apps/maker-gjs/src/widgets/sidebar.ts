import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'

import { MapEditorPanel, LayersWidget } from '@pixelrpg/ui-gjs'
import { MapData } from '@pixelrpg/data-core'
import { SpriteSheet } from '@pixelrpg/data-gjs'

import Template from './sidebar.blp'

export class Sidebar extends Adw.Bin {
  // GObject internal children
  declare _mapEditorPanel: MapEditorPanel

  static {
    GObject.registerClass(
      {
        GTypeName: 'Sidebar',
        Template,
        InternalChildren: ['mapEditorPanel'],
      },
      this,
    )
  }

  constructor(params: Partial<Adw.Bin.ConstructorProps>) {
    super(params)
  }

  /**
   * Initialize the sidebar with map data including tilesets and layers
   * @param mapData The map data containing layers and sprite set references
   * @param spriteSheets Array of loaded sprite sheets
   */
  initializeMapData(mapData: MapData, spriteSheets: SpriteSheet[]): void {
    console.log(
      '[Sidebar] Initializing map data:',
      mapData.name,
      'with',
      spriteSheets.length,
      'sprite sheets',
    )

    // Pass the map data to the MapEditorPanel
    this._mapEditorPanel.initializeMapData(mapData, spriteSheets)
  }
}
// WORKAROUND: Make sure the MapEditorPanel is registered before the Sidebar, try fixed by import order?
GObject.type_ensure(MapEditorPanel.$gtype)

GObject.type_ensure(Sidebar.$gtype)

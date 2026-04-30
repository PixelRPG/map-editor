import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type { MapData } from '@pixelrpg/engine'
import { type GdkSpriteSheet, MapEditorPanel, SignalScope } from '@pixelrpg/gjs'

import Template from './sidebar.blp'

export class Sidebar extends Adw.Bin {
  // GObject internal children
  declare _mapEditorPanel: MapEditorPanel

  /**
   * Get access to the map editor panel
   */
  get mapEditorPanel(): MapEditorPanel {
    return this._mapEditorPanel
  }

  private signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'Sidebar',
        Template,
        InternalChildren: ['mapEditorPanel'],
        Signals: {
          'tile-selected': {
            param_types: [GObject.TYPE_INT], // tileId
          },
          'tool-changed': {
            param_types: [GObject.TYPE_STRING], // tool ('brush' | 'eraser')
          },
          'layer-selected': {
            param_types: [GObject.TYPE_STRING], // layerId
          },
        },
      },
      Sidebar,
    )
  }

  /**
   * Initialize the sidebar with map data including tilesets and layers
   * @param mapData The map data containing layers and sprite set references
   * @param spriteSheets Array of loaded sprite sheets
   */
  initializeMapData(mapData: MapData, spriteSheets: GdkSpriteSheet[]): void {
    console.log('[Sidebar] Initializing map data:', mapData.name, 'with', spriteSheets.length, 'sprite sheets')

    // Pass the map data to the MapEditorPanel
    this._mapEditorPanel.initializeMapData(mapData, spriteSheets)
  }

  /**
   * Handle tile selection from map editor panel
   */
  private _onTileSelected(_mapEditorPanel: MapEditorPanel, tileId: number): void {
    console.log('[Sidebar] Tile selected:', tileId)
    this.emit('tile-selected', tileId)
  }

  /**
   * Handle layer selection from map editor panel
   */
  private _onLayerSelected(_mapEditorPanel: MapEditorPanel, layerId: string): void {
    console.log('[Sidebar] Layer selected:', layerId)
    this.emit('layer-selected', layerId)
  }

  /**
   * Handle tool change from map editor panel
   */
  private _onToolChanged(_mapEditorPanel: MapEditorPanel, tool: string): void {
    console.log('[Sidebar] Tool changed:', tool)
    this.emit('tool-changed', tool)
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._mapEditorPanel, 'tile-selected', this._onTileSelected.bind(this))
    this.signals.connect(this._mapEditorPanel, 'tool-changed', this._onToolChanged.bind(this))
    this.signals.connect(this._mapEditorPanel, 'layer-selected', this._onLayerSelected.bind(this))
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }
}
// WORKAROUND: Make sure the MapEditorPanel is registered before the Sidebar, try fixed by import order?
GObject.type_ensure(MapEditorPanel.$gtype)

GObject.type_ensure(Sidebar.$gtype)

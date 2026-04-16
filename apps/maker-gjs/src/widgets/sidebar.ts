import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'

import { MapEditorPanel, SpriteSheet } from '@pixelrpg/gjs'
import { MapData } from '@pixelrpg/engine'

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

  // Signal management
  private _signalHandlers: number[] = []

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

  /**
   * Handle tile selection from map editor panel
   */
  private _onTileSelected(
    mapEditorPanel: MapEditorPanel,
    tileId: number,
  ): void {
    console.log('[Sidebar] Tile selected:', tileId)
    this.emit('tile-selected', tileId)
  }

  /**
   * Handle layer selection from map editor panel
   */
  private _onLayerSelected(
    mapEditorPanel: MapEditorPanel,
    layerId: string,
  ): void {
    console.log('[Sidebar] Layer selected:', layerId)
    this.emit('layer-selected', layerId)
  }

  /**
   * Handle tool change from map editor panel
   */
  private _onToolChanged(mapEditorPanel: MapEditorPanel, tool: string): void {
    console.log('[Sidebar] Tool changed:', tool)
    this.emit('tool-changed', tool)
  }

  /**
   * Connect signals when widget becomes visible (GTK 4 lifecycle pattern)
   */
  vfunc_map(): void {
    super.vfunc_map()

    if (this._signalHandlers.length === 0) {
      // Connect map editor panel signals
      const tileHandlerId = this._mapEditorPanel.connect(
        'tile-selected',
        this._onTileSelected.bind(this),
      )
      this._signalHandlers.push(tileHandlerId)

      const toolHandlerId = this._mapEditorPanel.connect(
        'tool-changed',
        this._onToolChanged.bind(this),
      )
      this._signalHandlers.push(toolHandlerId)

      const layerHandlerId = this._mapEditorPanel.connect(
        'layer-selected',
        this._onLayerSelected.bind(this),
      )
      this._signalHandlers.push(layerHandlerId)
    }
  }

  /**
   * Disconnect signals when widget becomes invisible (GC-safe cleanup)
   */
  vfunc_unmap(): void {
    if (this._signalHandlers.length > 0) {
      // Disconnect all signal handlers from map editor panel
      for (const handlerId of this._signalHandlers) {
        if (handlerId > 0) {
          this._mapEditorPanel.disconnect(handlerId)
        }
      }
      this._signalHandlers = []
    }

    super.vfunc_unmap()
  }
}
// WORKAROUND: Make sure the MapEditorPanel is registered before the Sidebar, try fixed by import order?
GObject.type_ensure(MapEditorPanel.$gtype)

GObject.type_ensure(Sidebar.$gtype)

import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { TilesetSelector } from './tileset-selector'
import { LayerSelector, LayersWidget } from './layer-selector'
import { SpriteSheet } from '@pixelrpg/data-gjs'
import { MapData } from '@pixelrpg/data-core'

import Template from './map-editor-panel.blp'

export class MapEditorPanel extends Adw.Bin {
  // GObject internal children
  declare _tilesetSelector: TilesetSelector
  declare _layerSelector: LayerSelector
  declare _stack: Adw.ViewStack
  declare _viewSwitcherBar: Adw.ViewSwitcherBar

  static {
    GObject.registerClass(
      {
        GTypeName: 'MapEditorPanel',
        Template,
        InternalChildren: [
          'tilesetSelector',
          'layerSelector',
          'stack',
          'viewSwitcherBar',
        ],
      },
      this,
    )
  }

  constructor(params: Partial<Adw.Bin.ConstructorProps>) {
    super(params)
  }

  /**
   * Initialize the map editor panel with map data including tilesets and layers
   * @param mapData The map data containing layers and sprite set references
   * @param spriteSheets Array of loaded sprite sheets
   */
  initializeMapData(mapData: MapData, spriteSheets: SpriteSheet[]): void {
    console.log(
      '[MapEditorPanel] Initializing with map:',
      mapData.name || mapData.id,
    )
    console.log(
      '[MapEditorPanel] Available sprite sheets:',
      spriteSheets.length,
    )
    console.log('[MapEditorPanel] Map layers:', mapData.layers.length)

    // Set the tilesets (sprite sheets)
    this.setTilesets(spriteSheets)

    // Create a simple layers widget from the map data
    const layersWidget = this._createLayersWidget(mapData)
    this.setLayers(layersWidget)
  }

  /**
   * Create a simple layers widget from map data
   * This is a temporary implementation until we have proper layer widgets
   * @param mapData The map data
   * @returns A simple widget representing the layers
   */
  private _createLayersWidget(mapData: MapData): LayersWidget {
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
    })

    // Add a label for each layer
    for (const layer of mapData.layers) {
      const label = new Gtk.Label({
        label: `${layer.name} (${layer.type})`,
        xalign: 0,
      })
      box.append(label)
    }

    return box
  }

  /**
   * @deprecated Use initializeMapData instead
   * Add a single tileset to the selector
   * @param spriteSheet The sprite sheet to add as a tileset
   * @param name Optional name for the tileset section
   */
  addTileset(spriteSheet: SpriteSheet, name?: string): void {
    this._tilesetSelector.addTileset(spriteSheet, name)
  }

  /**
   * Set multiple tilesets at once
   * @param tilesets Array of sprite sheets to display as tilesets
   */
  setTilesets(tilesets: SpriteSheet[]): void {
    this._tilesetSelector.tilesets = tilesets
  }

  /**
   * Set the layers widget for layer selection
   * @param layers The layers widget to set
   */
  setLayers(layers: LayersWidget) {
    this._layerSelector.setLayers(layers)
  }

  /**
   * Get the ViewStack for external control (e.g., ViewSwitcherBar)
   * @returns The internal ViewStack
   */
  get stack(): Adw.ViewStack {
    return this._stack
  }
}

GObject.type_ensure(MapEditorPanel.$gtype)

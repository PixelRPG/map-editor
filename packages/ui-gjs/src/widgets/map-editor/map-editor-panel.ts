import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { TilesetSelector } from './tileset-selector'
import { LayerSelector, LayersWidget } from './layer-selector'
import { SpriteSheet } from '@pixelrpg/data-gjs'

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
   * Clear all tilesets
   */
  clearTilesets(): void {
    this._tilesetSelector.clearTilesets()
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

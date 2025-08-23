import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import { TilesetSelector } from './tileset-selector'
import { LayerSelector, LayersWidget } from './layer-selector'
import { SpriteSheetWidget } from '../sprite/sprite-sheet.widget'

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
   * Set the sprite sheet widget for tileset selection
   * @param tileset The sprite sheet widget to set
   */
  setSpriteSheet(tileset: SpriteSheetWidget) {
    this._tilesetSelector.setSpriteSheet(tileset)
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
